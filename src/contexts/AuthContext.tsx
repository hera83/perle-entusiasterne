// MUST be first import – patches storage before Supabase reads from it (hosted mode only)
if (import.meta.env.VITE_BACKEND_MODE !== 'local') {
  // Side-effect import: patches Supabase auth storage synchronously
  // In local mode this is a no-op because the real supabase client isn't used for auth
  import('@/lib/patch-supabase-auth');
}

import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { db } from '@/services/db';

const isLocalMode = import.meta.env.VITE_BACKEND_MODE === 'local';
const REFRESH_INTERVAL_MS = 55 * 60 * 1000; // 55 minutes - safe for 60-minute tokens

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  verifySession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);
  const wasLoggedInRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshRef = useRef<number>(Date.now());

  const checkAdminRole = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await db
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin role:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Error in checkAdminRole:', err);
      return false;
    }
  };

  const performRefresh = useCallback(async () => {
    if (isRefreshingRef.current || isLocalMode) return;
    isRefreshingRef.current = true;

    try {
      const { error } = await db.auth.refreshSession();
      if (error) {
        console.error('Session refresh failed:', error.message);
      }
    } catch (err) {
      console.error('Error refreshing session:', err);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (isLocalMode) return; // Local mode uses long-lived tokens

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    refreshTimerRef.current = setTimeout(() => {
      performRefresh();
    }, REFRESH_INTERVAL_MS);

    lastRefreshRef.current = Date.now();
  }, [performRefresh]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = db.auth.onAuthStateChange(
      (event: string, session: any) => {
        if (!isMounted) return;

        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            sessionRef.current = session;
            scheduleRefresh();
          }
          return;
        }

        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') return;

        if (event === 'SIGNED_IN' && session?.user) {
          wasLoggedInRef.current = true;
          if (currentUserIdRef.current !== session.user.id) {
            currentUserIdRef.current = session.user.id;
            sessionRef.current = session;
            setUser(session.user);
            scheduleRefresh();
            checkAdminRole(session.user.id).then(result => {
              if (isMounted) setIsAdmin(result);
            });
          } else {
            sessionRef.current = session;
            scheduleRefresh();
          }
        }
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await db.auth.getSession();

        if (!isLocalMode) {
          await db.auth.stopAutoRefresh();
        }

        if (!isMounted) return;

        sessionRef.current = session ?? null;
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;

        if (session?.user) {
          wasLoggedInRef.current = true;
          scheduleRefresh();
          const adminResult = await checkAdminRole(session.user.id);
          if (isMounted) setIsAdmin(adminResult);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    const handleVisibilityChange = () => {
      if (isLocalMode) return;
      if (document.visibilityState === 'visible' && sessionRef.current) {
        const elapsed = Date.now() - lastRefreshRef.current;
        if (elapsed > 5 * 60 * 1000) {
          performRefresh();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleRefresh, performRefresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error, data } = await db.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data?.user) {
      const { data: profile } = await db
        .from('profiles')
        .select('is_banned')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        await db.auth.signOut();
        currentUserIdRef.current = null;
        sessionRef.current = null;
        setUser(null);
        setIsAdmin(false);
        return { error: new Error('Din konto er midlertidigt spærret. Kontakt en administrator for at blive låst op igen.') };
      }
    }

    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    currentUserIdRef.current = null;
    sessionRef.current = null;
    wasLoggedInRef.current = false;
    setUser(null);
    setIsAdmin(false);

    try {
      await db.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    }
  }, []);

  const verifySession = useCallback(async (): Promise<boolean> => {
    const { data: { session } } = await db.auth.getSession();
    if (session) return true;

    currentUserIdRef.current = null;
    sessionRef.current = null;
    setUser(null);
    setIsAdmin(false);
    return false;
  }, []);

  const contextValue = useMemo(() => ({
    user,
    session: sessionRef.current,
    loading,
    isAdmin,
    signIn,
    signOut,
    verifySession,
  }), [user, loading, isAdmin, signIn, signOut, verifySession]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

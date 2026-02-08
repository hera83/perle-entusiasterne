import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

  const checkAdminRole = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
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
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Session refresh failed:', error.message);
      }
      // TOKEN_REFRESHED event handler takes care of the rest
    } catch (err) {
      console.error('Error refreshing session:', err);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const scheduleRefresh = useCallback((session: Session) => {
    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!session.expires_at) return;

    const expiresAt = session.expires_at * 1000; // seconds -> ms
    const now = Date.now();
    const refreshIn = expiresAt - now - 60_000; // 60 sec before expiry

    if (refreshIn <= 0) {
      // Already expired or very close - refresh immediately
      performRefresh();
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      performRefresh();
    }, refreshIn);
  }, [performRefresh]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // TOKEN_REFRESHED: update ref and reschedule, no re-render needed
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            sessionRef.current = session;
            scheduleRefresh(session);
          }
          return;
        }

        // INITIAL_SESSION is handled by initializeAuth below
        if (event === 'INITIAL_SESSION') return;

        // SIGNED_OUT: IGNORE completely
        // We only clear user state via the explicit signOut() function.
        if (event === 'SIGNED_OUT') {
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          wasLoggedInRef.current = true;
          if (currentUserIdRef.current !== session.user.id) {
            currentUserIdRef.current = session.user.id;
            sessionRef.current = session;
            setUser(session.user);
            scheduleRefresh(session);
            checkAdminRole(session.user.id).then(result => {
              if (isMounted) setIsAdmin(result);
            });
          } else {
            // Same user, just update session ref and reschedule
            sessionRef.current = session;
            scheduleRefresh(session);
          }
        }
      }
    );

    // INITIAL load (controls loading state)
    const initializeAuth = async () => {
      try {
        // STOP Supabase's built-in auto-refresh to prevent token storms
        supabase.auth.stopAutoRefresh();

        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        sessionRef.current = session ?? null;
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;

        if (session?.user) {
          wasLoggedInRef.current = true;
          scheduleRefresh(session);
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleRefresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    // Clear refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Clear ALL auth-related state DIRECTLY
    currentUserIdRef.current = null;
    sessionRef.current = null;
    wasLoggedInRef.current = false;
    setUser(null);
    setIsAdmin(false);

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    }
  }, []);

  const verifySession = useCallback(async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return true;

    // Session is truly gone - clear state
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

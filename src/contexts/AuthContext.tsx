import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { cleanupAutoRefresh } from '@/lib/supabase-auth-config';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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
  const refreshTimerRef = useRef<number | null>(null);

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

  // Controlled refresh timer - replaces Supabase's internal auto-refresh
  const scheduleRefresh = useCallback((session: Session) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Calculate when token expires
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt === 0) return;

    // Refresh 5 minutes before expiry (minimum 30 seconds)
    const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 30000);

    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) {
          // Schedule next refresh with the new token
          scheduleRefresh(data.session);
        }
        // If refresh fails: user will see "session expired" next time they try something
      } catch (err) {
        console.error('Error refreshing session:', err);
      }
    }, refreshIn);
  }, []);

  useEffect(() => {
    let isMounted = true;

    // autoRefreshToken is already set to false via the supabase-auth-config import
    // (runs synchronously at module load, before React renders)

    // Listener for ONGOING auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // TOKEN_REFRESHED: update ref and reschedule timer, no re-render
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            sessionRef.current = session;
            scheduleRefresh(session);
          }
          return;
        }

        // INITIAL_SESSION is handled by initializeAuth below
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          const wasLoggedIn = wasLoggedInRef.current;
          wasLoggedInRef.current = false;
          currentUserIdRef.current = null;
          sessionRef.current = null;
          setUser(null);
          setIsAdmin(false);

          // Clear refresh timer
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
          }

          // Show message only if user didn't sign out voluntarily
          if (wasLoggedIn) {
            toast.error('Du er blevet logget ud. Dine seneste ændringer er muligvis ikke gemt.');
          }
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          wasLoggedInRef.current = true;
          // Only update state if it's actually a different user
          if (currentUserIdRef.current !== session.user.id) {
            currentUserIdRef.current = session.user.id;
            sessionRef.current = session;
            setUser(session.user);
            scheduleRefresh(session);
            checkAdminRole(session.user.id).then(result => {
              if (isMounted) setIsAdmin(result);
            });
          } else {
            // Same user, just update session ref and schedule refresh
            sessionRef.current = session;
            scheduleRefresh(session);
          }
        }
      }
    );

    // INITIAL load (controls loading)
    const initializeAuth = async () => {
      try {
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
        refreshTimerRef.current = null;
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
    wasLoggedInRef.current = false; // Prevent "unexpected logout" message
    // Clear refresh timer before signing out
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    await supabase.auth.signOut();
    setIsAdmin(false);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    session: sessionRef.current,
    loading,
    isAdmin,
    signIn,
    signOut,
  }), [user, loading, isAdmin, signIn, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

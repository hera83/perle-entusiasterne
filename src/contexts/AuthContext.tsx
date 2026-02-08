import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  useEffect(() => {
    let isMounted = true;

    // Listener for ONGOING auth changes
    // Supabase's built-in autoRefreshToken handles token refresh automatically.
    // We only react to state changes here — no manual refresh scheduling.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // TOKEN_REFRESHED: update ref only, no re-render needed
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            sessionRef.current = session;
          }
          return;
        }

        // INITIAL_SESSION is handled by initializeAuth below
        if (event === 'INITIAL_SESSION') return;

        // SIGNED_OUT: IGNORER FULDSTÆNDIGT
        // Vi rydder KUN brugerstate via den eksplicitte signOut() funktion.
        // Dette gør appen immun over for Supabase-klientens interne SIGNED_OUT events
        // (fx fra token reuse detection, failed refresh, rate limiting).
        if (event === 'SIGNED_OUT') {
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          wasLoggedInRef.current = true;
          if (currentUserIdRef.current !== session.user.id) {
            currentUserIdRef.current = session.user.id;
            sessionRef.current = session;
            setUser(session.user);
            checkAdminRole(session.user.id).then(result => {
              if (isMounted) setIsAdmin(result);
            });
          } else {
            // Same user, just update session ref
            sessionRef.current = session;
          }
        }
      }
    );

    // INITIAL load (controls loading state)
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        sessionRef.current = session ?? null;
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;

        if (session?.user) {
          wasLoggedInRef.current = true;
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
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    // Ryd ALLE auth-relaterede state DIREKTE - vi stoler ikke på SIGNED_OUT event
    currentUserIdRef.current = null;
    sessionRef.current = null;
    wasLoggedInRef.current = false;
    setUser(null);
    setIsAdmin(false);

    // Kald Supabase signOut (state er allerede ryddet, SIGNED_OUT event ignoreres)
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    }
  }, []);

  const verifySession = useCallback(async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return true;

    // Session er virkelig væk - ryd state
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

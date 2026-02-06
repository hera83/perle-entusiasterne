import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Info, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Indtast en gyldig email'),
  password: z.string().min(6, 'Adgangskode skal være mindst 6 tegn'),
});

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFirstAdmin, setShowFirstAdmin] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  // Check if there are any users using RPC function (bypasses RLS)
  useEffect(() => {
    const checkForUsers = async () => {
      try {
        const { data, error } = await supabase.rpc('has_any_users');

        if (!error && data === false) {
          setShowFirstAdmin(true);
        }
      } catch (err) {
        console.error('Error checking for users:', err);
      } finally {
        setCheckingUsers(false);
      }
    };

    checkForUsers();
  }, []);

  // Redirect if already logged in (simple render check, no useEffect race)
  if (user && !authLoading) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Forkert email eller adgangskode');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Din email er ikke bekræftet. Tjek din indbakke.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      toast.success('Du er nu logget ind');
      navigate('/');

      // Sync favorites AFTER navigation with delay to avoid concurrent auth calls
      setTimeout(() => syncFavoritesOnLogin(), 2000);
    } catch (err) {
      setError('Der opstod en uventet fejl');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const syncFavoritesOnLogin = async () => {
    try {
      const localFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (localFavorites.length === 0) return;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Single bulk upsert instead of N individual requests
      await supabase
        .from('user_favorites')
        .upsert(
          localFavorites.map((patternId: string) => ({
            user_id: currentUser.id,
            pattern_id: patternId,
          })),
          { onConflict: 'user_id,pattern_id' }
        );

      // Clear localStorage favorites
      localStorage.removeItem('favorites');
    } catch (err) {
      console.error('Error syncing favorites:', err);
    }
  };

  const handleFirstAdminSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Indtast venligst dit navn');
      return;
    }

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName.trim(),
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        // Update display name in profile
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('user_id', data.user.id);

        // Assign admin role to first user
        await supabase
          .from('user_roles')
          .insert({
            user_id: data.user.id,
            role: 'admin',
          });

        toast.success('Administrator-konto oprettet! Du kan nu logge ind.');
        
        // Auto sign-in the user
        const { error: signInError } = await signIn(email, password);
        if (!signInError) {
          navigate('/');
        } else {
          setShowFirstAdmin(false);
        }
      }
    } catch (err) {
      setError('Der opstod en uventet fejl');
      console.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingUsers) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-md mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {showFirstAdmin ? 'Opret første administrator' : 'Log ind'}
            </CardTitle>
            <CardDescription>
              {showFirstAdmin
                ? 'Der er ingen brugere endnu. Opret den første administrator-konto.'
                : 'Indtast dine loginoplysninger for at få adgang til WorkShop og Administration.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showFirstAdmin && (
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Den første bruger bliver automatisk administrator med fuld adgang.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={showFirstAdmin ? handleFirstAdminSignup : handleSubmit}>
              <div className="space-y-4">
                {showFirstAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="displayName">
                      Navn
                      <span className="text-muted-foreground text-xs ml-1">
                        (Dit fulde navn)
                      </span>
                    </Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="Dit navn"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email
                    <span className="text-muted-foreground text-xs ml-1">
                      (Din arbejds- eller personlige email)
                    </span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="din@email.dk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    Adgangskode
                    <span className="text-muted-foreground text-xs ml-1">
                      (Mindst 6 tegn)
                    </span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {showFirstAdmin ? 'Opret administrator' : 'Log ind'}
                </Button>
              </div>
            </form>

            {!showFirstAdmin && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Har du ikke en konto? Kontakt din administrator for at få oprettet en.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Login;

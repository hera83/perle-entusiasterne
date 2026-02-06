import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UserPlus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface User {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
  role: 'admin' | 'user' | null;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching profiles:', error);
        return;
      }

      // Fetch roles for each user
      const usersWithRoles: User[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .maybeSingle();

          return {
            ...profile,
            role: (roleData?.role as 'admin' | 'user') || null,
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName,
          },
        },
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      if (authData.user) {
        // Update display name in profile
        await supabase
          .from('profiles')
          .update({ display_name: displayName })
          .eq('user_id', authData.user.id);

        // Assign role
        await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role,
          });

        toast.success('Bruger oprettet! Brugeren kan nu logge ind.');
        setDialogOpen(false);
        resetForm();
        fetchUsers();
      }
    } catch (err) {
      console.error('Error creating user:', err);
      toast.error('Kunne ikke oprette bruger');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      // First try to update existing role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });
      }

      toast.success('Rolle opdateret');
      fetchUsers();
    } catch (err) {
      console.error('Error updating role:', err);
      toast.error('Kunne ikke opdatere rolle');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Note: We can only delete profile, not auth user (that requires admin API)
      // The auth user will remain but profile will be deleted
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      toast.success('Bruger slettet');
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Kunne ikke slette bruger');
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setRole('user');
    setEditingUser(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bruger-administration</CardTitle>
            <CardDescription>
              Opret, rediger og slet brugere. Tildel roller og rettigheder.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <UserPlus className="h-4 w-4 mr-2" />
                Opret bruger
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Opret ny bruger</DialogTitle>
                <DialogDescription>
                  Udfyld oplysningerne for den nye bruger.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Navn</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Brugerens navn"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="bruger@email.dk"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Adgangskode</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mindst 6 tegn"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rolle</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'user')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Bruger</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Annuller
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Opret
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Ingen brugere endnu</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Oprettet</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.display_name || 'Unavngivet'}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role || 'user'}
                      onValueChange={(v) => handleUpdateRole(user.user_id, v as 'admin' | 'user')}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Bruger</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {format(new Date(user.created_at), 'd. MMM yyyy', { locale: da })}
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Slet bruger?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Er du sikker på, at du vil slette {user.display_name}? 
                            Denne handling kan ikke fortrydes.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuller</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteUser(user.user_id)}
                            className="bg-destructive"
                          >
                            Slet
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

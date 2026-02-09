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
import { Loader2, UserPlus, Pencil, Trash2, KeyRound, Ban, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface User {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
  role: 'admin' | 'user' | null;
  last_sign_in_at: string | null;
  email: string | null;
  is_banned: boolean;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Create form state
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'user'>('user');
  const [formLoading, setFormLoading] = useState(false);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editLoading, setEditLoading] = useState(false);

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, created_at, is_banned')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching profiles:', error);
        return;
      }

      // Fetch roles
      const userIds = (profiles || []).map(p => p.user_id);
      const { data: allRoles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      const roleMap = new Map(
        (allRoles || []).map(r => [r.user_id, r.role])
      );

      // Fetch last_sign_in_at and email from edge function
      let authMap: Record<string, { last_sign_in_at: string | null; email: string | null }> = {};
      try {
        const { data, error: fnError } = await supabase.functions.invoke('admin-manage-user', {
          body: { action: 'list-users' },
        });
        if (!fnError && data?.users) {
          authMap = data.users;
        }
      } catch (e) {
        console.error('Error fetching auth data:', e);
      }

      const usersWithData: User[] = (profiles || []).map(profile => ({
        ...profile,
        role: (roleMap.get(profile.user_id) as 'admin' | 'user') || null,
        last_sign_in_at: authMap[profile.user_id]?.last_sign_in_at || null,
        email: authMap[profile.user_id]?.email || null,
      }));

      setUsers(usersWithData);
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
      const response = await supabase.functions.invoke('create-user', {
        body: { email: createEmail, password: createPassword, displayName: createDisplayName, role: createRole },
      });

      if (response.error) {
        toast.error(response.error.message || 'Kunne ikke oprette bruger');
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      toast.success('Bruger oprettet!');
      setCreateDialogOpen(false);
      resetCreateForm();
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      toast.error('Kunne ikke oprette bruger');
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditEmail(user.email || '');
    setEditRole(user.role || 'user');
    setNewPassword('');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setEditLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'update-user',
          userId: editingUser.user_id,
          email: editEmail || undefined,
          displayName: editDisplayName,
          role: editRole,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Kunne ikke opdatere bruger');
        return;
      }

      toast.success('Bruger opdateret');
      setEditDialogOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
      toast.error('Kunne ikke opdatere bruger');
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser || !newPassword) return;
    setResetLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'reset-password',
          userId: editingUser.user_id,
          newPassword,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Kunne ikke nulstille adgangskode');
        return;
      }

      toast.success('Adgangskode nulstillet');
      setNewPassword('');
    } catch (err) {
      console.error('Error resetting password:', err);
      toast.error('Kunne ikke nulstille adgangskode');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'delete-user', userId },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Kunne ikke slette bruger');
        return;
      }

      toast.success('Bruger slettet');
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Kunne ikke slette bruger');
    }
  };

  const resetCreateForm = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateDisplayName('');
    setCreateRole('user');
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
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetCreateForm}>
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
                    <Label htmlFor="createDisplayName">Navn</Label>
                    <Input
                      id="createDisplayName"
                      value={createDisplayName}
                      onChange={(e) => setCreateDisplayName(e.target.value)}
                      placeholder="Brugerens navn"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="createEmail">Email</Label>
                    <Input
                      id="createEmail"
                      type="email"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="bruger@email.dk"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="createPassword">Adgangskode</Label>
                    <Input
                      id="createPassword"
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Mindst 6 tegn"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="createRole">Rolle</Label>
                    <Select value={createRole} onValueChange={(v) => setCreateRole(v as 'admin' | 'user')}>
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
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
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
                <TableHead>Oprettet</TableHead>
                <TableHead>Sidst logget ind</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.display_name || 'Unavngivet'}</span>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                        {user.role === 'admin' ? 'Admin' : 'Bruger'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(user.created_at), 'd. MMM yyyy', { locale: da })}
                  </TableCell>
                  <TableCell>
                    {user.last_sign_in_at
                      ? format(new Date(user.last_sign_in_at), 'd. MMM yyyy HH:mm', { locale: da })
                      : 'Aldrig'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEdit(user)}
                        title="Rediger bruger"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Slet bruger">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediger bruger</DialogTitle>
            <DialogDescription>
              Opdater brugerens oplysninger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">Navn</Label>
              <Input
                id="editDisplayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Brugerens navn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="bruger@email.dk"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">Rolle</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as 'admin' | 'user')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Bruger</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Nulstil adgangskode
              </Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ny adgangskode (mindst 6 tegn)"
                  minLength={6}
                />
                <Button
                  variant="outline"
                  onClick={handleResetPassword}
                  disabled={resetLoading || !newPassword || newPassword.length < 6}
                >
                  {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Nulstil'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuller
            </Button>
            <Button onClick={handleSaveEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gem ændringer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Loader2, Plus, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface Announcement {
  id: string;
  title: string;
  content: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export const AnnouncementManagement: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching announcements:', error);
        return;
      }

      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const announcementData = {
        title,
        content,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        is_active: isActive,
      };

      if (editingAnnouncement) {
        const { error } = await supabase
          .from('announcements')
          .update(announcementData)
          .eq('id', editingAnnouncement.id);

        if (error) throw error;
        toast.success('Besked opdateret');
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert(announcementData);

        if (error) throw error;
        toast.success('Besked oprettet');
      }

      setDialogOpen(false);
      resetForm();
      fetchAnnouncements();
    } catch (err) {
      console.error('Error saving announcement:', err);
      toast.error('Kunne ikke gemme besked');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setTitle(announcement.title);
    setContent(announcement.content);
    setStartDate(announcement.start_date.split('T')[0]);
    setEndDate(announcement.end_date.split('T')[0]);
    setIsActive(announcement.is_active);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Besked slettet');
      fetchAnnouncements();
    } catch (err) {
      console.error('Error deleting announcement:', err);
      toast.error('Kunne ikke slette besked');
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setStartDate('');
    setEndDate('');
    setIsActive(true);
    setEditingAnnouncement(null);
  };

  const isCurrentlyActive = (announcement: Announcement) => {
    const now = new Date();
    const start = new Date(announcement.start_date);
    const end = new Date(announcement.end_date);
    return announcement.is_active && now >= start && now <= end;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Besked-administration</CardTitle>
            <CardDescription>
              Opret beskeder som vises i galleriet i en bestemt periode.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Ny besked
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingAnnouncement ? 'Rediger besked' : 'Opret ny besked'}
                </DialogTitle>
                <DialogDescription>
                  Beskeden vises som en popup i galleriet i den angivne periode.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titel</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Vigtig meddelelse"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Indhold</Label>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Skriv din besked her..."
                      rows={4}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start dato</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">Slut dato</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="isActive"
                      checked={isActive}
                      onCheckedChange={setIsActive}
                    />
                    <Label htmlFor="isActive">Aktiv</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Annuller
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingAnnouncement ? 'Opdater' : 'Opret'}
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
        ) : announcements.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Ingen beskeder endnu</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((announcement) => (
                <TableRow key={announcement.id}>
                  <TableCell className="font-medium">{announcement.title}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(announcement.start_date), 'd. MMM', { locale: da })} 
                    {' - '}
                    {format(new Date(announcement.end_date), 'd. MMM yyyy', { locale: da })}
                  </TableCell>
                  <TableCell>
                    {isCurrentlyActive(announcement) ? (
                      <Badge className="bg-green-500">Aktiv nu</Badge>
                    ) : announcement.is_active ? (
                      <Badge variant="secondary">Planlagt</Badge>
                    ) : (
                      <Badge variant="outline">Inaktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(announcement)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Slet besked?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Er du sikker på, at du vil slette denne besked?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuller</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(announcement.id)}
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
    </Card>
  );
};

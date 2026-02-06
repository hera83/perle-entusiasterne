import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Info } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
}

export const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content')
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString())
        .lte('start_date', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Filter out already dismissed announcements from this session
        const sessionDismissed = sessionStorage.getItem('dismissed_announcements');
        const dismissedSet: Set<string> = sessionDismissed 
          ? new Set(JSON.parse(sessionDismissed) as string[]) 
          : new Set();
        setDismissed(dismissedSet);
        
        const filteredAnnouncements = data.filter(a => !dismissedSet.has(a.id));
        setAnnouncements(filteredAnnouncements);
      }
    };

    fetchAnnouncements();
  }, []);

  const handleDismiss = () => {
    const current = announcements[currentIndex];
    if (current) {
      const newDismissed = new Set(dismissed);
      newDismissed.add(current.id);
      setDismissed(newDismissed);
      sessionStorage.setItem('dismissed_announcements', JSON.stringify([...newDismissed]));
    }
    setCurrentIndex(prev => prev + 1);
  };

  const currentAnnouncement = announcements[currentIndex];

  if (!currentAnnouncement) {
    return null;
  }

  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            {currentAnnouncement.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base whitespace-pre-wrap">
            {currentAnnouncement.content}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleDismiss}>
            Forstået
            {currentIndex < announcements.length - 1 && (
              <span className="ml-2 text-xs opacity-70">
                ({announcements.length - currentIndex - 1} mere)
              </span>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

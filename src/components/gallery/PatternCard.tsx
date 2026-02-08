import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Heart, Eye, RotateCcw, Pencil, Trash2, Calendar, User, Grid3X3, Hash, Lock, Globe, FileDown, Loader2 } from 'lucide-react';
import { generatePatternPdf } from '@/lib/generatePatternPdf';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { PatternPreview } from './PatternPreview';
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
import { toast } from 'sonner';

interface Pattern {
  id: string;
  title: string;
  category_id: string | null;
  category_name: string | null;
  created_at: string;
  user_id: string;
  creator_name: string | null;
  plate_width: number;
  plate_height: number;
  plate_dimension: number;
  total_beads: number;
  is_public?: boolean;
  thumbnail?: string | null;
}

interface PatternCardProps {
  pattern: Pattern;
  onOpen: () => void;
  onDelete?: () => void;
}

export const PatternCard: React.FC<PatternCardProps> = ({ pattern, onOpen, onDelete }) => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isFavorite, setIsFavorite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalPlates, setTotalPlates] = useState(0);
  const [completedPlates, setCompletedPlates] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const canEdit = isAdmin || (user && user.id === pattern.user_id);
  const canDelete = isAdmin;

  useEffect(() => {
    checkFavorite();
    refreshProgress();
  }, [pattern.id, user?.id]);

  const checkFavorite = async () => {
    if (user) {
      const { data } = await supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('pattern_id', pattern.id)
        .maybeSingle();
      setIsFavorite(!!data);
    } else {
      const localFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      setIsFavorite(localFavorites.includes(pattern.id));
    }
  };

  const refreshProgress = async () => {
    const total = pattern.plate_width * pattern.plate_height;
    setTotalPlates(total);

    if (user) {
      const { data } = await supabase
        .from('user_progress')
        .select('completed_plates')
        .eq('user_id', user.id)
        .eq('pattern_id', pattern.id)
        .maybeSingle();

      if (data) {
        const completed = Array.isArray(data.completed_plates) 
          ? data.completed_plates.length 
          : 0;
        setCompletedPlates(completed);
        setProgress((completed / total) * 100);
      } else {
        setCompletedPlates(0);
        setProgress(0);
      }
    } else {
      const local = localStorage.getItem(`progress_${pattern.id}`);
      if (local) {
        const parsed = JSON.parse(local);
        const completed = parsed.completed?.length || 0;
        setCompletedPlates(completed);
        setProgress((completed / total) * 100);
      } else {
        setCompletedPlates(0);
        setProgress(0);
      }
    }
  };

  const toggleFavorite = async () => {
    if (user) {
      if (isFavorite) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('pattern_id', pattern.id);
      } else {
        await supabase
          .from('user_favorites')
          .insert({ user_id: user.id, pattern_id: pattern.id });
      }
    } else {
      const localFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (isFavorite) {
        const updated = localFavorites.filter((id: string) => id !== pattern.id);
        localStorage.setItem('favorites', JSON.stringify(updated));
      } else {
        localFavorites.push(pattern.id);
        localStorage.setItem('favorites', JSON.stringify(localFavorites));
      }
    }
    setIsFavorite(!isFavorite);
  };

  const handleReset = async () => {
    if (user) {
      await supabase
        .from('user_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('pattern_id', pattern.id);
    }
    localStorage.removeItem(`progress_${pattern.id}`);
    setCompletedPlates(0);
    setProgress(0);
    toast.success('Progress nulstillet');
  };

  const handleEdit = () => {
    navigate(`/workshop/${pattern.id}`);
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await generatePatternPdf({
        id: pattern.id,
        title: pattern.title,
        category_name: pattern.category_name,
        creator_name: pattern.creator_name,
        plate_width: pattern.plate_width,
        plate_height: pattern.plate_height,
        plate_dimension: pattern.plate_dimension,
        total_beads: pattern.total_beads,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from('bead_patterns')
      .delete()
      .eq('id', pattern.id);

    if (error) {
      toast.error('Kunne ikke slette opskriften');
    } else {
      toast.success('Opskrift slettet');
      onDelete?.();
    }
  };

  const isNew = (Date.now() - new Date(pattern.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow">
      <CardHeader className="p-3 pb-1">
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base line-clamp-1">{pattern.title}</CardTitle>
              {pattern.is_public === false && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              {isNew && (
                <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 leading-4">Ny</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {pattern.category_name && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {pattern.category_name}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFavorite}
            className={`h-7 w-7 ${isFavorite ? 'text-red-500 hover:text-red-600' : ''}`}
            title={isFavorite ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-1 pb-1">
        <div className="grid grid-cols-2 gap-3">
          {/* Preview */}
          <div className="aspect-square bg-muted rounded-md overflow-hidden">
            <PatternPreview thumbnail={pattern.thumbnail} />
          </div>

          {/* Metadata */}
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {pattern.is_public === false ? (
                <>
                  <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Privat</span>
                </>
              ) : (
                <>
                  <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Offentlig</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {format(new Date(pattern.created_at), 'd. MMM yyyy', { locale: da })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{pattern.creator_name || 'Ukendt'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Grid3X3 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{pattern.plate_width}x{pattern.plate_height} plader</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{pattern.total_beads.toLocaleString('da-DK')} perler</span>
            </div>

            {/* Progress */}
            <div className="pt-1">
              <div className="flex justify-between text-[10px] mb-0.5">
                <span>Progress</span>
                <span>{completedPlates}/{totalPlates}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between gap-1 pt-2">
        <div className="flex gap-1">
          <Button size="sm" onClick={onOpen} className="h-7 text-xs px-2">
            <Eye className="h-3.5 w-3.5 mr-1" />
            Åben
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Nulstil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Nulstil progress?</AlertDialogTitle>
                <AlertDialogDescription>
                  Er du sikker på, at du vil nulstille din progress for denne opskrift? 
                  Dette kan ikke fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuller</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Nulstil</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleDownloadPdf} 
            disabled={isGeneratingPdf}
            className="h-7 text-xs px-2"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 mr-1" />
            )}
            PDF
          </Button>
        </div>

        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={handleEdit} className="h-7 w-7 p-0">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="h-7 w-7 p-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slet opskrift?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Er du sikker på, at du vil slette "{pattern.title}"? 
                      Dette kan ikke fortrydes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuller</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                      Slet
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
};

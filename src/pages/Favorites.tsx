import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PatternCard } from '@/components/gallery/PatternCard';
import { PatternDialog } from '@/components/gallery/PatternDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Heart } from 'lucide-react';
import { Navigate } from 'react-router-dom';

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
  is_public: boolean;
  thumbnail?: string | null;
}

export const Favorites: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFavorites();
    }
  }, [user?.id]);

  const fetchFavorites = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: favorites, error: favError } = await supabase
        .from('user_favorites')
        .select('pattern_id')
        .eq('user_id', user.id);

      if (favError || !favorites?.length) {
        setPatterns([]);
        setLoading(false);
        return;
      }

      const patternIds = favorites.map(f => f.pattern_id);

      const { data, error } = await supabase
        .from('bead_patterns')
        .select(`
          id,
          title,
          category_id,
          created_at,
          user_id,
          plate_width,
          plate_height,
          plate_dimension,
          total_beads,
          is_public,
          thumbnail,
          categories(name),
          profiles(display_name)
        `)
        .in('id', patternIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching patterns:', error);
        return;
      }

      const mappedPatterns: Pattern[] = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        category_id: p.category_id,
        category_name: p.categories?.name || null,
        created_at: p.created_at,
        user_id: p.user_id,
        creator_name: p.profiles?.display_name || 'Ukendt',
        plate_width: p.plate_width,
        plate_height: p.plate_height,
        plate_dimension: p.plate_dimension,
        total_beads: p.total_beads,
        is_public: p.is_public,
        thumbnail: p.thumbnail,
      }));

      setPatterns(mappedPatterns);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPattern = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setDialogOpen(true);
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <div className="container px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Heart className="h-8 w-8 text-destructive fill-current" />
          <div>
            <h1 className="text-3xl font-bold">Mine favoritter</h1>
            <p className="text-muted-foreground">
              Dine gemte perleplade-opskrifter
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Henter favoritter...</span>
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-12">
            <Heart className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">
              Du har ingen favoritter endnu.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Tryk på hjertet på en opskrift for at tilføje den til dine favoritter.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {patterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onOpen={() => handleOpenPattern(pattern)}
                onDelete={fetchFavorites}
              />
            ))}
          </div>
        )}

        <PatternDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          pattern={selectedPattern}
        />
      </div>
    </Layout>
  );
};

export default Favorites;

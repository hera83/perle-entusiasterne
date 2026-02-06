import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SearchBar } from '@/components/gallery/SearchBar';
import { PatternCard } from '@/components/gallery/PatternCard';
import { PatternDialog } from '@/components/gallery/PatternDialog';
import { CategoryFilter } from '@/components/gallery/CategoryFilter';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

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
  thumbnail: string | null;
}

export const Gallery: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const userId = user?.id;
  const fetchPatterns = useCallback(async (query?: string, categoryId?: string | null) => {
    setLoading(true);
    try {
      let request = supabase
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
        .order('created_at', { ascending: false });

      if (isAdmin) {
        // Admins see everything
      } else if (userId) {
        request = request.or(`is_public.eq.true,user_id.eq.${userId}`);
      } else {
        request = request.eq('is_public', true);
      }

      if (query) {
        request = request.ilike('title', `%${query}%`);
      }

      if (categoryId) {
        request = request.eq('category_id', categoryId);
      }

      const isSearching = !!(query || categoryId);
      const { data, error } = await request.limit(isSearching ? 50 : 3);

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
        thumbnail: p.thumbnail || null,
      }));

      setPatterns(mappedPatterns);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query) {
      setHasSearched(true);
    }
    fetchPatterns(query, selectedCategory);
  };

  const handleCategoryChange = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    fetchPatterns(searchQuery, categoryId);
  };

  const handleOpenPattern = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setDialogOpen(true);
  };

  const handleRefresh = () => {
    fetchPatterns(searchQuery, selectedCategory);
  };

  return (
    <Layout showAnnouncements>
      <div className="container px-4 py-8">
        {/* Search section */}
        <div
          className={`search-transition ${
            hasSearched
              ? 'mb-8'
              : 'min-h-[50vh] flex flex-col items-center justify-center'
          }`}
        >
          <div className={`w-full max-w-2xl mx-auto ${!hasSearched && 'text-center'}`}>
            {!hasSearched && (
              <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2">Perle Entusiasterne</h1>
                <p className="text-muted-foreground text-lg">
                  Søg i vores samling af perleplade-opskrifter
                </p>
              </div>
            )}
            <SearchBar onSearch={handleSearch} initialValue={searchQuery} />
            {hasSearched && (
              <div className="mt-4">
                <CategoryFilter
                  selectedCategory={selectedCategory}
                  onCategoryChange={handleCategoryChange}
                />
              </div>
            )}
          </div>
        </div>

        {/* Results section */}
        {!hasSearched && !loading && patterns.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Nyeste opskrifter</h2>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Henter opskrifter...</span>
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              {hasSearched
                ? 'Ingen opskrifter matcher din søgning'
                : 'Ingen opskrifter endnu'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {patterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onOpen={() => handleOpenPattern(pattern)}
                onDelete={handleRefresh}
              />
            ))}
          </div>
        )}

        {/* Pattern Dialog */}
        <PatternDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          pattern={selectedPattern}
          onProgressChange={handleRefresh}
        />
      </div>
    </Layout>
  );
};

export default Gallery;

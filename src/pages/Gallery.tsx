import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SearchBar } from '@/components/gallery/SearchBar';
import { PatternCard } from '@/components/gallery/PatternCard';
import { PatternDialog } from '@/components/gallery/PatternDialog';
import { CategoryFilter } from '@/components/gallery/CategoryFilter';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ITEMS_PER_PAGE = 10;

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
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const userId = user?.id;

  const fetchPatterns = useCallback(async (query?: string, categoryId?: string | null, page: number = 1) => {
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
        `, { count: 'exact' })
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

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await request.range(from, to);

      if (error) {
        console.error('Error fetching patterns:', error);
        return;
      }

      setTotalCount(count || 0);

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
    fetchPatterns('', null, 1);
  }, [fetchPatterns]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    fetchPatterns(query, selectedCategory, 1);
  };

  const handleCategoryChange = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
    fetchPatterns(searchQuery, categoryId, 1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPatterns(searchQuery, selectedCategory, page);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOpenPattern = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setDialogOpen(true);
  };

  const handleRefresh = () => {
    fetchPatterns(searchQuery, selectedCategory, currentPage);
  };

  const renderPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <Layout showAnnouncements>
      <div className="container px-4 py-4">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold mb-1">Perle Entusiasterne</h1>
          <p className="text-muted-foreground">
            Find inspiration, del glæde og perl med perler
          </p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-4">
          <SearchBar onSearch={handleSearch} initialValue={searchQuery} />
        </div>

        {/* Category filter - always visible */}
        <div className="mb-6">
          <CategoryFilter
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
          />
        </div>

        {/* Results */}
        <div ref={resultsRef}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Henter opskrifter...</span>
            </div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                {searchQuery || selectedCategory
                  ? 'Ingen opskrifter matcher din søgning'
                  : 'Ingen opskrifter endnu'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {patterns.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    onOpen={() => handleOpenPattern(pattern)}
                    onDelete={handleRefresh}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Forrige
                    </Button>

                    {renderPageNumbers().map((page, idx) =>
                      page === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          className="w-9 h-9 p-0"
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </Button>
                      )
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="gap-1"
                    >
                      Næste
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Side {currentPage} af {totalPages}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

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

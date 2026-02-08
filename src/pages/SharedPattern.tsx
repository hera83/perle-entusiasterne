import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BeadPlateView } from '@/components/gallery/BeadPlateView';
import { PatternPreview } from '@/components/gallery/PatternPreview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, ArrowLeft, Grid3X3, Hash, User, Loader2, Download } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { generatePatternPdfFromData } from '@/lib/generatePatternPdf';
import type { PatternData, PlateData, ColorInfo } from '@/lib/generatePatternPdf';

interface SharedPatternData {
  pattern: {
    id: string;
    title: string;
    category_name: string | null;
    creator_name: string;
    plate_width: number;
    plate_height: number;
    plate_dimension: number;
    total_beads: number;
    thumbnail: string | null;
  };
  plates: Array<{
    row_index: number;
    column_index: number;
    beads: any;
  }>;
  colors: Array<{
    id: string;
    hex_color: string;
    name: string;
    code: string;
  }>;
}

const SharedPattern: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [data, setData] = useState<SharedPatternData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRow, setCurrentRow] = useState(1);
  const [currentPlate, setCurrentPlate] = useState(1);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | undefined>();
  const beadContainerRef = useRef<HTMLDivElement>(null);

  // Measure bead container
  useEffect(() => {
    const el = beadContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (shareToken) {
      fetchSharedPattern();
    }
  }, [shareToken]);

  const fetchSharedPattern = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-shared-pattern?share_token=${shareToken}`,
        {
          headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setError('Opskriften blev ikke fundet. Linket er muligvis ugyldigt.');
        } else {
          setError('Der opstod en fejl ved hentning af opskriften.');
        }
        setLoading(false);
        return;
      }

      const json = await response.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching shared pattern:', err);
      setError('Der opstod en fejl ved hentning af opskriften.');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPlateBeads = () => {
    if (!data) return [];
    const plate = data.plates.find(
      (p) => p.row_index === currentRow - 1 && p.column_index === currentPlate - 1
    );
    return plate?.beads || [];
  };

  const colorMap = React.useMemo(() => {
    if (!data) return new Map();
    return new Map(
      data.colors.map((c) => [c.id, { hex_color: c.hex_color, name: c.name, code: c.code }])
    );
  }, [data]);

  const canGoPrev = currentRow > 1 || currentPlate > 1;
  const canGoNext = data && (currentRow < data.pattern.plate_height || currentPlate < data.pattern.plate_width);

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!data) return;

    if (direction === 'next') {
      if (currentPlate < data.pattern.plate_width) {
        setCurrentPlate(currentPlate + 1);
      } else if (currentRow < data.pattern.plate_height) {
        setCurrentRow(currentRow + 1);
        setCurrentPlate(1);
      }
    } else {
      if (currentPlate > 1) {
        setCurrentPlate(currentPlate - 1);
      } else if (currentRow > 1) {
        setCurrentRow(currentRow - 1);
        setCurrentPlate(data.pattern.plate_width);
      }
    }
  };

  const totalPlates = data ? data.pattern.plate_width * data.pattern.plate_height : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Henter opskrift...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-lg">{error || 'Opskriften blev ikke fundet.'}</p>
        <Link to="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Gå til Galleriet
          </Button>
        </Link>
      </div>
    );
  }

  const { pattern } = data;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Gå til Galleriet
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">Perle Entusiasterne</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Pattern info */}
      <div className="container px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Title and metadata */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{pattern.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {pattern.category_name && (
                <Badge variant="secondary">{pattern.category_name}</Badge>
              )}
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                <span>{pattern.creator_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Grid3X3 className="h-4 w-4" />
                <span>{pattern.plate_width}x{pattern.plate_height} plader</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Hash className="h-4 w-4" />
                <span>{pattern.total_beads?.toLocaleString('da-DK')} perler</span>
              </div>
            </div>
          </div>

          {/* Main content - thumbnail + bead view */}
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
            {/* Sidebar: thumbnail + navigation info */}
            <div className="space-y-4">
              {pattern.thumbnail && (
                <div className="rounded-lg overflow-hidden border bg-muted">
                  <PatternPreview thumbnail={pattern.thumbnail} />
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2 text-sm">Pladeinfo</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Række: {currentRow} af {pattern.plate_height}</p>
                  <p>Plade: {currentPlate} af {pattern.plate_width}</p>
                  <p>Total plader: {totalPlates}</p>
                  <p>Pladestørrelse: {pattern.plate_dimension}x{pattern.plate_dimension}</p>
                </div>
              </div>

              <Button onClick={handleDownloadPdf} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </div>

            {/* Bead plate view */}
            <div className="space-y-4">
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigate('prev')}
                  disabled={!canGoPrev}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Forrige
                </Button>
                <span className="text-sm font-medium">
                  Række {currentRow}, Plade {currentPlate}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigate('next')}
                  disabled={!canGoNext}
                  className="gap-1"
                >
                  Næste
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Bead grid */}
              <div
                ref={beadContainerRef}
                className="overflow-auto flex items-center justify-center border rounded-lg bg-card p-4"
                style={{ minHeight: '400px' }}
              >
                <BeadPlateView
                  beads={getCurrentPlateBeads()}
                  colors={colorMap}
                  dimension={pattern.plate_dimension}
                  containerSize={containerSize}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t py-4">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Perle Entusiasterne
        </div>
      </footer>
    </div>
  );
};

export default SharedPattern;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BeadPlateView } from './BeadPlateView';
import { PatternPreview } from './PatternPreview';
import { toast } from 'sonner';

interface Pattern {
  id: string;
  title: string;
  category_name: string | null;
  plate_width: number;
  plate_height: number;
  plate_dimension: number;
  thumbnail?: string | null;
}

interface PatternDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: Pattern | null;
  onProgressChange?: () => void;
}

interface PlatePosition {
  row: number;
  plate: number;
}

export const PatternDialog: React.FC<PatternDialogProps> = ({
  open,
  onOpenChange,
  pattern,
  onProgressChange,
}) => {
  const { user } = useAuth();
  const [currentPosition, setCurrentPosition] = useState<PlatePosition>({ row: 1, plate: 1 });
  const [completedPlates, setCompletedPlates] = useState<string[]>([]);
  const [plateData, setPlateData] = useState<any>(null);
  const [colors, setColors] = useState<Map<string, { hex_color: string; name: string; code: string }>>(new Map());
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | undefined>();
  const beadContainerRef = useRef<HTMLDivElement>(null);

  const totalPlates = pattern ? pattern.plate_width * pattern.plate_height : 0;
  const currentPlateKey = `${currentPosition.row}-${currentPosition.plate}`;

  // Measure bead container with ResizeObserver
  useEffect(() => {
    const el = beadContainerRef.current;
    if (!el || !open) return;

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
  }, [open]);

  // Load progress and colors on open, then navigate to first incomplete plate
  useEffect(() => {
    if (open && pattern) {
      setInitialLoadDone(false);
      loadProgressAndNavigate();
      loadColors();
    }
  }, [open, pattern]);

  // Load plate data when position changes
  useEffect(() => {
    if (open && pattern && initialLoadDone) {
      loadPlateData();
    }
  }, [currentPosition, initialLoadDone]);

  const loadProgressAndNavigate = async () => {
    if (!pattern) return;

    let completed: string[] = [];
    let savedPosition: PlatePosition | null = null;

    if (user) {
      const { data } = await supabase
        .from('user_progress')
        .select('completed_plates, current_row, current_plate')
        .eq('user_id', user.id)
        .eq('pattern_id', pattern.id)
        .maybeSingle();

      if (data) {
        completed = (data.completed_plates as string[]) || [];
        savedPosition = { row: data.current_row || 1, plate: data.current_plate || 1 };
      }
    } else {
      const local = localStorage.getItem(`progress_${pattern.id}`);
      if (local) {
        const parsed = JSON.parse(local);
        completed = parsed.completed || [];
        if (parsed.position) {
          savedPosition = parsed.position;
        }
      }
    }

    setCompletedPlates(completed);

    // Find first incomplete plate to auto-navigate
    const firstIncomplete = findFirstIncompletePlate(completed, pattern);
    if (firstIncomplete) {
      setCurrentPosition(firstIncomplete);
    } else if (savedPosition) {
      setCurrentPosition(savedPosition);
    } else {
      setCurrentPosition({ row: 1, plate: 1 });
    }

    setInitialLoadDone(true);
  };

  const findFirstIncompletePlate = (completed: string[], pat: Pattern): PlatePosition | null => {
    for (let row = 1; row <= pat.plate_height; row++) {
      for (let plate = 1; plate <= pat.plate_width; plate++) {
        const key = `${row}-${plate}`;
        if (!completed.includes(key)) {
          return { row, plate };
        }
      }
    }
    return null; // All complete
  };

  const loadColors = async () => {
    const { data } = await supabase
      .from('bead_colors')
      .select('id, hex_color, name, code');

    if (data) {
      const colorMap = new Map(data.map(c => [c.id, { hex_color: c.hex_color, name: c.name, code: c.code }]));
      setColors(colorMap);
    }
  };

  const loadPlateData = async () => {
    if (!pattern) return;

    const { data } = await supabase
      .from('bead_plates')
      .select('beads')
      .eq('pattern_id', pattern.id)
      .eq('row_index', currentPosition.row - 1)
      .eq('column_index', currentPosition.plate - 1)
      .maybeSingle();

    setPlateData(data?.beads || []);
  };

  const saveProgress = async (completed: string[], position: PlatePosition) => {
    if (!pattern) return { error: null };

    if (user) {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          pattern_id: pattern.id,
          completed_plates: completed,
          current_row: position.row,
          current_plate: position.plate,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'user_id,pattern_id'
        });

      if (error) {
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          console.error('Auth error saving progress, session may be expired:', error);
        } else {
          console.error('Error saving progress:', error);
        }
        return { error };
      }
    } else {
      localStorage.setItem(`progress_${pattern.id}`, JSON.stringify({
        completed,
        position,
      }));
    }

    onProgressChange?.();
    return { error: null };
  };

  const togglePlateComplete = async () => {
    const key = currentPlateKey;
    const isCompleted = completedPlates.includes(key);

    const newCompleted = isCompleted
      ? completedPlates.filter(k => k !== key)
      : [...completedPlates, key];

    setCompletedPlates(newCompleted);
    const result = await saveProgress(newCompleted, currentPosition);

    if (result.error) {
      toast.error('Kunne ikke gemme progress');
      // Rollback
      setCompletedPlates(completedPlates);
    } else {
      toast.success(isCompleted ? 'Markering fjernet' : 'Plade markeret som færdig');
    }
  };

  const navigate = async (direction: 'prev' | 'next') => {
    if (!pattern) return;

    let newRow = currentPosition.row;
    let newPlate = currentPosition.plate;

    if (direction === 'next') {
      if (newPlate < pattern.plate_width) {
        newPlate++;
      } else if (newRow < pattern.plate_height) {
        newRow++;
        newPlate = 1;
      }
    } else {
      if (newPlate > 1) {
        newPlate--;
      } else if (newRow > 1) {
        newRow--;
        newPlate = pattern.plate_width;
      }
    }

    const newPosition = { row: newRow, plate: newPlate };
    setCurrentPosition(newPosition);
    await saveProgress(completedPlates, newPosition);
  };

  const canGoPrev = currentPosition.row > 1 || currentPosition.plate > 1;
  const canGoNext = pattern && (currentPosition.row < pattern.plate_height || currentPosition.plate < pattern.plate_width);

  const handlePrint = () => {
    window.print();
  };

  if (!pattern) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-2 border-b no-print flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">
              {pattern.title}
              {pattern.category_name && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({pattern.category_name})
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('prev')}
                disabled={!canGoPrev}
                className="h-9 px-3"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Tilbage</span>
              </Button>
              <span className="text-sm font-medium px-2">
                Række {currentPosition.row}, Plade {currentPosition.plate}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('next')}
                disabled={!canGoNext}
                className="h-9 px-3"
              >
                <span className="hidden sm:inline mr-1">Frem</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3"
              >
                Luk
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-4 grid grid-cols-1 md:grid-cols-[1fr_250px] gap-4 min-h-0">
          {/* Bead Plate */}
          <div ref={beadContainerRef} className="overflow-auto flex items-center justify-center min-h-0">
            <BeadPlateView
              beads={plateData || []}
              colors={colors}
              dimension={pattern.plate_dimension}
              containerSize={containerSize}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-4 no-print">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-3">Status</h3>
              <div className="space-y-2 text-sm">
                <p>Række: {currentPosition.row} af {pattern.plate_height}</p>
                <p>Plade: {currentPosition.plate} af {pattern.plate_width}</p>
                <p>Færdige plader: {completedPlates.length} af {totalPlates}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Checkbox
                id="plate-complete"
                checked={completedPlates.includes(currentPlateKey)}
                onCheckedChange={togglePlateComplete}
                className="h-6 w-6"
              />
              <label
                htmlFor="plate-complete"
                className="text-sm font-medium cursor-pointer"
              >
                Marker plade som færdig
              </label>
            </div>

            {pattern.thumbnail && (
              <div className="rounded-lg overflow-hidden border bg-muted">
                <PatternPreview thumbnail={pattern.thumbnail} />
              </div>
            )}

            <Button onClick={handlePrint} variant="outline" className="w-full">
              <Printer className="h-4 w-4 mr-2" />
              Print plade
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

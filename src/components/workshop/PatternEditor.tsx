import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PatternGridOverview } from './PatternGridOverview';
import { PlateEditorDialog } from './PlateEditorDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { Json } from '@/integrations/supabase/types';

interface Bead {
  row: number;
  col: number;
  colorId: string | null;
}

interface PlateData {
  id: string;
  row_index: number;
  column_index: number;
  beads: Bead[];
}

interface Pattern {
  id: string;
  title: string;
  is_public: boolean;
  plate_width: number;
  plate_height: number;
  plate_dimension: number;
  category_id: string | null;
}

interface ColorInfo {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

// Helper function to safely parse beads from JSON
const parseBeads = (beadsJson: Json): Bead[] => {
  if (!Array.isArray(beadsJson)) return [];
  const result: Bead[] = [];
  for (const item of beadsJson) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'row' in item &&
      'col' in item &&
      typeof (item as Record<string, unknown>).row === 'number' &&
      typeof (item as Record<string, unknown>).col === 'number'
    ) {
      result.push({
        row: (item as Record<string, unknown>).row as number,
        col: (item as Record<string, unknown>).col as number,
        colorId: typeof (item as Record<string, unknown>).colorId === 'string' 
          ? (item as Record<string, unknown>).colorId as string 
          : null,
      });
    }
  }
  return result;
};

export const PatternEditor: React.FC = () => {
  const { patternId } = useParams<{ patternId: string }>();
  const navigate = useNavigate();
  const { user, verifySession } = useAuth();
  const { toast } = useToast();

  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [plates, setPlates] = useState<PlateData[]>([]);
  const [colors, setColors] = useState<ColorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitDestination, setExitDestination] = useState<string | null>(null);

  // Plate editor state
  const [editingPlate, setEditingPlate] = useState<{
    rowIndex: number;
    columnIndex: number;
  } | null>(null);

  // Fetch pattern, plates, and colors
  useEffect(() => {
    if (!patternId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch pattern
        const { data: patternData, error: patternError } = await supabase
          .from('bead_patterns')
          .select('id, title, is_public, plate_width, plate_height, plate_dimension, category_id')
          .eq('id', patternId)
          .maybeSingle();

        if (patternError) throw patternError;
        if (!patternData) {
          toast({
            title: 'Fejl',
            description: 'Opskriften blev ikke fundet.',
            variant: 'destructive',
          });
          navigate('/workshop');
          return;
        }

        setPattern(patternData);

        // Fetch plates
        const { data: platesData, error: platesError } = await supabase
          .from('bead_plates')
          .select('id, row_index, column_index, beads')
          .eq('pattern_id', patternId)
          .order('row_index')
          .order('column_index');

        if (platesError) throw platesError;

        // Parse beads from JSON
        const parsedPlates: PlateData[] = (platesData || []).map(plate => ({
          id: plate.id,
          row_index: plate.row_index,
          column_index: plate.column_index,
          beads: parseBeads(plate.beads),
        }));

        setPlates(parsedPlates);

        // Fetch colors
        const { data: colorsData, error: colorsError } = await supabase
          .from('bead_colors')
          .select('id, hex_color, name, code')
          .eq('is_active', true)
          .order('code');

        if (colorsError) throw colorsError;
        setColors(colorsData || []);

      } catch (error) {
        console.error('Error fetching pattern:', error);
        toast({
          title: 'Fejl',
          description: 'Kunne ikke hente opskriften.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [patternId, navigate, toast]);

  // Create color map for grid
  const colorMap = new Map<string, { hex_color: string; name: string; code: string }>();
  colors.forEach(color => {
    colorMap.set(color.id, {
      hex_color: color.hex_color,
      name: color.name,
      code: color.code,
    });
  });

  // Get plate data for editor
  const getEditingPlateData = () => {
    if (!editingPlate) return null;
    return plates.find(
      p => p.row_index === editingPlate.rowIndex && p.column_index === editingPlate.columnIndex
    );
  };

  // Handle plate edit
  const handleEditPlate = (rowIndex: number, columnIndex: number) => {
    setEditingPlate({ rowIndex, columnIndex });
  };

  // Handle plate save
  const handleSavePlate = useCallback((beads: Bead[]) => {
    if (!editingPlate) return;

    setPlates(prev => prev.map(plate => {
      if (plate.row_index === editingPlate.rowIndex && plate.column_index === editingPlate.columnIndex) {
        return { ...plate, beads };
      }
      return plate;
    }));

    setHasUnsavedChanges(true);
  }, [editingPlate]);

  // Handle global color replace
  const handleReplaceColorGlobal = useCallback((fromColorId: string, toColorId: string | null) => {
    setPlates(prev => prev.map(plate => ({
      ...plate,
      beads: plate.beads.map(bead => {
        if (bead.colorId === fromColorId) {
          return { ...bead, colorId: toColorId };
        }
        return bead;
      }).filter(bead => bead.colorId !== null),
    })));

    setHasUnsavedChanges(true);
    
    toast({
      title: 'Farve erstattet',
      description: 'Farven er blevet erstattet på alle plader.',
    });
  }, [toast]);

  // Handle add row
  const handleAddRow = async () => {
    if (!pattern || !patternId) return;

    try {
      // Create new plates for the new row
      const newPlates = [];
      for (let col = 0; col < pattern.plate_width; col++) {
        newPlates.push({
          pattern_id: patternId,
          row_index: pattern.plate_height,
          column_index: col,
          beads: [],
        });
      }

      const { data, error } = await supabase
        .from('bead_plates')
        .insert(newPlates)
        .select('id, row_index, column_index, beads');

      if (error) throw error;

      // Update pattern dimensions
      const { error: updateError } = await supabase
        .from('bead_patterns')
        .update({ plate_height: pattern.plate_height + 1 })
        .eq('id', patternId);

      if (updateError) throw updateError;

      // Update local state
      const parsedNewPlates: PlateData[] = (data || []).map(plate => ({
        id: plate.id,
        row_index: plate.row_index,
        column_index: plate.column_index,
        beads: parseBeads(plate.beads),
      }));

      setPlates(prev => [...prev, ...parsedNewPlates]);
      setPattern(prev => prev ? { ...prev, plate_height: prev.plate_height + 1 } : prev);

    } catch (error) {
      console.error('Error adding row:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke tilføje række.',
        variant: 'destructive',
      });
    }
  };

  // Handle remove row
  const handleRemoveRow = async () => {
    if (!pattern || !patternId || pattern.plate_height <= 1) return;

    try {
      // Delete plates in the last row
      const { error: deleteError } = await supabase
        .from('bead_plates')
        .delete()
        .eq('pattern_id', patternId)
        .eq('row_index', pattern.plate_height - 1);

      if (deleteError) throw deleteError;

      // Update pattern dimensions
      const { error: updateError } = await supabase
        .from('bead_patterns')
        .update({ plate_height: pattern.plate_height - 1 })
        .eq('id', patternId);

      if (updateError) throw updateError;

      // Update local state
      setPlates(prev => prev.filter(p => p.row_index !== pattern.plate_height - 1));
      setPattern(prev => prev ? { ...prev, plate_height: prev.plate_height - 1 } : prev);

    } catch (error) {
      console.error('Error removing row:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke fjerne række.',
        variant: 'destructive',
      });
    }
  };

  // Handle add column
  const handleAddColumn = async () => {
    if (!pattern || !patternId) return;

    try {
      // Create new plates for the new column
      const newPlates = [];
      for (let row = 0; row < pattern.plate_height; row++) {
        newPlates.push({
          pattern_id: patternId,
          row_index: row,
          column_index: pattern.plate_width,
          beads: [],
        });
      }

      const { data, error } = await supabase
        .from('bead_plates')
        .insert(newPlates)
        .select('id, row_index, column_index, beads');

      if (error) throw error;

      // Update pattern dimensions
      const { error: updateError } = await supabase
        .from('bead_patterns')
        .update({ plate_width: pattern.plate_width + 1 })
        .eq('id', patternId);

      if (updateError) throw updateError;

      // Update local state
      const parsedNewPlates: PlateData[] = (data || []).map(plate => ({
        id: plate.id,
        row_index: plate.row_index,
        column_index: plate.column_index,
        beads: parseBeads(plate.beads),
      }));

      setPlates(prev => [...prev, ...parsedNewPlates]);
      setPattern(prev => prev ? { ...prev, plate_width: prev.plate_width + 1 } : prev);

    } catch (error) {
      console.error('Error adding column:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke tilføje kolonne.',
        variant: 'destructive',
      });
    }
  };

  // Handle remove column
  const handleRemoveColumn = async () => {
    if (!pattern || !patternId || pattern.plate_width <= 1) return;

    try {
      // Delete plates in the last column
      const { error: deleteError } = await supabase
        .from('bead_plates')
        .delete()
        .eq('pattern_id', patternId)
        .eq('column_index', pattern.plate_width - 1);

      if (deleteError) throw deleteError;

      // Update pattern dimensions
      const { error: updateError } = await supabase
        .from('bead_patterns')
        .update({ plate_width: pattern.plate_width - 1 })
        .eq('id', patternId);

      if (updateError) throw updateError;

      // Update local state
      setPlates(prev => prev.filter(p => p.column_index !== pattern.plate_width - 1));
      setPattern(prev => prev ? { ...prev, plate_width: prev.plate_width - 1 } : prev);

    } catch (error) {
      console.error('Error removing column:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke fjerne kolonne.',
        variant: 'destructive',
      });
    }
  };

  // Generate thumbnail from current plates
  const generateThumbnail = (): string | null => {
    if (!pattern) return null;
    try {
      const canvas = document.createElement('canvas');
      const maxSize = 200;
      const totalWidth = pattern.plate_width * pattern.plate_dimension;
      const totalHeight = pattern.plate_height * pattern.plate_dimension;
      const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight);

      canvas.width = Math.ceil(totalWidth * scale);
      canvas.height = Math.ceil(totalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      plates.forEach(plate => {
        const offsetX = plate.column_index * pattern.plate_dimension * scale;
        const offsetY = plate.row_index * pattern.plate_dimension * scale;

        plate.beads.forEach(bead => {
          if (bead.colorId) {
            const color = colorMap.get(bead.colorId);
            ctx.fillStyle = color?.hex_color || '#ccc';
            ctx.fillRect(
              offsetX + bead.col * scale,
              offsetY + bead.row * scale,
              Math.max(scale, 1),
              Math.max(scale, 1)
            );
          }
        });
      });

      return canvas.toDataURL('image/png', 0.8);
    } catch (err) {
      console.error('Error generating thumbnail:', err);
      return null;
    }
  };

  // Save all changes - no auth checks needed, controlled refresh timer keeps token valid
  const handleSaveAll = async () => {
    if (!patternId) return;

    setIsSaving(true);
    try {
      // Save directly - no auth check needed
      // Our controlled refresh timer in AuthContext keeps the token valid
      for (const plate of plates) {
        const { error } = await supabase
          .from('bead_plates')
          .update({ beads: plate.beads as unknown as Json })
          .eq('id', plate.id);

        if (error) {
          // Detect auth errors specifically
          if (error.message?.includes('JWT') || error.code === 'PGRST301') {
            throw new Error('SESSION_EXPIRED');
          }
          throw error;
        }

        // Short pause between saves
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Generate thumbnail and update pattern metadata
      const totalBeads = plates.reduce((sum, plate) => sum + plate.beads.length, 0);
      const thumbnail = generateThumbnail();

      const { error: metaError } = await supabase
        .from('bead_patterns')
        .update({ total_beads: totalBeads, thumbnail })
        .eq('id', patternId);

      if (metaError) throw metaError;

      setHasUnsavedChanges(false);
      toast({
        title: 'Gemt',
        description: 'Alle ændringer er gemt.',
      });

    } catch (error) {
      console.error('Error saving:', error);
      const isAuthError = error instanceof Error &&
        error.message === 'SESSION_EXPIRED';
      toast({
        title: isAuthError ? 'Session udløbet' : 'Fejl',
        description: isAuthError
          ? 'Du er blevet logget ud. Log ind igen og prøv at gemme.'
          : 'Kunne ikke gemme ændringer.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (hasUnsavedChanges) {
      setExitDestination('/workshop');
      setShowExitDialog(true);
    } else {
      navigate('/workshop');
    }
  };

  // Handle exit confirmation
  const handleExitConfirm = async () => {
    await handleSaveAll();
    setShowExitDialog(false);
    if (exitDestination) {
      navigate(exitDestination);
    }
  };

  // Handle exit without saving
  const handleExitWithoutSave = () => {
    setShowExitDialog(false);
    if (exitDestination) {
      navigate(exitDestination);
    }
  };

  // Toggle public/private
  const handleTogglePublic = async () => {
    if (!pattern || !patternId) return;

    try {
      const { error } = await supabase
        .from('bead_patterns')
        .update({ is_public: !pattern.is_public })
        .eq('id', patternId);

      if (error) throw error;

      setPattern(prev => prev ? { ...prev, is_public: !prev.is_public } : prev);
      toast({
        title: pattern.is_public ? 'Opskrift er nu privat' : 'Opskrift er nu offentlig',
        description: pattern.is_public 
          ? 'Kun du kan se denne opskrift.' 
          : 'Alle kan nu se denne opskrift i galleriet.',
      });

    } catch (error) {
      console.error('Error toggling public:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke ændre synlighed.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!pattern) {
    return (
      <Layout>
        <div className="container px-4 py-8">
          <p>Opskriften blev ikke fundet.</p>
          <Button onClick={() => navigate('/workshop')} className="mt-4">
            Tilbage til WorkShop
          </Button>
        </div>
      </Layout>
    );
  }

  const editingPlateData = getEditingPlateData();

  return (
    <Layout>
      <div className="container px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbage
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{pattern.title}</h1>
              <p className="text-sm text-muted-foreground">
                {pattern.plate_width}×{pattern.plate_height} plader, {pattern.plate_dimension}×{pattern.plate_dimension} perler/plade
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleTogglePublic}
            >
              {pattern.is_public ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Offentlig
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Privat
                </>
              )}
            </Button>

            <Button
              onClick={handleSaveAll}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gemmer...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Gem alt
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && (
          <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-lg text-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            Du har ugemte ændringer. Husk at gemme før du forlader siden.
          </div>
        )}

        {/* Grid overview */}
        <PatternGridOverview
          plates={plates}
          plateWidth={pattern.plate_width}
          plateHeight={pattern.plate_height}
          plateDimension={pattern.plate_dimension}
          colors={colorMap}
          onEditPlate={handleEditPlate}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          onAddColumn={handleAddColumn}
          onRemoveColumn={handleRemoveColumn}
        />

        {/* Plate editor dialog */}
        {editingPlate && editingPlateData && (
          <PlateEditorDialog
            open={true}
            onOpenChange={(open) => !open && setEditingPlate(null)}
            rowIndex={editingPlate.rowIndex}
            columnIndex={editingPlate.columnIndex}
            beads={editingPlateData.beads}
            colors={colors}
            dimension={pattern.plate_dimension}
            onSave={handleSavePlate}
            onReplaceColorGlobal={handleReplaceColorGlobal}
          />
        )}

        {/* Exit confirmation dialog */}
        <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ugemte ændringer</AlertDialogTitle>
              <AlertDialogDescription>
                Du har ugemte ændringer. Vil du gemme dem før du forlader?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleExitWithoutSave}>
                Forlad uden at gemme
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleExitConfirm}>
                Gem og forlad
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

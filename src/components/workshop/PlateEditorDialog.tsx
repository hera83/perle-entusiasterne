import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InteractiveBeadGrid } from './InteractiveBeadGrid';
import { EditorToolbar } from './EditorToolbar';
import { Save, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface Bead {
  row: number;
  col: number;
  colorId: string | null;
}

interface ColorInfo {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

interface PlateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowIndex: number;
  columnIndex: number;
  beads: Bead[];
  colors: ColorInfo[];
  dimension: number;
  onSave: (beads: Bead[]) => void;
  onReplaceColorGlobal: (fromColorId: string, toColorId: string | null) => void;
}

export const PlateEditorDialog: React.FC<PlateEditorDialogProps> = ({
  open,
  onOpenChange,
  rowIndex,
  columnIndex,
  beads: initialBeads,
  colors,
  dimension,
  onSave,
  onReplaceColorGlobal,
}) => {
  const [beads, setBeads] = useState<Bead[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [isPipetteActive, setIsPipetteActive] = useState(false);
  const [isDrawMode, setIsDrawMode] = useState(true);
  const [replaceFromColorId, setReplaceFromColorId] = useState<string | null>(null);
  const [replaceToColorId, setReplaceToColorId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  const isMobile = useIsMobile();

  // Track window width for responsive layout
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compact mode when mobile or narrow screen
  const isCompact = isMobile || windowWidth < 900;

  // Initialize beads when dialog opens
  useEffect(() => {
    if (open) {
      setBeads([...initialBeads]);
      setHasChanges(false);
    }
  }, [open, initialBeads]);

  // Create color map for grid
  const colorMap = new Map<string, { hex_color: string; name: string; code: string }>();
  colors.forEach(color => {
    colorMap.set(color.id, {
      hex_color: color.hex_color,
      name: color.name,
      code: color.code,
    });
  });

  const handleBeadClick = useCallback((row: number, col: number) => {
    setBeads(prev => {
      const existingIndex = prev.findIndex(b => b.row === row && b.col === col);
      
      if (selectedColorId === null) {
        // Remove bead
        if (existingIndex >= 0) {
          const newBeads = [...prev];
          newBeads.splice(existingIndex, 1);
          setHasChanges(true);
          return newBeads;
        }
        return prev;
      }
      
      // Add or update bead
      if (existingIndex >= 0) {
        if (prev[existingIndex].colorId === selectedColorId) {
          return prev; // No change
        }
        const newBeads = [...prev];
        newBeads[existingIndex] = { ...newBeads[existingIndex], colorId: selectedColorId };
        setHasChanges(true);
        return newBeads;
      } else {
        setHasChanges(true);
        return [...prev, { row, col, colorId: selectedColorId }];
      }
    });
  }, [selectedColorId]);

  const handlePipetteSelect = useCallback((colorId: string | null) => {
    setSelectedColorId(colorId);
    setIsPipetteActive(false);
  }, []);

  const handleReplaceOnPlate = useCallback(() => {
    if (!replaceFromColorId) return;
    
    setBeads(prev => {
      const newBeads = prev.map(bead => {
        if (bead.colorId === replaceFromColorId) {
          return { ...bead, colorId: replaceToColorId };
        }
        return bead;
      }).filter(bead => bead.colorId !== null);
      
      setHasChanges(true);
      return newBeads;
    });
  }, [replaceFromColorId, replaceToColorId]);

  const handleReplaceGlobal = useCallback(() => {
    if (!replaceFromColorId) return;
    onReplaceColorGlobal(replaceFromColorId, replaceToColorId);
  }, [replaceFromColorId, replaceToColorId, onReplaceColorGlobal]);

  const handleClearPlate = useCallback(() => {
    setBeads([]);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    onSave(beads);
    setHasChanges(false);
    onOpenChange(false);
  }, [beads, onSave, onOpenChange]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      // Could add confirmation dialog here
      onSave(beads);
    }
    onOpenChange(false);
  }, [hasChanges, beads, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Række {rowIndex + 1}, Plade {columnIndex + 1}</span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={handleClose} 
                size="sm"
              >
                <X className="w-4 h-4 mr-2" />
                Luk
              </Button>
              <Button 
                onClick={handleSave} 
                size="sm"
                disabled={!hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                Gem
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className={`flex ${isCompact ? 'flex-col' : 'flex-row'} gap-4 overflow-hidden`}>
          {/* Grid area - always first and full size */}
          <ScrollArea className="flex-1 max-h-[70vh]">
            <div className="p-2">
              <InteractiveBeadGrid
                beads={beads}
                colors={colorMap}
                dimension={dimension}
                selectedColorId={selectedColorId}
                isPipetteActive={isPipetteActive}
                isDrawMode={isDrawMode}
                onBeadClick={handleBeadClick}
                onPipetteSelect={handlePipetteSelect}
              />
            </div>
          </ScrollArea>

          {/* Toolbar - adapts to compact mode */}
          <div className={isCompact ? 'w-full' : 'w-64 flex-shrink-0'}>
            {isCompact ? (
              <EditorToolbar
                compact
                colors={colors}
                selectedColorId={selectedColorId}
                onColorSelect={setSelectedColorId}
                isPipetteActive={isPipetteActive}
                onPipetteToggle={() => setIsPipetteActive(!isPipetteActive)}
                isDrawMode={isDrawMode}
                onDrawModeToggle={setIsDrawMode}
                replaceFromColorId={replaceFromColorId}
                replaceToColorId={replaceToColorId}
                onReplaceFromChange={setReplaceFromColorId}
                onReplaceToChange={setReplaceToColorId}
                onReplaceOnPlate={handleReplaceOnPlate}
                onReplaceGlobal={handleReplaceGlobal}
                onClearPlate={handleClearPlate}
              />
            ) : (
              <ScrollArea className="max-h-[70vh]">
                <EditorToolbar
                  colors={colors}
                  selectedColorId={selectedColorId}
                  onColorSelect={setSelectedColorId}
                  isPipetteActive={isPipetteActive}
                  onPipetteToggle={() => setIsPipetteActive(!isPipetteActive)}
                  isDrawMode={isDrawMode}
                  onDrawModeToggle={setIsDrawMode}
                  replaceFromColorId={replaceFromColorId}
                  replaceToColorId={replaceToColorId}
                  onReplaceFromChange={setReplaceFromColorId}
                  onReplaceToChange={setReplaceToColorId}
                  onReplaceOnPlate={handleReplaceOnPlate}
                  onReplaceGlobal={handleReplaceGlobal}
                  onClearPlate={handleClearPlate}
                />
              </ScrollArea>
            )}
          </div>
        </div>

        {hasChanges && (
          <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            Ugemte ændringer
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

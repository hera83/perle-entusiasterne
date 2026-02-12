import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PatternFullPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patternId: string;
  patternTitle?: string;
}

interface ColorInfo {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

interface PlateData {
  beads: { row: number; col: number; colorId: string | null }[];
  row_index: number;
  column_index: number;
}

export const PatternFullPreview: React.FC<PatternFullPreviewProps> = ({
  open,
  onOpenChange,
  patternId,
  patternTitle = 'Opskrift',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [patternInfo, setPatternInfo] = useState<{
    plate_width: number;
    plate_height: number;
    plate_dimension: number;
    title: string;
  } | null>(null);

  const drawCanvas = useCallback(
    (
      plates: PlateData[],
      colors: Map<string, ColorInfo>,
      info: { plate_width: number; plate_height: number; plate_dimension: number },
      containerWidth: number
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const totalCols = info.plate_width * info.plate_dimension;
      const totalRows = info.plate_height * info.plate_dimension;
      const beadSize = containerWidth / totalCols;
      const canvasWidth = totalCols * beadSize;
      const canvasHeight = totalRows * beadSize;

      // Use devicePixelRatio for sharpness
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Build full grid
      const fullGrid: (string | null)[][] = Array.from({ length: totalRows }, () =>
        Array.from({ length: totalCols }, () => null)
      );

      for (const plate of plates) {
        const rowOffset = plate.row_index * info.plate_dimension;
        const colOffset = plate.column_index * info.plate_dimension;
        for (const bead of plate.beads) {
          const globalRow = rowOffset + bead.row;
          const globalCol = colOffset + bead.col;
          if (globalRow < totalRows && globalCol < totalCols) {
            fullGrid[globalRow][globalCol] = bead.colorId;
          }
        }
      }

      const radius = beadSize * 0.45;

      // Draw beads
      for (let row = 0; row < totalRows; row++) {
        for (let col = 0; col < totalCols; col++) {
          const cx = col * beadSize + beadSize / 2;
          const cy = row * beadSize + beadSize / 2;
          const colorId = fullGrid[row][col];

          if (colorId) {
            const color = colors.get(colorId);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = color?.hex_color || '#cccccc';
            ctx.fill();
            // Thin border for depth
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          } else {
            // Empty position - subtle dashed outline only
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // Plate separation lines
      ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
      ctx.lineWidth = 1.5;

      for (let pw = 1; pw < info.plate_width; pw++) {
        const x = pw * info.plate_dimension * beadSize;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      for (let ph = 1; ph < info.plate_height; ph++) {
        const y = ph * info.plate_dimension * beadSize;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    },
    []
  );

  const [loadedData, setLoadedData] = useState<{
    plates: PlateData[];
    colorMap: Map<string, ColorInfo>;
    info: { plate_width: number; plate_height: number; plate_dimension: number };
  } | null>(null);

  useEffect(() => {
    if (!open || !patternId) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const { data: patData } = await supabase
          .from('bead_patterns')
          .select('plate_width, plate_height, plate_dimension, title')
          .eq('id', patternId)
          .single();

        if (!patData) return;
        setPatternInfo(patData);

        const [platesRes, colorsRes] = await Promise.all([
          supabase
            .from('bead_plates')
            .select('beads, row_index, column_index')
            .eq('pattern_id', patternId)
            .order('row_index')
            .order('column_index'),
          supabase.from('bead_colors').select('id, hex_color, name, code'),
        ]);

        const plates: PlateData[] = (platesRes.data || []).map((p) => ({
          beads: (p.beads as any[]) || [],
          row_index: p.row_index,
          column_index: p.column_index,
        }));

        const colorMap = new Map<string, ColorInfo>(
          (colorsRes.data || []).map((c) => [c.id, c])
        );

        setLoadedData({ plates, colorMap, info: patData });
      } catch (err) {
        console.error('Error loading preview:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [open, patternId]);

  // Redraw on resize (handles scrollbar appearing/disappearing)
  useEffect(() => {
    if (!loadedData || !open) return;

    const redraw = () => {
      const container = containerRef.current;
      if (!container) return;
      drawCanvas(loadedData.plates, loadedData.colorMap, loadedData.info, container.clientWidth);
    };

    // Initial draw
    requestAnimationFrame(redraw);

    const observer = new ResizeObserver(redraw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [loadedData, open, drawCanvas]);

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${patternInfo?.title || patternTitle}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 overflow-hidden flex flex-col"
      >
        <DialogHeader className="px-4 py-2 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base truncate">
              {patternInfo?.title || patternTitle}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPng}
                disabled={isLoading}
                className="h-9 px-3"
              >
                <Download className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Download PNG</span>
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

        <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <canvas ref={canvasRef} className="block max-w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

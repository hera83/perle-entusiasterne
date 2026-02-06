import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ImageOff } from 'lucide-react';

interface BeadPlate {
  row_index: number;
  column_index: number;
  beads: Array<{ row: number; col: number; colorId: string | null }>;
}

interface PatternPreviewProps {
  patternId: string;
}

export const PatternPreview: React.FC<PatternPreviewProps> = ({ patternId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const generatePreview = async () => {
      try {
        const { data: pattern, error: patternError } = await supabase
          .from('bead_patterns')
          .select('plate_width, plate_height, plate_dimension')
          .eq('id', patternId)
          .single();

        if (patternError || !pattern || cancelled) {
          if (!cancelled) { setError(true); setLoading(false); }
          return;
        }

        const { data: plates } = await supabase
          .from('bead_plates')
          .select('row_index, column_index, beads')
          .eq('pattern_id', patternId);

        const { data: colors } = await supabase
          .from('bead_colors')
          .select('id, hex_color');

        if (cancelled) return;

        if (!plates || !colors || plates.length === 0) {
          setError(true);
          setLoading(false);
          return;
        }

        const colorMap = new Map(colors.map(c => [c.id, c.hex_color]));

        const canvas = canvasRef.current;
        if (!canvas) { setError(true); setLoading(false); return; }

        const ctx = canvas.getContext('2d');
        if (!ctx) { setError(true); setLoading(false); return; }

        const totalWidth = pattern.plate_width * pattern.plate_dimension;
        const totalHeight = pattern.plate_height * pattern.plate_dimension;

        const maxSize = 200;
        const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight);
        canvas.width = totalWidth * scale;
        canvas.height = totalHeight * scale;

        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        plates.forEach((plate: BeadPlate) => {
          const offsetX = plate.column_index * pattern.plate_dimension * scale;
          const offsetY = plate.row_index * pattern.plate_dimension * scale;

          if (Array.isArray(plate.beads)) {
            plate.beads.forEach((bead) => {
              if (bead.colorId) {
                const color = colorMap.get(bead.colorId) || '#ccc';
                ctx.fillStyle = color;
                ctx.fillRect(
                  offsetX + bead.col * scale,
                  offsetY + bead.row * scale,
                  scale,
                  scale
                );
              }
            });
          }
        });

        setLoading(false);
      } catch (err) {
        console.error('Error generating preview:', err);
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };

    generatePreview();
    return () => { cancelled = true; };
  }, [patternId]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground gap-2">
        <ImageOff className="h-8 w-8" />
        <span className="text-xs">Ingen preview</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      {loading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Indlæser...</div>
      ) : (
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
      )}
    </div>
  );
};

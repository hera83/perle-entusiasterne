import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BeadPlate {
  row_index: number;
  column_index: number;
  beads: Array<{ row: number; col: number; colorId: string | null }>;
}

interface BeadColor {
  id: string;
  hex_color: string;
}

interface PatternPreviewProps {
  patternId: string;
}

export const PatternPreview: React.FC<PatternPreviewProps> = ({ patternId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generatePreview = async () => {
      try {
        // Fetch pattern info
        const { data: pattern } = await supabase
          .from('bead_patterns')
          .select('plate_width, plate_height, plate_dimension')
          .eq('id', patternId)
          .single();

        if (!pattern) return;

        // Fetch all plates
        const { data: plates } = await supabase
          .from('bead_plates')
          .select('row_index, column_index, beads')
          .eq('pattern_id', patternId);

        // Fetch colors
        const { data: colors } = await supabase
          .from('bead_colors')
          .select('id, hex_color');

        if (!plates || !colors) return;

        const colorMap = new Map(colors.map(c => [c.id, c.hex_color]));

        // Draw preview
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const totalWidth = pattern.plate_width * pattern.plate_dimension;
        const totalHeight = pattern.plate_height * pattern.plate_dimension;
        
        // Set canvas size
        const maxSize = 200;
        const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight);
        canvas.width = totalWidth * scale;
        canvas.height = totalHeight * scale;

        // Clear canvas
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw each plate
        plates.forEach((plate: BeadPlate) => {
          const offsetX = plate.column_index * pattern.plate_dimension * scale;
          const offsetY = plate.row_index * pattern.plate_dimension * scale;

          // Draw beads
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
        setLoading(false);
      }
    };

    generatePreview();
  }, [patternId]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      {loading ? (
        <div className="text-xs text-muted-foreground">Indlæser...</div>
      ) : (
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
      )}
    </div>
  );
};

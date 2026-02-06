import React, { useState, useCallback } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Bead {
  row: number;
  col: number;
  colorId: string | null;
}

interface ColorInfo {
  hex_color: string;
  name: string;
  code: string;
}

interface InteractiveBeadGridProps {
  beads: Bead[];
  colors: Map<string, ColorInfo>;
  dimension: number;
  selectedColorId: string | null;
  isPipetteActive: boolean;
  isDrawMode: boolean;
  onBeadClick: (row: number, col: number) => void;
  onPipetteSelect: (colorId: string | null) => void;
}

// Determine if a color is light or dark for text contrast
const isLightColor = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

export const InteractiveBeadGrid: React.FC<InteractiveBeadGridProps> = ({
  beads,
  colors,
  dimension,
  selectedColorId,
  isPipetteActive,
  isDrawMode,
  onBeadClick,
  onPipetteSelect,
}) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  // Create a 2D grid from beads array
  const grid: (Bead | null)[][] = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => null)
  );

  beads.forEach((bead) => {
    if (bead.row >= 0 && bead.row < dimension && bead.col >= 0 && bead.col < dimension) {
      grid[bead.row][bead.col] = bead;
    }
  });

  const beadSize = Math.max(16, Math.min(24, Math.floor(500 / dimension)));

  const handleMouseDown = useCallback((row: number, col: number) => {
    if (isPipetteActive) {
      const bead = grid[row]?.[col];
      onPipetteSelect(bead?.colorId || null);
      return;
    }
    
    setIsMouseDown(true);
    onBeadClick(row, col);
  }, [isPipetteActive, grid, onBeadClick, onPipetteSelect]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    setHoveredCell({ row, col });
    
    if (isMouseDown && isDrawMode && !isPipetteActive) {
      onBeadClick(row, col);
    }
  }, [isMouseDown, isDrawMode, isPipetteActive, onBeadClick]);

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setIsMouseDown(false);
  }, []);

  return (
    <div 
      className="inline-block select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isPipetteActive ? 'crosshair' : 'pointer' }}
    >
      {/* Column numbers */}
      <div className="flex">
        <div style={{ width: beadSize }} className="flex-shrink-0" />
        {Array.from({ length: dimension }, (_, i) => (
          <div
            key={`col-${i}`}
            style={{ width: beadSize }}
            className="text-center text-[10px] text-muted-foreground"
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Rows with beads */}
      {grid.map((row, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex">
          {/* Row number */}
          <div
            style={{ width: beadSize, height: beadSize }}
            className="flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0"
          >
            {rowIndex + 1}
          </div>

          {/* Beads */}
          {row.map((bead, colIndex) => {
            const colorInfo = bead?.colorId ? colors.get(bead.colorId) : null;
            const bgColor = colorInfo?.hex_color || 'transparent';
            const textColor = colorInfo ? (isLightColor(colorInfo.hex_color) ? '#000' : '#fff') : 'hsl(var(--muted-foreground))';
            const code = colorInfo?.code || '';
            const isHovered = hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex;

            return (
              <Tooltip key={`bead-${rowIndex}-${colIndex}`}>
                <TooltipTrigger asChild>
                  <div
                    style={{
                      width: beadSize,
                      height: beadSize,
                      backgroundColor: bgColor,
                      color: textColor,
                    }}
                    className={`
                      flex items-center justify-center text-[8px] font-medium
                      rounded-full bead-shadow
                      border border-[hsl(var(--bead-grid))]
                      transition-all duration-75
                      ${!colorInfo ? 'bg-muted' : ''}
                      ${isHovered ? 'ring-2 ring-primary ring-offset-1' : ''}
                    `}
                    onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                    onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                  >
                    {code}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {colorInfo 
                      ? `${colorInfo.name} (${colorInfo.code})`
                      : `Række ${rowIndex + 1}, Kolonne ${colIndex + 1}`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
};

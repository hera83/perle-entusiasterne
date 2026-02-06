import React from 'react';
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

interface BeadPlateViewProps {
  beads: Bead[];
  colors: Map<string, ColorInfo>;
  dimension: number;
}

// Determine if a color is light or dark for text contrast
const isLightColor = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

export const BeadPlateView: React.FC<BeadPlateViewProps> = ({ beads, colors, dimension }) => {
  // Create a 2D grid from beads array
  const grid: (Bead | null)[][] = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => null)
  );

  beads.forEach((bead) => {
    if (bead.row >= 0 && bead.row < dimension && bead.col >= 0 && bead.col < dimension) {
      grid[bead.row][bead.col] = bead;
    }
  });

  const beadSize = Math.max(20, Math.min(32, Math.floor(600 / dimension)));

  return (
    <div className="inline-block">
      {/* Column numbers */}
      <div className="flex">
        <div style={{ width: beadSize }} className="flex-shrink-0" />
        {Array.from({ length: dimension }, (_, i) => (
          <div
            key={`col-${i}`}
            style={{ width: beadSize }}
            className="text-center text-xs text-muted-foreground"
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
            className="flex items-center justify-center text-xs text-muted-foreground flex-shrink-0"
          >
            {rowIndex + 1}
          </div>

          {/* Beads */}
          {row.map((bead, colIndex) => {
            const colorInfo = bead?.colorId ? colors.get(bead.colorId) : null;
            const bgColor = colorInfo?.hex_color || 'transparent';
            const textColor = colorInfo ? (isLightColor(colorInfo.hex_color) ? '#000' : '#fff') : '#999';
            const code = colorInfo?.code || '';

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
                      flex items-center justify-center text-xs font-medium
                      rounded-full bead-shadow cursor-default
                      border border-[hsl(var(--bead-grid))]
                      ${!colorInfo ? 'bg-muted' : ''}
                    `}
                  >
                    {code}
                  </div>
                </TooltipTrigger>
                {colorInfo && (
                  <TooltipContent>
                    <p>{colorInfo.name} ({colorInfo.code})</p>
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
};

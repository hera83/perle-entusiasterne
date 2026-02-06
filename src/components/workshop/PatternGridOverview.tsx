import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Minus, Edit2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

interface ColorInfo {
  hex_color: string;
  name: string;
  code: string;
}

interface PatternGridOverviewProps {
  plates: PlateData[];
  plateWidth: number;
  plateHeight: number;
  plateDimension: number;
  colors: Map<string, ColorInfo>;
  onEditPlate: (rowIndex: number, columnIndex: number) => void;
  onAddRow: () => void;
  onRemoveRow: () => void;
  onAddColumn: () => void;
  onRemoveColumn: () => void;
}

// Mini preview of a plate
const PlatePreview: React.FC<{
  beads: Bead[];
  dimension: number;
  colors: Map<string, ColorInfo>;
}> = ({ beads, dimension, colors }) => {
  const previewSize = 100;
  const cellSize = previewSize / dimension;

  return (
    <div
      className="bg-muted rounded border border-border"
      style={{ width: previewSize, height: previewSize, position: 'relative' }}
    >
      {beads.map((bead, index) => {
        const colorInfo = bead.colorId ? colors.get(bead.colorId) : null;
        if (!colorInfo) return null;
        
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: bead.col * cellSize,
              top: bead.row * cellSize,
              width: cellSize,
              height: cellSize,
              backgroundColor: colorInfo.hex_color,
              borderRadius: '50%',
            }}
          />
        );
      })}
    </div>
  );
};

export const PatternGridOverview: React.FC<PatternGridOverviewProps> = ({
  plates,
  plateWidth,
  plateHeight,
  plateDimension,
  colors,
  onEditPlate,
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onRemoveColumn,
}) => {
  // Organize plates into a 2D grid
  const grid: (PlateData | undefined)[][] = Array.from({ length: plateHeight }, () =>
    Array.from({ length: plateWidth }, () => undefined)
  );

  plates.forEach((plate) => {
    if (plate.row_index < plateHeight && plate.column_index < plateWidth) {
      grid[plate.row_index][plate.column_index] = plate;
    }
  });

  return (
    <div className="space-y-4">
      {/* Dimension controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Kolonner:</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onAddColumn}
            disabled={plateWidth >= 10}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center font-medium">{plateWidth}</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={plateWidth <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fjern kolonne?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dette vil fjerne den sidste kolonne og alle dens perler. Handlingen kan ikke fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuller</AlertDialogCancel>
                <AlertDialogAction onClick={onRemoveColumn}>
                  Fjern kolonne
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rækker:</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onAddRow}
            disabled={plateHeight >= 10}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center font-medium">{plateHeight}</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={plateHeight <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fjern række?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dette vil fjerne den sidste række og alle dens perler. Handlingen kan ikke fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuller</AlertDialogCancel>
                <AlertDialogAction onClick={onRemoveRow}>
                  Fjern række
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="text-sm text-muted-foreground">
          Total: {plateWidth * plateHeight} plade{plateWidth * plateHeight !== 1 ? 'r' : ''}
        </div>
      </div>

      {/* Grid of plates */}
      <div className="overflow-auto">
        <div 
          className="inline-grid gap-3"
          style={{ gridTemplateColumns: `repeat(${plateWidth}, minmax(0, 1fr))` }}
        >
          {grid.map((row, rowIndex) =>
            row.map((plate, colIndex) => (
              <Card 
                key={`${rowIndex}-${colIndex}`}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-2 text-center">
                    R{rowIndex + 1}, K{colIndex + 1}
                  </div>
                  
                  <div className="flex justify-center mb-2">
                    <PlatePreview
                      beads={plate?.beads || []}
                      dimension={plateDimension}
                      colors={colors}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onEditPlate(rowIndex, colIndex)}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Rediger
                  </Button>

                  <div className="text-xs text-muted-foreground text-center mt-1">
                    {plate?.beads?.length || 0} perler
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

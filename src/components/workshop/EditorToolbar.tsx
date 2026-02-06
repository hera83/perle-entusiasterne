import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Pipette, Eraser, Replace, Trash2 } from 'lucide-react';

interface ColorInfo {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

interface EditorToolbarProps {
  colors: ColorInfo[];
  selectedColorId: string | null;
  onColorSelect: (colorId: string | null) => void;
  isPipetteActive: boolean;
  onPipetteToggle: () => void;
  isDrawMode: boolean;
  onDrawModeToggle: (enabled: boolean) => void;
  replaceFromColorId: string | null;
  replaceToColorId: string | null;
  onReplaceFromChange: (colorId: string | null) => void;
  onReplaceToChange: (colorId: string | null) => void;
  onReplaceOnPlate: () => void;
  onReplaceGlobal: () => void;
  onClearPlate: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  colors,
  selectedColorId,
  onColorSelect,
  isPipetteActive,
  onPipetteToggle,
  isDrawMode,
  onDrawModeToggle,
  replaceFromColorId,
  replaceToColorId,
  onReplaceFromChange,
  onReplaceToChange,
  onReplaceOnPlate,
  onReplaceGlobal,
  onClearPlate,
}) => {
  const ColorOption = ({ color }: { color: ColorInfo | null }) => (
    <div className="flex items-center gap-2">
      <div
        className="w-4 h-4 rounded-full border border-border"
        style={{ backgroundColor: color?.hex_color || 'transparent' }}
      />
      <span>{color ? `${color.code} - ${color.name}` : 'Ingen farve (slet)'}</span>
    </div>
  );

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
      {/* Color Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Vælg farve</Label>
        <Select
          value={selectedColorId || 'none'}
          onValueChange={(value) => onColorSelect(value === 'none' ? null : value)}
        >
          <SelectTrigger>
            <SelectValue>
              {selectedColorId ? (
                <ColorOption color={colors.find(c => c.id === selectedColorId) || null} />
              ) : (
                <ColorOption color={null} />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="none">
              <div className="flex items-center gap-2">
                <Eraser className="w-4 h-4" />
                <span>Ingen farve (slet)</span>
              </div>
            </SelectItem>
            {colors.map((color) => (
              <SelectItem key={color.id} value={color.id}>
                <ColorOption color={color} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Drawing Tools */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Værktøjer</Label>
        
        {/* Pipette */}
        <Button
          variant={isPipetteActive ? 'default' : 'outline'}
          size="sm"
          className="w-full justify-start"
          onClick={onPipetteToggle}
        >
          <Pipette className="w-4 h-4 mr-2" />
          Pipette (scan farve)
          {isPipetteActive && <span className="ml-auto text-xs">Aktiv</span>}
        </Button>

        {/* Draw Mode */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="drawMode" className="text-sm">Fasthold farve</Label>
            <p className="text-xs text-muted-foreground">
              Tegn ved at trække musen
            </p>
          </div>
          <Switch
            id="drawMode"
            checked={isDrawMode}
            onCheckedChange={onDrawModeToggle}
          />
        </div>
      </div>

      <Separator />

      {/* Replace Color */}
      <div className="space-y-3">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Replace className="w-4 h-4" />
          Erstat farve
        </Label>
        
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fra farve</Label>
            <Select
              value={replaceFromColorId || 'none'}
              onValueChange={(value) => onReplaceFromChange(value === 'none' ? null : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Vælg..." />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="none">Vælg farve...</SelectItem>
                {colors.map((color) => (
                  <SelectItem key={color.id} value={color.id}>
                    <ColorOption color={color} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Til farve</Label>
            <Select
              value={replaceToColorId || 'none'}
              onValueChange={(value) => onReplaceToChange(value === 'none' ? null : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Vælg..." />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="none">Ingen farve (slet)</SelectItem>
                {colors.map((color) => (
                  <SelectItem key={color.id} value={color.id}>
                    <ColorOption color={color} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onReplaceOnPlate}
              disabled={!replaceFromColorId}
            >
              På plade
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onReplaceGlobal}
              disabled={!replaceFromColorId}
            >
              Alle plader
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Clear Plate */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="w-full">
            <Trash2 className="w-4 h-4 mr-2" />
            Ryd plade
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ryd pladen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette vil fjerne alle perler fra denne plade. Handlingen kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={onClearPlate}>
              Ryd plade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

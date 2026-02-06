import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2, Upload, Crop, Settings, Eye, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  loadImage,
  cropImage,
  convertImageToBeads,
  splitBeadsIntoPlates,
  renderBeadPreview,
  generateThumbnailFromBeads,
  type BeadColor,
  type BeadPixel,
} from './imageUtils';

interface ImportImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Category {
  id: string;
  name: string;
}

type WizardStep = 'upload' | 'crop' | 'settings' | 'preview';

const STEPS: WizardStep[] = ['upload', 'crop', 'settings', 'preview'];
const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload',
  crop: 'Beskær',
  settings: 'Indstillinger',
  preview: 'Forhåndsvisning',
};

export const ImportImageDialog: React.FC<ImportImageDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');

  // Upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Crop state
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Settings state
  const [title, setTitle] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [plateWidth, setPlateWidth] = useState(1);
  const [plateHeight, setPlateHeight] = useState(1);
  const [plateDimension, setPlateDimension] = useState(29);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);

  // Preview state
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [beadColors, setBeadColors] = useState<BeadColor[]>([]);
  const [previewBeads, setPreviewBeads] = useState<BeadPixel[]>([]);
  const [colorStats, setColorStats] = useState<Map<string, number>>(new Map());
  const [totalBeads, setTotalBeads] = useState(0);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  // Auto-calculate plateHeight from image aspect ratio
  useEffect(() => {
    if (cropRect.width > 0 && cropRect.height > 0) {
      const totalPixelWidth = plateWidth * plateDimension;
      const ratio = cropRect.height / cropRect.width;
      const calculatedHeight = Math.max(1, Math.round((totalPixelWidth * ratio) / plateDimension));
      setPlateHeight(calculatedHeight);
    }
  }, [plateWidth, plateDimension, cropRect.width, cropRect.height]);

  // Fetch categories and colors when dialog opens
  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchColors();
    }
  }, [open]);

  const fetchCategories = async () => {
    setIsFetchingCategories(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setIsFetchingCategories(false);
    }
  };

  const fetchColors = async () => {
    try {
      const { data, error } = await supabase
        .from('bead_colors')
        .select('id, hex_color, name, code')
        .eq('is_active', true)
        .order('code');
      if (error) throw error;
      setBeadColors(data || []);
    } catch (error) {
      console.error('Error fetching colors:', error);
    }
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Fejl',
        description: 'Billedet må maksimalt fylde 10 MB.',
        variant: 'destructive',
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Fejl',
        description: 'Kun billedfiler (JPG, PNG) er understøttet.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const img = await loadImage(file);
      setImageFile(file);
      setImage(img);
      setImagePreviewUrl(URL.createObjectURL(file));
      // Initialize crop to full image
      setCropRect({ x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
    } catch {
      toast({
        title: 'Fejl',
        description: 'Kunne ikke indlæse billedet.',
        variant: 'destructive',
      });
    }
  };

  // Draw crop overlay on canvas
  const drawCropCanvas = useCallback(() => {
    const canvas = cropCanvasRef.current;
    const img = image;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fit image to canvas container
    const maxW = 500;
    const maxH = 400;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    setCanvasScale(scale);

    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;

    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cut out crop area
    const sx = cropRect.x * scale;
    const sy = cropRect.y * scale;
    const sw = cropRect.width * scale;
    const sh = cropRect.height * scale;

    ctx.clearRect(sx, sy, sw, sh);
    ctx.drawImage(
      img,
      cropRect.x, cropRect.y, cropRect.width, cropRect.height,
      sx, sy, sw, sh
    );

    // Draw crop border
    ctx.strokeStyle = 'hsl(var(--primary))';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    // Draw corner handles
    const handleSize = 10;
    ctx.fillStyle = 'hsl(var(--primary))';
    // NW
    ctx.fillRect(sx - handleSize / 2, sy - handleSize / 2, handleSize, handleSize);
    // NE
    ctx.fillRect(sx + sw - handleSize / 2, sy - handleSize / 2, handleSize, handleSize);
    // SW
    ctx.fillRect(sx - handleSize / 2, sy + sh - handleSize / 2, handleSize, handleSize);
    // SE
    ctx.fillRect(sx + sw - handleSize / 2, sy + sh - handleSize / 2, handleSize, handleSize);
  }, [image, cropRect]);

  useEffect(() => {
    if (currentStep === 'crop') {
      drawCropCanvas();
    }
  }, [currentStep, drawCropCanvas]);

  // Crop mouse/touch handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / canvasScale,
      y: (e.clientY - rect.top) / canvasScale,
    };
  };

  const getHandleAtPoint = (px: number, py: number): 'nw' | 'ne' | 'sw' | 'se' | 'move' | null => {
    const threshold = 15 / canvasScale;
    const { x, y, width, height } = cropRect;

    if (Math.abs(px - x) < threshold && Math.abs(py - y) < threshold) return 'nw';
    if (Math.abs(px - (x + width)) < threshold && Math.abs(py - y) < threshold) return 'ne';
    if (Math.abs(px - x) < threshold && Math.abs(py - (y + height)) < threshold) return 'sw';
    if (Math.abs(px - (x + width)) < threshold && Math.abs(py - (y + height)) < threshold) return 'se';
    if (px >= x && px <= x + width && py >= y && py <= y + height) return 'move';
    return null;
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    const handle = getHandleAtPoint(coords.x, coords.y);
    if (handle) {
      setIsDragging(true);
      setDragType(handle);
      setDragStart(coords);
    }
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragType || !image) return;

    const coords = getCanvasCoords(e);
    const dx = coords.x - dragStart.x;
    const dy = coords.y - dragStart.y;
    const imgW = image.naturalWidth;
    const imgH = image.naturalHeight;

    setCropRect(prev => {
      let { x, y, width, height } = prev;
      const minSize = 20;

      switch (dragType) {
        case 'move':
          x = Math.max(0, Math.min(imgW - width, x + dx));
          y = Math.max(0, Math.min(imgH - height, y + dy));
          break;
        case 'nw':
          x = Math.max(0, Math.min(x + width - minSize, x + dx));
          y = Math.max(0, Math.min(y + height - minSize, y + dy));
          width = prev.x + prev.width - x;
          height = prev.y + prev.height - y;
          break;
        case 'ne':
          width = Math.max(minSize, Math.min(imgW - x, prev.width + dx));
          y = Math.max(0, Math.min(y + height - minSize, y + dy));
          height = prev.y + prev.height - y;
          break;
        case 'sw':
          x = Math.max(0, Math.min(x + width - minSize, x + dx));
          width = prev.x + prev.width - x;
          height = Math.max(minSize, Math.min(imgH - y, prev.height + dy));
          break;
        case 'se':
          width = Math.max(minSize, Math.min(imgW - x, prev.width + dx));
          height = Math.max(minSize, Math.min(imgH - y, prev.height + dy));
          break;
      }

      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    });

    setDragStart(coords);
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
  };

  // Generate preview when entering preview step
  const generatePreview = useCallback(() => {
    if (!image || beadColors.length === 0) return;

    setIsGeneratingPreview(true);

    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      try {
        const croppedCanvas = cropImage(image, cropRect);
        const targetWidth = plateWidth * plateDimension;
        const targetHeight = plateHeight * plateDimension;

        const result = convertImageToBeads(croppedCanvas, targetWidth, targetHeight, beadColors);
        const allBeads = result.beadsByPlate.get('all') || [];

        setPreviewBeads(allBeads);
        setColorStats(result.colorStats);
        setTotalBeads(result.totalBeads);

        // Render preview canvas
        if (previewCanvasRef.current) {
          renderBeadPreview(previewCanvasRef.current, allBeads, targetWidth, targetHeight, beadColors);
        }
      } catch (err) {
        console.error('Error generating preview:', err);
        toast({
          title: 'Fejl',
          description: 'Kunne ikke generere forhåndsvisning.',
          variant: 'destructive',
        });
      } finally {
        setIsGeneratingPreview(false);
      }
    });
  }, [image, cropRect, plateWidth, plateHeight, plateDimension, beadColors, toast]);

  useEffect(() => {
    if (currentStep === 'preview') {
      generatePreview();
    }
  }, [currentStep, generatePreview]);

  // Create the pattern in the database
  const handleCreate = async () => {
    if (!user || !image) return;

    if (!title.trim()) {
      toast({
        title: 'Fejl',
        description: 'Titel er påkrævet.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      // Handle category (same logic as CreatePatternDialog)
      let categoryId = selectedCategory?.id || null;
      if (!categoryId && categorySearch.trim()) {
        const existing = categories.find(
          c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()
        );
        if (existing) {
          categoryId = existing.id;
        } else {
          const { data: newCat, error: catErr } = await supabase
            .from('categories')
            .insert({ name: categorySearch.trim() })
            .select('id')
            .single();
          if (catErr) throw catErr;
          categoryId = newCat.id;
        }
      }

      // Generate thumbnail
      const targetWidth = plateWidth * plateDimension;
      const targetHeight = plateHeight * plateDimension;
      const thumbnail = generateThumbnailFromBeads(previewBeads, targetWidth, targetHeight, beadColors);

      // Create pattern
      const { data: pattern, error: patternError } = await supabase
        .from('bead_patterns')
        .insert({
          title: title.trim(),
          user_id: user.id,
          category_id: categoryId,
          is_public: isPublic,
          plate_width: plateWidth,
          plate_height: plateHeight,
          plate_dimension: plateDimension,
          total_beads: totalBeads,
          thumbnail,
        })
        .select('id')
        .single();

      if (patternError) throw patternError;

      // Split beads into plates and insert
      const plateBeads = splitBeadsIntoPlates(previewBeads, plateWidth, plateHeight, plateDimension);
      const platesToInsert = [];

      for (let row = 0; row < plateHeight; row++) {
        for (let col = 0; col < plateWidth; col++) {
          const key = `${row}-${col}`;
          platesToInsert.push({
            pattern_id: pattern.id,
            row_index: row,
            column_index: col,
            beads: plateBeads.get(key) || [],
          });
        }
      }

      const { error: platesError } = await supabase
        .from('bead_plates')
        .insert(platesToInsert);

      if (platesError) throw platesError;

      toast({
        title: 'Opskrift oprettet',
        description: 'Dit billede er konverteret til en perleplade-opskrift.',
      });

      resetForm();
      onOpenChange(false);
      navigate(`/workshop/${pattern.id}`);
    } catch (error) {
      console.error('Error creating pattern:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke oprette opskrift. Prøv igen.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setCurrentStep('upload');
    setImageFile(null);
    setImage(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setCropRect({ x: 0, y: 0, width: 0, height: 0 });
    setTitle('');
    setCategorySearch('');
    setSelectedCategory(null);
    setIsPublic(false);
    setPlateWidth(1);
    setPlateHeight(1);
    setPlateDimension(29);
    setPreviewBeads([]);
    setColorStats(new Map());
    setTotalBeads(0);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'upload': return !!image;
      case 'crop': return cropRect.width > 10 && cropRect.height > 10;
      case 'settings': return !!title.trim();
      case 'preview': return previewBeads.length > 0;
      default: return false;
    }
  };

  const goNext = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
    }
  };

  const goBack = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1]);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const stepIndex = STEPS.indexOf(currentStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer billede</DialogTitle>
          <DialogDescription>
            Upload et billede og konverter det til en perleplade-opskrift.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                  i === stepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i < stepIndex
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <span>{i + 1}</span>
                <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 flex-1', i < stepIndex ? 'bg-primary' : 'bg-muted')} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px]">
          {/* STEP 1: Upload */}
          {currentStep === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                {imagePreviewUrl ? (
                  <div className="space-y-4">
                    <img
                      src={imagePreviewUrl}
                      alt="Uploaded"
                      className="max-h-[300px] mx-auto rounded-md object-contain"
                    />
                    <p className="text-sm text-muted-foreground">
                      {imageFile?.name} – {image ? `${image.naturalWidth}×${image.naturalHeight}px` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
                    <div>
                      <p className="font-medium">Vælg et billede</p>
                      <p className="text-sm text-muted-foreground">JPG eller PNG, maks 10 MB</p>
                    </div>
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="mt-4"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Crop */}
          {currentStep === 'crop' && image && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Træk i hjørnerne for at beskære billedet. Du kan også flytte hele udvalget.
              </p>
              <div className="flex justify-center overflow-auto">
                <canvas
                  ref={cropCanvasRef}
                  className="border rounded-md cursor-crosshair max-w-full"
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onMouseUp={handleCropMouseUp}
                  onMouseLeave={handleCropMouseUp}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Udvalg: {Math.round(cropRect.width)}×{Math.round(cropRect.height)} pixels
              </p>
            </div>
          )}

          {/* STEP 3: Settings */}
          {currentStep === 'settings' && (
            <div className="space-y-4">
              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="import-title">Titel *</Label>
                <Input
                  id="import-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="F.eks. Min importerede opskrift"
                />
              </div>

              {/* Category */}
              <div className="grid gap-2">
                <Label>Kategori</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryPopoverOpen}
                      className="justify-between"
                    >
                      {selectedCategory?.name || categorySearch || "Vælg eller skriv kategori..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Søg eller opret kategori..."
                        value={categorySearch}
                        onValueChange={(value) => {
                          setCategorySearch(value);
                          setSelectedCategory(null);
                        }}
                      />
                      <CommandList>
                        {isFetchingCategories ? (
                          <div className="py-6 text-center text-sm">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          </div>
                        ) : (
                          <>
                            <CommandEmpty>
                              {categorySearch.trim() ? (
                                <div className="py-3 px-2 text-sm">
                                  Ny kategori: "{categorySearch}"
                                </div>
                              ) : (
                                "Ingen kategorier fundet."
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {filteredCategories.map((category) => (
                                <CommandItem
                                  key={category.id}
                                  value={category.name}
                                  onSelect={() => {
                                    setSelectedCategory(category);
                                    setCategorySearch(category.name);
                                    setCategoryPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedCategory?.id === category.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {category.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="import-plateWidth">Bredde (antal plader)</Label>
                  <Input
                    id="import-plateWidth"
                    type="number"
                    min={1}
                    max={10}
                    value={plateWidth}
                    onChange={(e) => setPlateWidth(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="import-plateHeight">Højde (antal plader)</Label>
                  <Input
                    id="import-plateHeight"
                    type="number"
                    min={1}
                    max={10}
                    value={plateHeight}
                    onChange={(e) => setPlateHeight(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </div>

              {/* Plate dimension */}
              <div className="grid gap-2">
                <Label htmlFor="import-plateDimension">Perler per plade (dimension)</Label>
                <Input
                  id="import-plateDimension"
                  type="number"
                  min={10}
                  max={50}
                  value={plateDimension}
                  onChange={(e) => setPlateDimension(Math.max(10, Math.min(50, parseInt(e.target.value) || 29)))}
                />
                <p className="text-xs text-muted-foreground">
                  Standard er 29×29 perler per plade.
                </p>
              </div>

              {/* Preview info */}
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">Overblik:</p>
                <p className="text-muted-foreground">
                  {plateWidth} × {plateHeight} = {plateWidth * plateHeight} plade{plateWidth * plateHeight !== 1 ? 'r' : ''}
                </p>
                <p className="text-muted-foreground">
                  Billedet skaleres til {plateWidth * plateDimension} × {plateHeight * plateDimension} perler
                </p>
              </div>

              {/* Public toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="import-isPublic">Offentlig opskrift</Label>
                  <p className="text-xs text-muted-foreground">
                    Offentlige opskrifter kan ses af alle i galleriet.
                  </p>
                </div>
                <Switch
                  id="import-isPublic"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>
            </div>
          )}

          {/* STEP 4: Preview */}
          {currentStep === 'preview' && (
            <div className="space-y-4">
              {isGeneratingPreview ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Konverterer billede til perler...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center overflow-auto">
                    <canvas
                      ref={previewCanvasRef}
                      className="border rounded-md"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium">Statistik</p>
                      <p className="text-muted-foreground">Antal perler: {totalBeads.toLocaleString('da-DK')}</p>
                      <p className="text-muted-foreground">Antal farver: {colorStats.size}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium">Dimensioner</p>
                      <p className="text-muted-foreground">{plateWidth * plateDimension} × {plateHeight * plateDimension} perler</p>
                      <p className="text-muted-foreground">{plateWidth} × {plateHeight} plader</p>
                    </div>
                  </div>

                  {/* Color breakdown (top 10) */}
                  {colorStats.size > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Farvefordeling (top {Math.min(10, colorStats.size)})</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(colorStats.entries())
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 10)
                          .map(([colorId, count]) => {
                            const color = beadColors.find(c => c.id === colorId);
                            if (!color) return null;
                            return (
                              <div
                                key={colorId}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs"
                              >
                                <div
                                  className="w-3 h-3 rounded-full border"
                                  style={{ backgroundColor: color.hex_color }}
                                />
                                <span>{color.name}</span>
                                <span className="text-muted-foreground">({count})</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {stepIndex > 0 && (
            <Button variant="outline" onClick={goBack} disabled={isCreating}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Tilbage
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Annuller
          </Button>
          {currentStep === 'preview' ? (
            <Button onClick={handleCreate} disabled={isCreating || !canGoNext()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opretter...
                </>
              ) : (
                'Opret opskrift'
              )}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canGoNext()}>
              Næste
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

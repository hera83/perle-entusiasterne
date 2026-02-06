import React, { useState, useEffect } from 'react';
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
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreatePatternDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Category {
  id: string;
  name: string;
}

export const CreatePatternDialog: React.FC<CreatePatternDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [plateWidth, setPlateWidth] = useState(1);
  const [plateHeight, setPlateHeight] = useState(1);
  const [plateDimension, setPlateDimension] = useState(29);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);

  // Fetch categories when dialog opens
  useEffect(() => {
    if (open) {
      fetchCategories();
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

  const handleCreate = async () => {
    if (!user) {
      toast({
        title: 'Fejl',
        description: 'Du skal være logget ind for at oprette en opskrift.',
        variant: 'destructive',
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: 'Fejl',
        description: 'Titel er påkrævet.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      let categoryId = selectedCategory?.id || null;

      // If user typed a new category name, create it
      if (!categoryId && categorySearch.trim()) {
        const existingCategory = categories.find(
          c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()
        );
        
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          // Create new category
          const { data: newCategory, error: categoryError } = await supabase
            .from('categories')
            .insert({ name: categorySearch.trim() })
            .select('id')
            .single();
          
          if (categoryError) throw categoryError;
          categoryId = newCategory.id;
        }
      }

      // Create the pattern
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
          total_beads: 0,
        })
        .select('id')
        .single();

      if (patternError) throw patternError;

      // Create empty plates
      const plates = [];
      for (let row = 0; row < plateHeight; row++) {
        for (let col = 0; col < plateWidth; col++) {
          plates.push({
            pattern_id: pattern.id,
            row_index: row,
            column_index: col,
            beads: [],
          });
        }
      }

      const { error: platesError } = await supabase
        .from('bead_plates')
        .insert(plates);

      if (platesError) throw platesError;

      toast({
        title: 'Opskrift oprettet',
        description: 'Din nye opskrift er klar til redigering.',
      });

      // Reset form
      resetForm();
      onOpenChange(false);
      
      // Navigate to editor
      navigate(`/workshop/${pattern.id}`);
    } catch (error) {
      console.error('Error creating pattern:', error);
      toast({
        title: 'Fejl',
        description: 'Kunne ikke oprette opskrift. Prøv igen.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setCategorySearch('');
    setSelectedCategory(null);
    setIsPublic(false);
    setPlateWidth(1);
    setPlateHeight(1);
    setPlateDimension(29);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Opret ny opskrift</DialogTitle>
          <DialogDescription>
            Udfyld oplysninger og vælg dimensioner for din nye perleplade-opskrift.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. Min første opskrift"
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
                              Tryk Enter eller vælg for at oprette "{categorySearch}"
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
                                  selectedCategory?.id === category.id
                                    ? "opacity-100"
                                    : "opacity-0"
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
            <p className="text-xs text-muted-foreground">
              Vælg en eksisterende kategori eller skriv en ny.
            </p>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="plateWidth">Bredde (antal plader)</Label>
              <Input
                id="plateWidth"
                type="number"
                min={1}
                max={10}
                value={plateWidth}
                onChange={(e) => setPlateWidth(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plateHeight">Højde (antal plader)</Label>
              <Input
                id="plateHeight"
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
            <Label htmlFor="plateDimension">Perler per plade (dimension)</Label>
            <Input
              id="plateDimension"
              type="number"
              min={10}
              max={50}
              value={plateDimension}
              onChange={(e) => setPlateDimension(Math.max(10, Math.min(50, parseInt(e.target.value) || 29)))}
            />
            <p className="text-xs text-muted-foreground">
              Standard er 29x29 perler per plade.
            </p>
          </div>

          {/* Preview info */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium">Overblik:</p>
            <p className="text-muted-foreground">
              {plateWidth} × {plateHeight} = {plateWidth * plateHeight} plade{plateWidth * plateHeight !== 1 ? 'r' : ''}
            </p>
            <p className="text-muted-foreground">
              Total: {plateWidth * plateHeight * plateDimension * plateDimension} perler maksimalt
            </p>
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isPublic">Offentlig opskrift</Label>
              <p className="text-xs text-muted-foreground">
                Offentlige opskrifter kan ses af alle i galleriet.
              </p>
            </div>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Annuller
          </Button>
          <Button onClick={handleCreate} disabled={isLoading || !title.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Opretter...
              </>
            ) : (
              'Opret opskrift'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

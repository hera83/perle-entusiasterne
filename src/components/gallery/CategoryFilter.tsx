import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CategoryWithCount {
  id: string;
  name: string;
  count: number;
}

interface CategoryFilterProps {
  selectedCategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategory,
  onCategoryChange,
}) => {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, bead_patterns(count)')
        .order('name');

      if (!error && data) {
        const mapped: CategoryWithCount[] = data.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          count: cat.bead_patterns?.[0]?.count ?? 0,
        }));
        setCategories(mapped.filter(c => c.count > 0));
      }
    };

    fetchCategories();
  }, []);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-1">Kategori:</span>
      <Button
        size="sm"
        variant={selectedCategory === null ? 'default' : 'outline'}
        className="h-8 text-sm"
        onClick={() => onCategoryChange(null)}
      >
        Alle
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          size="sm"
          variant={selectedCategory === category.id ? 'default' : 'outline'}
          className="h-8 text-sm"
          onClick={() => onCategoryChange(category.id)}
        >
          {category.name} ({category.count})
        </Button>
      ))}
    </div>
  );
};

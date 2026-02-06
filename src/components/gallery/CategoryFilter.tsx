import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
}

interface CategoryFilterProps {
  selectedCategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategory,
  onCategoryChange,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name');

      if (!error && data) {
        setCategories(data);
      }
    };

    fetchCategories();
  }, []);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-sm text-muted-foreground self-center mr-2">Kategori:</span>
      <Badge
        variant={selectedCategory === null ? 'default' : 'outline'}
        className={cn(
          'cursor-pointer transition-colors',
          selectedCategory === null && 'bg-primary'
        )}
        onClick={() => onCategoryChange(null)}
      >
        Alle
      </Badge>
      {categories.map((category) => (
        <Badge
          key={category.id}
          variant={selectedCategory === category.id ? 'default' : 'outline'}
          className={cn(
            'cursor-pointer transition-colors',
            selectedCategory === category.id && 'bg-primary'
          )}
          onClick={() => onCategoryChange(category.id)}
        >
          {category.name}
        </Badge>
      ))}
    </div>
  );
};

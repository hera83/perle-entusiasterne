import React, { useEffect, useState } from 'react';
import { db } from '@/services/db';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user, isAdmin } = useAuth();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const fetchCategories = async () => {
      const categoriesRequest = db
        .from('categories')
        .select('id, name')
        .order('name');

      let patternsRequest = db
        .from('bead_patterns')
        .select('category_id');

      if (isAdmin) {
        // Admins can count all patterns
      } else if (user?.id) {
        patternsRequest = patternsRequest.or(`is_public.eq.true,user_id.eq.${user.id}`);
      } else {
        patternsRequest = patternsRequest.eq('is_public', true);
      }

      const [categoriesResult, patternsResult] = await Promise.all([
        categoriesRequest,
        patternsRequest,
      ]);

      if (isCancelled) return;

      if (categoriesResult.error) {
        console.error('Error fetching categories:', categoriesResult.error);
        return;
      }

      if (patternsResult.error) {
        console.error('Error fetching category counts:', patternsResult.error);
        return;
      }

      const counts = (patternsResult.data || []).reduce<Record<string, number>>((acc, pattern: any) => {
        if (pattern.category_id) {
          acc[pattern.category_id] = (acc[pattern.category_id] || 0) + 1;
        }
        return acc;
      }, {});

      const mapped: CategoryWithCount[] = (categoriesResult.data || [])
        .map((category: any) => ({
          id: category.id,
          name: category.name,
          count: counts[category.id] || 0,
        }))
        .filter((category) => category.count > 0);

      setCategories(mapped);
    };

    fetchCategories();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, isAdmin]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialValue?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleClear = () => {
    setQuery('');
  };

  return (
    <div className="w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Søg efter perleplade-opskrifter... (f.eks. 'Ariel', 'Mickey Mouse')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 pr-10 h-12 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Ryd søgning"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

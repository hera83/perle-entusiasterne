import React from 'react';
import { ImageOff } from 'lucide-react';

interface PatternPreviewProps {
  thumbnail?: string | null;
}

export const PatternPreview: React.FC<PatternPreviewProps> = ({ thumbnail }) => {
  if (!thumbnail) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground gap-2">
        <ImageOff className="h-8 w-8" />
        <span className="text-xs">Ingen preview</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <img
        src={thumbnail}
        alt="Pattern preview"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
};

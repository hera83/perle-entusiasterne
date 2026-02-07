/**
 * Image processing utilities for converting images to bead patterns.
 * All processing happens client-side using Canvas API.
 */

export interface BeadColor {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

export interface BeadPixel {
  row: number;
  col: number;
  colorId: string | null;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parse a hex color string to RGB values */
export function hexToRgb(hex: string): RGB {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

/** Calculate Euclidean color distance in RGB space */
function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    (c1.r - c2.r) ** 2 +
    (c1.g - c2.g) ** 2 +
    (c1.b - c2.b) ** 2
  );
}

/** Find the nearest bead color for an RGB pixel. Returns null for transparent/background pixels. */
function findNearestColor(
  r: number,
  g: number,
  b: number,
  a: number,
  colorPalette: Array<{ id: string; rgb: RGB }>,
  removeBackground: boolean = false,
  bgTolerance: number = 240
): string | null {
  // Skip transparent pixels
  if (a < 128) return null;
  // Skip near-white pixels only when background removal is enabled
  if (removeBackground && r > bgTolerance && g > bgTolerance && b > bgTolerance) return null;

  const pixel: RGB = { r, g, b };
  let nearestId: string | null = null;
  let minDist = Infinity;

  for (const color of colorPalette) {
    const dist = colorDistance(pixel, color.rgb);
    if (dist < minDist) {
      minDist = dist;
      nearestId = color.id;
    }
  }

  return nearestId;
}

/**
 * Load an image file into an HTMLImageElement.
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke indlæse billedet.'));
    };
    img.src = url;
  });
}

/**
 * Crop an image using canvas based on a crop rectangle (in image coordinates).
 */
export function cropImage(
  img: HTMLImageElement,
  cropRect: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cropRect.width;
  canvas.height = cropRect.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    img,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height
  );
  return canvas;
}

/**
 * Convert a cropped image to a bead grid.
 * Returns an array of plates, each containing their bead array.
 */
export function convertImageToBeads(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  colors: BeadColor[]
): { beadsByPlate: Map<string, BeadPixel[]>; colorStats: Map<string, number>; totalBeads: number } {
  // Scale down to target size
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = targetWidth;
  scaledCanvas.height = targetHeight;
  const ctx = scaledCanvas.getContext('2d')!;
  // Use pixelated rendering for sharp downscaling
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

  // Read pixel data
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;

  // Prepare color palette with pre-parsed RGB
  const colorPalette = colors.map(c => ({
    id: c.id,
    rgb: hexToRgb(c.hex_color),
  }));

  const colorStats = new Map<string, number>();
  let totalBeads = 0;

  // Build flat bead array
  const allBeads: BeadPixel[] = [];

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      const colorId = findNearestColor(r, g, b, a, colorPalette);
      if (colorId) {
        allBeads.push({ row: y, col: x, colorId });
        colorStats.set(colorId, (colorStats.get(colorId) || 0) + 1);
        totalBeads++;
      }
    }
  }

  // We store all beads in a single map entry (will be split into plates later)
  const beadsByPlate = new Map<string, BeadPixel[]>();
  beadsByPlate.set('all', allBeads);

  return { beadsByPlate, colorStats, totalBeads };
}

/**
 * Split a flat bead grid into individual plate bead arrays.
 * Each plate has dimension x dimension beads.
 */
export function splitBeadsIntoPlates(
  allBeads: BeadPixel[],
  plateWidth: number,
  plateHeight: number,
  plateDimension: number
): Map<string, BeadPixel[]> {
  const plates = new Map<string, BeadPixel[]>();

  // Initialize empty arrays for each plate
  for (let row = 0; row < plateHeight; row++) {
    for (let col = 0; col < plateWidth; col++) {
      plates.set(`${row}-${col}`, []);
    }
  }

  // Distribute beads to plates
  for (const bead of allBeads) {
    const plateRow = Math.floor(bead.row / plateDimension);
    const plateCol = Math.floor(bead.col / plateDimension);
    const key = `${plateRow}-${plateCol}`;

    if (plates.has(key)) {
      plates.get(key)!.push({
        row: bead.row % plateDimension,
        col: bead.col % plateDimension,
        colorId: bead.colorId,
      });
    }
  }

  return plates;
}

/**
 * Render a bead grid preview onto a canvas for the preview step.
 */
export function renderBeadPreview(
  canvas: HTMLCanvasElement,
  allBeads: BeadPixel[],
  totalWidth: number,
  totalHeight: number,
  colors: BeadColor[]
): void {
  const ctx = canvas.getContext('2d')!;
  const maxSize = 400;
  const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight, 8);

  canvas.width = Math.ceil(totalWidth * scale);
  canvas.height = Math.ceil(totalHeight * scale);

  // Background
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Color lookup
  const colorMap = new Map<string, string>();
  colors.forEach(c => colorMap.set(c.id, c.hex_color));

  // Draw beads
  for (const bead of allBeads) {
    if (bead.colorId) {
      const hex = colorMap.get(bead.colorId);
      if (hex) {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(
          bead.col * scale + scale / 2,
          bead.row * scale + scale / 2,
          scale * 0.45,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  }
}

/**
 * Generate a 200x200 thumbnail from bead data (same logic as PatternEditor).
 */
export function generateThumbnailFromBeads(
  allBeads: BeadPixel[],
  totalWidth: number,
  totalHeight: number,
  colors: BeadColor[]
): string | null {
  try {
    const canvas = document.createElement('canvas');
    const maxSize = 200;
    const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight);

    canvas.width = Math.ceil(totalWidth * scale);
    canvas.height = Math.ceil(totalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const colorMap = new Map<string, string>();
    colors.forEach(c => colorMap.set(c.id, c.hex_color));

    for (const bead of allBeads) {
      if (bead.colorId) {
        const hex = colorMap.get(bead.colorId);
        if (hex) {
          ctx.fillStyle = hex;
          ctx.fillRect(
            bead.col * scale,
            bead.row * scale,
            Math.max(scale, 1),
            Math.max(scale, 1)
          );
        }
      }
    }

    return canvas.toDataURL('image/png', 0.8);
  } catch {
    return null;
  }
}

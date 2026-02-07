import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PatternData {
  id: string;
  title: string;
  category_name: string | null;
  creator_name: string | null;
  plate_width: number;
  plate_height: number;
  plate_dimension: number;
  total_beads: number;
}

interface ColorInfo {
  id: string;
  hex_color: string;
  name: string;
  code: string;
}

interface PlateData {
  beads: { row: number; col: number; colorId: string | null }[];
  row_index: number;
  column_index: number;
}

// Convert hex to RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

// Determine if text should be black or white for contrast
const getContrastColor = (hex: string): { r: number; g: number; b: number } => {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
};

// Draw a single bead (filled circle with code)
const drawBead = (
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  color: ColorInfo | null,
  showCode: boolean = true,
  fontSize?: number
) => {
  if (!color) {
    // Empty bead - light gray
    doc.setFillColor(230, 230, 230);
    doc.circle(x, y, radius, 'F');
    return;
  }

  const { r, g, b } = hexToRgb(color.hex_color);
  doc.setFillColor(r, g, b);
  doc.circle(x, y, radius, 'F');

  // Draw border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.1);
  doc.circle(x, y, radius, 'S');

  if (showCode && color.code) {
    const actualFontSize = fontSize ?? Math.max(5, radius * 1.1);
    const contrast = getContrastColor(color.hex_color);
    doc.setTextColor(contrast.r, contrast.g, contrast.b);
    doc.setFontSize(actualFontSize);
    doc.text(color.code, x, y + actualFontSize * 0.12, { align: 'center' });
  }
};

// Count beads across all plates
const countBeads = (plates: PlateData[], colors: Map<string, ColorInfo>): Map<string, { color: ColorInfo; count: number }> => {
  const counts = new Map<string, { color: ColorInfo; count: number }>();

  for (const plate of plates) {
    for (const bead of plate.beads) {
      if (bead.colorId) {
        const color = colors.get(bead.colorId);
        if (color) {
          const existing = counts.get(bead.colorId);
          if (existing) {
            existing.count++;
          } else {
            counts.set(bead.colorId, { color, count: 1 });
          }
        }
      }
    }
  }

  return counts;
};

// --- PAGE 1: Overview ---
const drawOverviewPage = (
  doc: jsPDF,
  pattern: PatternData,
  plates: PlateData[],
  colors: Map<string, ColorInfo>
) => {
  const margin = 15;
  const pageWidth = 210;
  let y = margin;

  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.text(pattern.title, margin, y);
  y += 7;

  // Category
  if (pattern.category_name) {
    doc.setFontSize(12);
    doc.setTextColor(120, 120, 120);
    doc.text(pattern.category_name, margin, y);
    y += 5;
  }

  // Line break
  y += 5;

  // Metadata
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Pladedimension: ${pattern.plate_dimension} x ${pattern.plate_dimension}`, margin, y);
  y += 5;
  doc.text(`Plader: ${pattern.plate_width} x ${pattern.plate_height}`, margin, y);
  y += 5;
  doc.text(`Total antal perler: ${pattern.total_beads.toLocaleString('da-DK')}`, margin, y);
  y += 5;

  if (pattern.creator_name) {
    doc.text(`Skaber: ${pattern.creator_name}`, margin, y);
    y += 5;
  }

  y += 10;

  // Draw the full pattern overview
  const totalCols = pattern.plate_width * pattern.plate_dimension;
  const totalRows = pattern.plate_height * pattern.plate_dimension;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = 297 - y - margin;
  const beadSize = Math.min(availableWidth / totalCols, availableHeight / totalRows);
  const radius = beadSize * 0.45;

  // Center the drawing
  const gridWidth = totalCols * beadSize;
  const offsetX = margin + (availableWidth - gridWidth) / 2;

  // Build full grid from all plates
  const fullGrid: (string | null)[][] = Array.from({ length: totalRows }, () =>
    Array.from({ length: totalCols }, () => null)
  );

  for (const plate of plates) {
    const rowOffset = plate.row_index * pattern.plate_dimension;
    const colOffset = plate.column_index * pattern.plate_dimension;
    for (const bead of plate.beads) {
      const globalRow = rowOffset + bead.row;
      const globalCol = colOffset + bead.col;
      if (globalRow < totalRows && globalCol < totalCols) {
        fullGrid[globalRow][globalCol] = bead.colorId;
      }
    }
  }

  // Draw beads
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < totalCols; col++) {
      const cx = offsetX + col * beadSize + beadSize / 2;
      const cy = y + row * beadSize + beadSize / 2;
      const colorId = fullGrid[row][col];
      const color = colorId ? colors.get(colorId) || null : null;
      drawBead(doc, cx, cy, radius, color, false);
    }
  }

  // Draw plate separation lines
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);

  for (let pw = 1; pw < pattern.plate_width; pw++) {
    const x = offsetX + pw * pattern.plate_dimension * beadSize;
    doc.line(x, y, x, y + totalRows * beadSize);
  }
  for (let ph = 1; ph < pattern.plate_height; ph++) {
    const lineY = y + ph * pattern.plate_dimension * beadSize;
    doc.line(offsetX, lineY, offsetX + totalCols * beadSize, lineY);
  }
};

// --- PAGE 2: Bead Count ---
const drawBeadCountPage = (
  doc: jsPDF,
  plates: PlateData[],
  colors: Map<string, ColorInfo>,
  totalBeads: number
) => {
  const margin = 15;
  const pageWidth = 210;
  let y = margin;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.text('Perleoptælling', margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Total antal perler: ${totalBeads.toLocaleString('da-DK')}`, margin, y);
  y += 10;

  const beadCounts = countBeads(plates, colors);
  const sorted = Array.from(beadCounts.values()).sort((a, b) => b.count - a.count);

  const colWidth = (pageWidth - margin * 2) / 2;
  const rowHeight = 8;
  const beadRadius = 3;

  sorted.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * colWidth;
    const currentY = y + row * rowHeight;

    // Check page overflow
    if (currentY > 280) {
      doc.addPage();
      y = margin;
      return;
    }

    // Draw bead circle
    const { r, g, b } = hexToRgb(item.color.hex_color);
    doc.setFillColor(r, g, b);
    doc.circle(x + beadRadius, currentY, beadRadius, 'F');
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.1);
    doc.circle(x + beadRadius, currentY, beadRadius, 'S');

    // Code in center
    const contrast = getContrastColor(item.color.hex_color);
    doc.setTextColor(contrast.r, contrast.g, contrast.b);
    doc.setFontSize(6);
    doc.text(item.color.code, x + beadRadius, currentY + 0.7, { align: 'center' });

    // Name and count
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`${item.color.name}`, x + beadRadius * 2 + 3, currentY + 0.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`${item.count.toLocaleString('da-DK')} stk`, x + beadRadius * 2 + 3, currentY + 4);
  });
};

// --- PAGE 3+: Individual Plates ---
const drawPlatePage = (
  doc: jsPDF,
  plate: PlateData,
  colors: Map<string, ColorInfo>,
  dimension: number
) => {
  const margin = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  let y = margin;

  // Header
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text(`Række: ${plate.row_index + 1}, Plade: ${plate.column_index + 1}`, margin, y);
  y += 8;

  // Color legend for this plate
  const plateColors = new Map<string, ColorInfo>();
  for (const bead of plate.beads) {
    if (bead.colorId && !plateColors.has(bead.colorId)) {
      const color = colors.get(bead.colorId);
      if (color) plateColors.set(bead.colorId, color);
    }
  }

  const legendItems = Array.from(plateColors.values());
  const legendBeadRadius = 2.5;
  const legendRowHeight = 6;
  const legendColWidth = 45;
  const legendCols = Math.min(4, Math.max(1, Math.floor((pageWidth - margin * 2) / legendColWidth)));

  legendItems.forEach((color, index) => {
    const col = index % legendCols;
    const row = Math.floor(index / legendCols);
    const lx = margin + col * legendColWidth;
    const ly = y + row * legendRowHeight;

    const { r, g, b } = hexToRgb(color.hex_color);
    doc.setFillColor(r, g, b);
    doc.circle(lx + legendBeadRadius, ly, legendBeadRadius, 'F');
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.1);
    doc.circle(lx + legendBeadRadius, ly, legendBeadRadius, 'S');

    const contrast = getContrastColor(color.hex_color);
    doc.setTextColor(contrast.r, contrast.g, contrast.b);
    doc.setFontSize(5);
    doc.text(color.code, lx + legendBeadRadius, ly + 0.6, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.text(color.name, lx + legendBeadRadius * 2 + 2, ly + 1);
  });

  const legendRows = Math.ceil(legendItems.length / legendCols);
  y += legendRows * legendRowHeight + 5;

  // Draw the plate grid with numbered axes
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - y - margin;
  const beadSize = Math.min(availableWidth / (dimension + 1), availableHeight / (dimension + 1));
  const radius = beadSize * 0.45;
  const axisOffset = beadSize; // Space for axis numbers

  // Center horizontally
  const gridTotalWidth = (dimension + 1) * beadSize;
  const offsetX = margin + (availableWidth - gridTotalWidth) / 2;

  // Column numbers
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(Math.min(6, beadSize * 0.6));
  for (let col = 0; col < dimension; col++) {
    const cx = offsetX + axisOffset + col * beadSize + beadSize / 2;
    doc.text(`${col + 1}`, cx, y, { align: 'center' });
  }
  y += 2;

  // Build grid
  const grid: (string | null)[][] = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => null)
  );
  for (const bead of plate.beads) {
    if (bead.row >= 0 && bead.row < dimension && bead.col >= 0 && bead.col < dimension) {
      grid[bead.row][bead.col] = bead.colorId;
    }
  }

  // Draw rows
  const codeFontSize = Math.min(5, beadSize * 0.5);
  for (let row = 0; row < dimension; row++) {
    const cy = y + row * beadSize + beadSize / 2;

    // Row number
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(Math.min(6, beadSize * 0.6));
    doc.text(`${row + 1}`, offsetX + axisOffset - 2, cy + 0.5, { align: 'right' });

    // Beads
    for (let col = 0; col < dimension; col++) {
      const cx = offsetX + axisOffset + col * beadSize + beadSize / 2;
      const colorId = grid[row][col];
      const color = colorId ? colors.get(colorId) || null : null;
      drawBead(doc, cx, cy, radius, color, true, codeFontSize);
    }
  }
};

// --- Main export ---
export async function generatePatternPdf(pattern: PatternData): Promise<void> {
  const loadingToast = toast.loading('Genererer PDF...');

  try {
    // 1. Fetch all plates
    const { data: platesRaw, error: platesError } = await supabase
      .from('bead_plates')
      .select('beads, row_index, column_index')
      .eq('pattern_id', pattern.id)
      .order('row_index')
      .order('column_index');

    if (platesError || !platesRaw) {
      throw new Error('Kunne ikke hente plader');
    }

    const plates: PlateData[] = platesRaw.map(p => ({
      beads: (p.beads as any[]) || [],
      row_index: p.row_index,
      column_index: p.column_index,
    }));

    // 2. Fetch all colors
    const { data: colorData, error: colorError } = await supabase
      .from('bead_colors')
      .select('id, hex_color, name, code');

    if (colorError || !colorData) {
      throw new Error('Kunne ikke hente farver');
    }

    const colors = new Map<string, ColorInfo>(
      colorData.map(c => [c.id, c])
    );

    // 3. Generate PDF
    const doc = new jsPDF('portrait', 'mm', 'a4');

    // Page 1: Overview
    drawOverviewPage(doc, pattern, plates, colors);

    // Page 2: Bead count
    doc.addPage();
    drawBeadCountPage(doc, plates, colors, pattern.total_beads);

    // Page 3+: Individual plates
    for (const plate of plates) {
      doc.addPage();
      drawPlatePage(doc, plate, colors, pattern.plate_dimension);
    }

    // 4. Download
    doc.save(`${pattern.title}.pdf`);

    // 5. Log download (fire-and-forget)
    const { data: userData } = await supabase.auth.getUser();
    supabase.from('pdf_downloads').insert({
      pattern_id: pattern.id,
      user_id: userData?.user?.id || null,
    }).then(() => {});

    toast.dismiss(loadingToast);
    toast.success('PDF downloadet!');
  } catch (error) {
    console.error('PDF generation error:', error);
    toast.dismiss(loadingToast);
    toast.error('Kunne ikke generere PDF');
  }
}

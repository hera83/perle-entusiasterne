

# Download PDF på SharedPattern-siden

## Udfordring

Den eksisterende `generatePatternPdf` funktion henter plader og farver direkte fra databasen via Supabase-klienten. På SharedPattern-siden er brugeren typisk IKKE logget ind, så RLS vil blokere disse queries. Men al data er allerede hentet via edge function og ligger i komponentens state.

## Loesning

Udvid `generatePatternPdf.ts` med en ny eksporteret funktion `generatePatternPdfFromData` der accepterer allerede-hentet data (pattern, plates, colors) i stedet for at hente det selv. SharedPattern-siden kalder denne funktion med det data den allerede har.

## AEndringer

### 1. Ny funktion i `src/lib/generatePatternPdf.ts`

Tilfoej en ny eksporteret funktion i bunden af filen:

```text
export async function generatePatternPdfFromData(
  pattern: PatternData,
  plates: PlateData[],
  colorList: ColorInfo[]
): Promise<void>
```

Denne funktion:
- Springer Supabase-queries over (data er allerede givet)
- Bygger `colors` Map fra `colorList` arrayet
- Kalder de samme `drawOverviewPage`, `drawBeadCountPage` og `drawPlatePage` funktioner
- Logger IKKE download til `pdf_downloads` (brugeren er muligvis anonym)
- Viser samme loading/success toasts

### 2. Tilfoej knap i `src/pages/SharedPattern.tsx`

Tilfoej en "Download PDF" knap i sidebar-sektionen (under Pladeinfo-boksen):

```text
<Button onClick={handleDownloadPdf} className="w-full gap-2">
  <Download className="h-4 w-4" />
  Download PDF
</Button>
```

`handleDownloadPdf` funktionen mapper det eksisterende `data` objekt til de forventede typer og kalder `generatePatternPdfFromData`.

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/lib/generatePatternPdf.ts` | Tilfoej `generatePatternPdfFromData` eksport + eksporter `PatternData`, `PlateData`, `ColorInfo` typer |
| `src/pages/SharedPattern.tsx` | Tilfoej Download PDF knap + import af ny funktion |



# Download PDF + Layout-ændringer

## Oversigt

Tre ting skal laves:
1. Fjern "Print plade" fra popup'en
2. Gør knapper i galleri-kortet mindre + tilføj "Download PDF" knap
3. Byg PDF-generering med jsPDF + download-statistik i admin

---

## 1. Fjern "Print plade" fra popup

I `PatternDialog.tsx` fjernes print-knappen og `handlePrint` funktionen samt `Printer`-ikonet fra imports.

---

## 2. Mindre knapper i galleri-kortet

I `PatternCard.tsx` ændres knapperne i CardFooter:
- "Åben" og "Nulstil" knapper: tilføj `h-7 text-xs px-2` for at gøre dem kompakte
- Ny "Download PDF" knap placeres til højre for "Nulstil" med et `FileDown` ikon
- Edit/slet-knapper gøres også lidt mindre med `h-7 w-7`

---

## 3. PDF-generering med jsPDF

### Bibliotek

Installerer `jspdf` - et velafprøvet klient-side PDF-bibliotek med TypeScript-support. Al PDF-generering sker i browseren uden serverafhængigheder.

### Ny fil: `src/lib/generatePatternPdf.ts`

En selvstændig funktion der:
1. Henter al nødvendig data fra databasen (mønster-metadata, alle plader, farver, kategori-navn, skaber-navn)
2. Genererer PDF'en med jsPDF
3. Returnerer PDF'en til download

### PDF-layout

**Side 1 - Overblik:**
- Titel og kategori i toppen
- Linjeskift, derefter metadata: pladedimension, pladebredde x pladehøjde, total antal perler
- Midt på siden: et billede af hele mønsteret tegnet som runde perler UDEN numre og pladedesign, men med svage linjer der viser pladeopdelingen

**Side 2 - Perleoptælling:**
- Overskrift: "Perleoptælling" + totalt antal perler
- To kolonner med: rund perle-cirkel med farvekode i midten, farvenavn, antal

**Side 3+ - Individuelle plader (en side per plade):**
- Header: "Række: X, Plade: Y"
- Farveforklaring: de farver der bruges på den specifikke plade, vist som runde perler med kode + navn
- Perlepladen tegnet med numre langs top og venstre side (som i "Åben"-visningen)

### Tegning af perler i PDF

jsPDF har built-in metoder til at tegne cirkler (`doc.circle()`) og tekst (`doc.text()`). Hver perle tegnes som:
- En fyldt cirkel med perlefarven
- Farvekoden som tekst i midten (med kontrast-beregning for sort/hvid tekst)

### Download-flow

Når brugeren klikker "Download PDF":
1. Vis loading-toast ("Genererer PDF...")
2. Hent data fra databasen (alle plader + farver for mønsteret)
3. Generer PDF'en
4. Download filen som `{titel}.pdf`
5. Log download i databasen (ny tabel)
6. Vis success-toast

---

## 4. Download-statistik

### Ny database-tabel: `pdf_downloads`

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | uuid | Primary key |
| pattern_id | uuid | Foreign key til bead_patterns |
| downloaded_at | timestamptz | Tidspunkt |
| user_id | uuid (nullable) | Bruger-ID (null for anonyme) |

RLS-politik: INSERT tilladt for alle (både logged-in og anonyme), SELECT kun for admins.

### Opdater `get_admin_stats` funktionen

Tilføj `total_downloads` til det eksisterende stats-objekt.

### Opdater AdminDashboard

Tilføj et nyt statistik-kort: "PDF Downloads" med det totale antal downloads.

Tilføj desuden en ny sektion under statistik-kortene: en tabel der viser de mest downloadede opskrifter (top 10) med titel og antal downloads.

---

## Tekniske detaljer

### Filer der oprettes

| Fil | Beskrivelse |
|-----|-------------|
| `src/lib/generatePatternPdf.ts` | PDF-generering med jsPDF |

### Filer der ændres

| Fil | Ændring |
|-----|---------|
| `src/components/gallery/PatternDialog.tsx` | Fjern print-knap |
| `src/components/gallery/PatternCard.tsx` | Mindre knapper, ny "Download PDF" knap |
| `src/components/admin/AdminDashboard.tsx` | Tilføj download-statistik kort + top-10 tabel |

### Database-migrering

```text
-- Ny tabel til download-statistik
CREATE TABLE public.pdf_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  user_id uuid,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.pdf_downloads ENABLE ROW LEVEL SECURITY;

-- Alle kan inserte (logget ind eller ej)
CREATE POLICY "Anyone can log downloads"
  ON public.pdf_downloads FOR INSERT
  WITH CHECK (true);

-- Kun admins kan læse
CREATE POLICY "Admins can read downloads"
  ON public.pdf_downloads FOR SELECT
  USING (is_admin(auth.uid()));

-- Opdater admin stats funktionen
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'total_patterns', (SELECT count(*) FROM bead_patterns),
    'public_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = true),
    'private_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = false),
    'total_categories', (SELECT count(*) FROM categories),
    'total_users', (SELECT count(*) FROM profiles),
    'started_patterns', (SELECT count(*) FROM user_progress),
    'total_downloads', (SELECT count(*) FROM pdf_downloads)
  ) INTO result;

  RETURN result;
END;
$$;
```

### Ny afhængighed

- `jspdf` - klient-side PDF-generering

### `generatePatternPdf.ts` - kernefunktionalitet

```text
import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

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

export async function generatePatternPdf(pattern: PatternData) {
  // 1. Hent alle plader for mønsteret
  const { data: plates } = await supabase
    .from('bead_plates')
    .select('beads, row_index, column_index')
    .eq('pattern_id', pattern.id)
    .order('row_index')
    .order('column_index');

  // 2. Hent alle farver
  const { data: colorData } = await supabase
    .from('bead_colors')
    .select('id, hex_color, name, code');

  const colors = new Map(colorData?.map(c => [c.id, c]) || []);

  // 3. Opret PDF (A4, portrait)
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;

  // --- SIDE 1: Overblik ---
  drawOverviewPage(doc, pattern, plates, colors, ...);

  // --- SIDE 2: Perleoptælling ---
  doc.addPage();
  drawBeadCountPage(doc, plates, colors, ...);

  // --- SIDE 3+: Individuelle plader ---
  for (each plate in plates) {
    doc.addPage();
    drawPlatePage(doc, plate, colors, pattern.plate_dimension, ...);
  }

  // 4. Download
  doc.save(`${pattern.title}.pdf`);

  // 5. Log download
  await supabase.from('pdf_downloads').insert({
    pattern_id: pattern.id,
    user_id: (await supabase.auth.getUser()).data.user?.id || null,
  });
}
```

### Side 1 - Overblikstegning

Tegner hele mønsteret som et samlet grid af runde perler. Beregner beadSize ud fra den samlede bredde/højde af mønsteret, så det passer på A4. Svage grå linjer tegnes mellem plader for at vise opdelingen.

### Side 2 - Perleoptælling

Tæller alle perler på tværs af alle plader, grupperer efter farve-ID, og tegner en to-kolonne oversigt med:
- Rund cirkel med farvekode
- Farvenavn
- Antal

### Side 3+ - Pladevisning

Tegner perlepladen præcis som i "Åben"-visningen med:
- Nummer-akser langs top og venstre side
- Runde perler med farvekode i midten
- Kontrastberegning for tekst (sort/hvid)

### PatternCard.tsx - knap-ændringer

```text
<CardFooter className="flex justify-between gap-1 pt-2">
  <div className="flex gap-1">
    <Button size="sm" onClick={onOpen} className="h-7 text-xs px-2">
      <Eye className="h-3.5 w-3.5 mr-1" />
      Åben
    </Button>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Nulstil
        </Button>
      </AlertDialogTrigger>
      ...
    </AlertDialog>
    <Button size="sm" variant="outline" onClick={handleDownloadPdf} className="h-7 text-xs px-2">
      <FileDown className="h-3.5 w-3.5 mr-1" />
      Download PDF
    </Button>
  </div>
  ...
</CardFooter>
```

### AdminDashboard.tsx - nye elementer

Tilføj "PDF Downloads" som et nyt statistik-kort med `Download`-ikon.

Tilføj en ny sektion under kortene: en "Top 10 mest downloadede" tabel der henter data med en query der joiner `pdf_downloads` med `bead_patterns` og grupperer/tæller.

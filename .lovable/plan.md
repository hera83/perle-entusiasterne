

# Galleri-forbedringer: Layout, paginering, kategorifilter og auto-oprydning

## Oversigt

Fem aendringer til galleriet:

1. Soegefelt flyttes op (mindre whitespace)
2. Opskriftkort goeres mindre - 4 per raekke
3. Sidebaseret visning med 10 opskrifter per side + "Ny"-markering
4. Kategorifiltrering goeres mere synlig og altid tilgaengelig
5. Automatisk sletning af tomme kategorier naar admin sletter en opskrift

---

## 1. Soegefelt flyttes op

I dag har soegefeltet et `min-h-[50vh]` center-layout foer foerste soegning, og `mb-8` efter. Det fylder unodvendigt plads.

### AEndring

- Fjern `min-h-[50vh]` layoutet helt. Soegefelt og titel vises altid kompakt i toppen med `py-4` i stedet for `py-8`
- Behold titel, undertekst og soegefelt - bare med mindre spacing
- "hasSearched"-logikken forenkles: kategorifilter og opskrifter vises altid (ikke kun efter soegning)

---

## 2. Opskriftkort goeres mindre - 4 per raekke

### AEndring i Gallery.tsx

Grid-klassen aendres fra:
```text
grid gap-6 sm:grid-cols-2 lg:grid-cols-3
```
til:
```text
grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

### AEndring i PatternCard.tsx

- `CardTitle` reduceres fra `text-lg` til `text-base`
- Metadata-tekst reduceres fra `text-sm` til `text-xs`
- Ikoner reduceres fra `h-4 w-4` til `h-3.5 w-3.5`
- `CardHeader` og `CardContent` padding reduceres
- Preview-billedet bibeholdes som `aspect-square`

---

## 3. Sidebaseret visning med 10 opskrifter per side

### Ny logik i Gallery.tsx

I stedet for at hente alle opskrifter paa een gang, indfores:
- `currentPage` state (starter paa 1)
- `totalCount` state (total antal opskrifter der matcher filtrene)
- `ITEMS_PER_PAGE = 10` (konstant, 2-3 raekker med 4 kort)

Supabase-queryen udvides med `.range()` for server-side paginering:
```text
const from = (currentPage - 1) * ITEMS_PER_PAGE;
const to = from + ITEMS_PER_PAGE - 1;
request = request.range(from, to);
```

For at faa totalt antal bruges Supabase's `{ count: 'exact', head: false }` option paa select-kaldet.

### "Ny"-markering

Opskrifter der er under 7 dage gamle faar en "Ny" badge i PatternCard:
```text
const isNew = (Date.now() - new Date(pattern.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
```
Badgen vises som en lille groent maerkat i oevre hoejre hjoerne af kortet.

### Pagineringskomponent

Brug den eksisterende `pagination.tsx` UI-komponent. Teksten aendres til dansk ("Forrige"/"Naeste"). Under kortene vises:
- "Forrige" og "Naeste" knapper
- Sidenumre med ellipsis for store antal
- Tekst: "Side X af Y"

Naar man skifter side, scrolles til toppen af opskriftlisten.

---

## 4. Kategorifiltrering goeres mere synlig

I dag er kategorifiltrering gemt bag soegning (vises kun efter `hasSearched = true`) og vist som smaa badges.

### AEndring

- Kategorifilter vises **altid** under soegefeltet - ikke kun efter soegning
- Redesign som en raekke af tydelige filterknapper med storre tekst
- Den valgte kategori faar en solid baggrund (primary), de andre faar outline
- Tilfoej et antal (pattern count) efter hver kategoris navn saa brugeren kan se hvor mange opskrifter der er i hver kategori
- Hent kategori-count fra databasen

---

## 5. Automatisk sletning af tomme kategorier

### Loesning: Database-trigger

Naar en opskrift slettes, skal databasen automatisk tjekke om kategorien nu er tom og i saa fald slette den. Dette goeres med en PostgreSQL trigger-funktion paa `bead_patterns`:

```text
CREATE OR REPLACE FUNCTION public.cleanup_empty_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Hvis den slettede opskrift havde en kategori
  IF OLD.category_id IS NOT NULL THEN
    -- Tjek om der stadig er opskrifter med denne kategori
    IF NOT EXISTS (
      SELECT 1 FROM bead_patterns WHERE category_id = OLD.category_id
    ) THEN
      DELETE FROM categories WHERE id = OLD.category_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cleanup_empty_categories
  AFTER DELETE ON public.bead_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_empty_categories();
```

Dette koerer automatisk ved enhver sletning - baade fra admin-galleriet og alle andre steder. Funktionen er `SECURITY DEFINER` saa den har rettighederne til at slette kategorier uanset hvem der udforer sletningen.

---

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/pages/Gallery.tsx` | Kompakt layout, paginering, altid-synlig kategorifilter, totalCount |
| `src/components/gallery/PatternCard.tsx` | Mindre kort, "Ny"-badge |
| `src/components/gallery/CategoryFilter.tsx` | Storre/tydeligere knapper, pattern count per kategori |
| `src/components/gallery/SearchBar.tsx` | Fjern "Tip" tekst for at spare plads |

### Database-migrering

En ny migrering med trigger-funktionen `cleanup_empty_categories` og triggeren paa `bead_patterns`.

---

## Tekniske detaljer

### Gallery.tsx - Paginering

```text
const ITEMS_PER_PAGE = 10;

// Ny state
const [currentPage, setCurrentPage] = useState(1);
const [totalCount, setTotalCount] = useState(0);

// I fetchPatterns:
let request = supabase
  .from('bead_patterns')
  .select('...', { count: 'exact' })
  ...

const from = (currentPage - 1) * ITEMS_PER_PAGE;
const to = from + ITEMS_PER_PAGE - 1;

const { data, error, count } = await request.range(from, to);
setTotalCount(count || 0);

const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
```

Naar soegning eller kategori aendres, nulstilles `currentPage` til 1.

### Gallery.tsx - Forenklet layout

```text
<div className="container px-4 py-4">
  {/* Header med titel */}
  <div className="text-center mb-4">
    <h1 className="text-3xl font-bold mb-1">Perle Entusiasterne</h1>
    <p className="text-muted-foreground">
      Sog i vores samling af perleplade-opskrifter
    </p>
  </div>

  {/* Soegefelt */}
  <div className="max-w-2xl mx-auto mb-4">
    <SearchBar ... />
  </div>

  {/* Kategorifilter - ALTID synlig */}
  <div className="mb-6">
    <CategoryFilter ... />
  </div>

  {/* Opskriftkort i 4-kolonne grid */}
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    ...
  </div>

  {/* Paginering */}
  <div className="mt-8">
    <Pagination>...</Pagination>
    <p className="text-center text-sm text-muted-foreground mt-2">
      Side {currentPage} af {totalPages}
    </p>
  </div>
</div>
```

### PatternCard.tsx - "Ny" badge

```text
const isNew = (Date.now() - new Date(pattern.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;

// I CardHeader:
{isNew && (
  <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">Ny</Badge>
)}
```

### CategoryFilter.tsx - Med antal

Henter antallet af opskrifter per kategori:
```text
// Hent kategorier med count
const { data } = await supabase
  .from('categories')
  .select('id, name, bead_patterns(count)')
  .order('name');
```

Vises som:
```text
<Button variant={selected ? "default" : "outline"}>
  Disney (3)
</Button>
```

### SearchBar.tsx

Fjern "Tip: Soegning starter automatisk..."-teksten for at spare vertikal plads.


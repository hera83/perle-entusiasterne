
# Popup-layout forbedringer

Tre ændringer til perleopskrift-popuppen (PatternDialog):

## 1. Kompakt header

Headeren reduceres til en kompakt linje med mindre padding. Knapper og titel placeres tæt sammen uden ekstra luft over/under.

- Ændrer `p-4 pb-2` til `px-4 py-2` på DialogHeader
- Reducerer knapperne fra `size="lg"` og `h-12` til `size="sm"` og `h-9`
- Reducerer title-tekst fra `text-xl` til `text-base`

## 2. Dynamisk perlepladevisning

BeadPlateView ændres fra en fast `beadSize` beregning til at fylde den tilgængelige plads dynamisk:

- Wrapperen ændres til at bruge `min-h-0` og `flex-1` så den fylder alt tilgængeligt plads i body-området
- BeadPlateView-komponenten ændres så den modtager en container-ref og beregner `beadSize` ud fra containerens faktiske bredde/højde divideret med `dimension`, i stedet for den faste `Math.floor(600 / dimension)` beregning
- Bruger `ResizeObserver` eller simpel beregning baseret på container-størrelsen

## 3. Thumbnail-billede i sidebar

Det samme preview-billede som vises i galleriet indsættes i sidebaren, mellem "Marker plade som færdig" og "Print plade":

- Udvider `Pattern`-interfacet i PatternDialog med `thumbnail?: string | null`
- Tilføjer `PatternPreview`-komponenten i sidebaren med en ramme rundt
- Opdaterer Favorites.tsx til også at hente `thumbnail` fra databasen, så det virker begge steder

---

## Tekniske detaljer

### PatternDialog.tsx

**Pattern interface** - tilføj `thumbnail`:
```text
interface Pattern {
  id: string;
  title: string;
  category_name: string | null;
  plate_width: number;
  plate_height: number;
  plate_dimension: number;
  thumbnail?: string | null;  // NY
}
```

**Header** - mere kompakt:
```text
<DialogHeader className="px-4 py-2 border-b no-print">
  <div className="flex items-center justify-between">
    <DialogTitle className="text-base">
      ...
    </DialogTitle>
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" ... className="h-9 px-3">
      ...
    </div>
  </div>
</DialogHeader>
```

**Body** - dynamisk perlepladevisning:
```text
<div className="flex-1 overflow-hidden p-4 grid grid-cols-1 md:grid-cols-[1fr_250px] gap-4 min-h-0">
  <div className="flex-1 overflow-auto flex items-center justify-center min-h-0">
    <BeadPlateView ... />
  </div>
  ...
</div>
```

**Sidebar** - tilføj thumbnail mellem checkbox og print-knap:
```text
{/* Marker plade som færdig */}
<div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
  ...
</div>

{/* Thumbnail preview - NY */}
{pattern.thumbnail && (
  <div className="rounded-lg overflow-hidden border bg-muted">
    <PatternPreview thumbnail={pattern.thumbnail} />
  </div>
)}

{/* Print plade */}
<Button onClick={handlePrint} ...>
```

### BeadPlateView.tsx

Ændrer `beadSize`-beregningen til at bruge en container-ref:

```text
// Tilføj containerSize prop (optional)
interface BeadPlateViewProps {
  beads: Bead[];
  colors: Map<string, ColorInfo>;
  dimension: number;
  containerSize?: { width: number; height: number };
}

// Beregn beadSize dynamisk
const beadSize = containerSize
  ? Math.max(16, Math.floor(Math.min(containerSize.width, containerSize.height) / (dimension + 1)))
  : Math.max(20, Math.min(32, Math.floor(600 / dimension)));
```

I PatternDialog bruges `useRef` + `ResizeObserver` til at maale containeren og sende størrelsen videre.

### Favorites.tsx

Tilføj `thumbnail` til Pattern-interfacet og til Supabase-queryen, så thumbnail er tilgængelig når man åbner popuppen fra favoritsiden.

## Filer der ændres

| Fil | Ændring |
|-----|---------|
| `src/components/gallery/PatternDialog.tsx` | Kompakt header, dynamisk beadplate, thumbnail i sidebar |
| `src/components/gallery/BeadPlateView.tsx` | Dynamisk beadSize baseret på container-størrelse |
| `src/pages/Favorites.tsx` | Tilføj `thumbnail` til query og interface |


# Plan: Ny Opskrift i WorkShoppen

## Overblik
Implementer "Ny opskrift"-funktionen i WorkShoppen, hvor brugere kan starte fra bunden og tegne deres egen perleplade-opskrift. Funktionen inkluderer dimensionsvalg, metadata-input, et interaktivt redigerings-grid, og en detaljeret plade-redigerings-popup med tegneværktøjer.

---

## Flow

1. Bruger klikker "Opret ny" i WorkShoppen
2. Dialog åbner med opsætning (dimensioner + metadata)
3. Bruger vælger højde/bredde i antal plader
4. Bruger udfylder titel, kategori (autocomplete), og offentlig/privat
5. Klik "Opret" -> opskrift gemmes i databasen
6. Redigerings-view åbner med grid af plader
7. Bruger klikker "Rediger" på en plade -> redigerings-popup åbner
8. Bruger tegner med værktøjer (vælg farve, pipette, fasthold, erstat, ryd)
9. Gem og luk popup
10. Når færdig: Gem opskrift -> spørg om redirect til Galleri

---

## Komponenter der skal oprettes

### 1. CreatePatternDialog.tsx
En dialog til at oprette en ny opskrift med følgende:

**Formular:**
- **Titel** (påkrævet, tekstfelt)
- **Kategori** (autocomplete fra eksisterende kategorier + mulighed for ny)
- **Offentlig/Privat** (toggle switch)
- **Bredde** (antal plader, 1-10, number input)
- **Højde** (antal plader, 1-10, number input)
- **Perleplade-dimension** (default 29, kan tilpasses)

**Footer:**
- "Annuller" knap
- "Opret opskrift" knap -> gemmer pattern + opretter tomme plader

### 2. PatternEditor.tsx
Hovedkomponent til at redigere en opskrift:

**Header:**
- Titel på opskriften
- Gem-knap, Tilbage-knap

**Body:**
- Grid-visning af alle plader (visuelt overblik)
- Hver plade viser et miniature-preview
- "Rediger" knap på hver plade -> åbner PlateEditorDialog

**Footer:**
- "Gem og afslut" knap
- Ved afslut: spørg om redirect til Galleri

### 3. PatternGridOverview.tsx
Grid-komponent der viser alle plader:

- Viser plader i rows/columns baseret på plate_height/plate_width
- Hver plade er et kort med:
  - Miniature canvas preview (genbruger PatternPreview-logik)
  - "Række X, Plade Y" label
  - "Rediger" knap
- Mulighed for at tilføje/fjerne rækker og kolonner

### 4. PlateEditorDialog.tsx
Popup til at redigere en enkelt plade:

**Header:**
- "Række X, Plade Y" + Luk-knap

**Body (to kolonner):**

*Kolonne 1 - Interaktiv perleplade:*
- 29x29 grid (eller konfigureret dimension)
- Klik for at placere valgt farve
- Klik-og-træk for at tegne flere
- Visuelt som BeadPlateView, men interaktiv

*Kolonne 2 - Værktøjer:*
- **Vælg farve:** Dropdown med alle aktive farver + "Slet farve" option
- **Pipette (scan farve):** Klik på en perle for at vælge dens farve
- **Fasthold farve:** Toggle der tillader tegning ved at trække musen
- **Erstat farve:** Vælg "fra" og "til" farve, erstat på plade eller globalt
- **Ryd plade:** Knap der fjerner alle farver fra pladen

**Footer:**
- "Gem" knap (gemmer ændringer til lokal state)

### 5. InteractiveBeadGrid.tsx
Interaktiv version af BeadPlateView:

- Samme visuelle stil som BeadPlateView
- onClick handler per perle
- onMouseDown + onMouseEnter for "tegn ved træk"
- Highlighter aktuel celle ved hover
- Viser farvekode i hver perle

---

## Værktøjer i PlateEditorDialog

### Vælg farve
- Dropdown med alle aktive farver fra bead_colors
- Viser farve-cirkel + navn + kode
- Inkluderer "Ingen farve" option (slet perle)

### Pipette (Scan farve)
- Klik på pipette-ikon for at aktivere
- Næste klik på en perle vælger dens farve
- Cursor ændres til pipette-ikon

### Fasthold farve (Tegnemodus)
- Toggle switch
- Når aktiv: hold musen nede og træk for at tegne
- Når ikke aktiv: enkelt-klik placerer farve

### Erstat farve
- To dropdown: "Fra farve" og "Til farve"
- Knap "Erstat på denne plade"
- Knap "Erstat på alle plader" (global)

### Ryd plade
- Knap med bekræftelsesdialog
- Fjerner alle farver fra pladen

---

## Database-interaktion

### Opret ny opskrift
```sql
-- 1. Insert pattern
INSERT INTO bead_patterns (title, user_id, category_id, is_public, plate_width, plate_height, plate_dimension)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- 2. Insert tomme plader (width * height antal)
INSERT INTO bead_plates (pattern_id, row_index, column_index, beads)
VALUES ($pattern_id, $row, $col, '[]');
```

### Gem plade-ændringer
```sql
UPDATE bead_plates 
SET beads = $beads, updated_at = now()
WHERE pattern_id = $pattern_id AND row_index = $row AND column_index = $col;
```

### Hent kategorier (autocomplete)
```sql
SELECT DISTINCT name FROM categories ORDER BY name;
```

### Opret/hent kategori
```sql
INSERT INTO categories (name) VALUES ($name) 
ON CONFLICT (name) DO NOTHING
RETURNING id;
```

---

## Fil-struktur

**Nye filer:**
```
src/components/workshop/CreatePatternDialog.tsx
src/components/workshop/PatternEditor.tsx
src/components/workshop/PatternGridOverview.tsx
src/components/workshop/PlateEditorDialog.tsx
src/components/workshop/InteractiveBeadGrid.tsx
src/components/workshop/ColorPicker.tsx
src/components/workshop/EditorToolbar.tsx
```

**Ændrede filer:**
```
src/pages/Workshop.tsx - Tilføj state og dialog
src/App.tsx - Tilføj route for /workshop/edit/:id
```

---

## State-håndtering

### PatternEditor state
- `pattern`: Aktuel opskrift metadata
- `plates`: Map af alle plader med deres bead-data
- `selectedPlate`: Hvilken plade der redigeres
- `hasUnsavedChanges`: Flag for advarsel ved navigation

### PlateEditorDialog state
- `beads`: 2D array af farvekoder
- `selectedColor`: Valgt farve ID
- `tool`: 'draw' | 'pipette' | 'replace'
- `isDrawing`: Boolean for tegnemodus
- `replaceFrom/replaceTo`: Farve-erstatning

---

## Tilføj/Fjern rækker og kolonner

I PatternGridOverview:
- "Tilføj række" knap - tilføjer en ny række i bunden
- "Fjern række" knap - fjerner sidste række (med bekræftelse)
- "Tilføj kolonne" knap - tilføjer kolonne til højre
- "Fjern kolonne" knap - fjerner sidste kolonne (med bekræftelse)

Ved ændring af dimensioner:
- Opdater pattern.plate_width/plate_height
- Insert/delete tilsvarende plader i databasen

---

## Responsivt design

- Popup fylder maksimalt uden scroll (som i planen)
- På tablet: Grid-celler tilpasser størrelse
- Toolbar kan skjules/vises på mindre skærme
- Touch-support for tegning

---

## Tekniske detaljer

### Beads datastruktur
```typescript
interface Bead {
  row: number;
  col: number;
  colorId: string | null;
}

// Lagres som JSON array i bead_plates.beads
```

### Farve-lookup
```typescript
// Hent farver én gang og gem i Map for hurtig lookup
const colors: Map<string, { hex_color: string; name: string; code: string }>
```

### Optimering
- Debounce gemning ved hurtig tegning
- Canvas-baseret preview for performance
- Lazy-load plader kun når de skal vises

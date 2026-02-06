
# Plan: Galleri Forbedringer og Fejlrettelser

## Overblik
Implementerer 7 forbedringer: slet-knap for admins, fix preview-billeder, bedre dialog-layout, progress-tracking fix, maks 3 nyeste på forsiden, interaktiv søgning, og privat/offentlig badge.

---

## Problem 1: Slet-knap for Administratorer

### Nuværende situation
`PatternCard.tsx` har allerede en slet-knap (`canDelete = isAdmin`), men den vises kun i card-footeren. Knappen eksisterer og virker.

### Løsning
Knappen er allerede implementeret i linje 275-298. Den vises kun for admins. **Ingen ændringer nødvendige** - verificer at du er logget ind som admin.

---

## Problem 2: Preview-billeder Viser "Indlæser..."

### Årsag
`PatternPreview.tsx` prøver at hente pattern data med `.single()` i linje 27-31. Hvis der er RLS-problemer eller ingen data, forbliver `loading = true` for evigt.

### Løsning
1. Tilføj error handling der sætter `loading = false` ved fejl
2. Vis en fallback/placeholder ved fejl eller manglende data
3. Tilføj timeout så den ikke hænger for evigt

**Ændringer i PatternPreview.tsx:**
- Tilføj `error` state
- Vis fallback-billede ved fejl
- Sæt `loading = false` i alle tilfælde

---

## Problem 3: Luk-ikon i Kollision med Gem-knap i PatternDialog

### Nuværende situation
`PatternDialog.tsx` bruger standard Dialog X-knappen (automatisk placeret i øverste højre hjørne). Der er ingen eksplicit gem-knap i denne dialog, men X kan kollidere med navigationsknapper.

### Løsning
1. Tilføj `hideCloseButton` prop til DialogContent
2. Tilføj eksplicit "Luk" knap ved siden af navigationsknapperne
3. Layout: `[Titel] [◀ Tilbage] [Position] [Frem ▶] [Luk]`

---

## Problem 4: "Marker plade som færdig" Registrerer Ikke

### Årsag
`saveProgress` funktionen i PatternDialog.tsx bruger `upsert` med `onConflict: 'user_id,pattern_id'`. Dette ser korrekt ud, og der ER en unik constraint på disse kolonner. 

Problemet kan være:
1. RLS-politik tillader muligvis ikke INSERT/UPDATE
2. Frontend-state opdateres ikke korrekt

### Løsning
1. Tjek at RLS tillader INSERT/UPDATE for egen bruger (der ER policies der tillader dette)
2. Tilføj bedre error logging i `saveProgress`
3. Tilføj success/error toast beskeder
4. Refetch progress efter gem for at bekræfte det virker

**Ændringer i PatternDialog.tsx:**
- Tilføj error handling til `togglePlateComplete`
- Vis toast ved fejl
- Trigger callback til parent for at opdatere PatternCard

---

## Problem 5: Maks 3 Nyeste Opskrifter på Forsiden

### Nuværende situation
`Gallery.tsx` linje 76: `.limit(hasSearched ? 50 : 6)` - viser 6 på forsiden.

### Løsning
Ændr `6` til `3`:
```typescript
.limit(hasSearched ? 50 : 3)
```

---

## Problem 6: Interaktiv Søgning (Uden Søg-knap)

### Nuværende situation
`SearchBar.tsx` har en form med submit-knap. Søgning sker kun ved klik eller Enter.

### Løsning
1. Fjern søg-knappen
2. Tilføj debounce på onChange der kalder `onSearch`
3. Brug `useEffect` med 300ms delay for at undgå for mange kald

**Nyt flow:**
- Bruger skriver → 300ms pause → søgning starter automatisk

---

## Problem 7: Privat/Offentlig Badge i PatternCard

### Nuværende situation
`PatternCard.tsx` viser allerede "Privat" badge (linje 179-183). Men du vil have det vist sammen med dato.

### Løsning
Flyt visningen op i metadata-sektionen, før oprettelsesdato:
```tsx
{/* Privat/Offentlig status */}
<div className="flex items-center gap-2 text-muted-foreground">
  {pattern.is_public ? (
    <>
      <Globe className="h-4 w-4" />
      <span>Offentlig</span>
    </>
  ) : (
    <>
      <Lock className="h-4 w-4" />
      <span>Privat</span>
    </>
  )}
</div>
{/* Derefter dato */}
<div className="flex items-center gap-2 text-muted-foreground">
  <Calendar ... />
</div>
```

---

## Fil-ændringer

| Fil | Ændring |
|-----|---------|
| `PatternPreview.tsx` | Error handling, fallback-billede |
| `PatternDialog.tsx` | Eksplicit luk-knap, bedre error handling for progress |
| `Gallery.tsx` | Ændr limit fra 6 til 3 |
| `SearchBar.tsx` | Fjern søg-knap, tilføj debounced onChange |
| `PatternCard.tsx` | Flyt Privat/Offentlig til metadata-sektion |

---

## Tekniske detaljer

### Debounced Søgning
```typescript
const [query, setQuery] = useState(initialValue);

useEffect(() => {
  const timer = setTimeout(() => {
    onSearch(query);
  }, 300);
  return () => clearTimeout(timer);
}, [query]);
```

### PatternDialog Luk-knap
```tsx
<DialogContent hideCloseButton className="...">
  <DialogHeader>
    <div className="flex items-center justify-between">
      <DialogTitle>...</DialogTitle>
      <div className="flex items-center gap-2">
        {/* Navigation */}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Luk
        </Button>
      </div>
    </div>
  </DialogHeader>
</DialogContent>
```

### Progress Error Handling
```typescript
const togglePlateComplete = async () => {
  // ... existing logic ...
  
  setCompletedPlates(newCompleted);
  const result = await saveProgress(newCompleted, currentPosition);
  
  if (result.error) {
    toast.error('Kunne ikke gemme progress');
    // Rollback
    setCompletedPlates(isCompleted ? [...completedPlates, key] : completedPlates.filter(k => k !== key));
  } else {
    toast.success(isCompleted ? 'Markering fjernet' : 'Plade markeret som færdig');
  }
};
```

---

## Visuelt resultat

### PatternCard med status
```
+----------------------------+
| Min opskrift        [🔒] ♥ |
| [Kategori]                 |
+----------------------------+
|  [Preview]  | 🔒 Privat    |
|             | 📅 6. feb    |
|             | 👤 Mig       |
|             | ▢ 2x2 plader |
|             | # 841 perler |
|             | [Progress]   |
+----------------------------+
| [Åben] [Nulstil]    [✏️] [🗑️]|
+----------------------------+
```

### Søgefelt uden knap
```
+------------------------------------------+
| 🔍 Søg efter perleplade-opskrifter...  X |
+------------------------------------------+
  Tip: Søgning starter automatisk
```

### PatternDialog med eksplicit luk
```
+--------------------------------------------------+
| Opskrift (Kategori)    [◀] R1,P1 [▶]      [Luk] |
+--------------------------------------------------+
```


# Plan: Ret PlateEditorDialog Layout og Galleri Visning

## Overblik
Retter tre problemer: 1) Responsiv toolbar i plade-editor, 2) Bedre header layout med knapper på række, 3) Galleri viser nu også private mønstre til ejeren og alt til admins.

---

## Problem 1: Responsiv Toolbar

### Nuværende situation
- Toolbar har fast bredde på `w-64` (256px)
- Når skærmen er for lille, bliver griddet klemt
- Toolbaren har fuld tekst på alle knapper

### Løsning: Kompakt mode for toolbar
Tilføj en `compact` prop til `EditorToolbar` der aktiveres på mindre skærme:

**I PlateEditorDialog:**
- Brug `useIsMobile()` hook til at detektere skærmstørrelse
- Ved kompakt mode: toolbar vises med ikoner i stedet for tekst
- Toolbar bredde reduceres fra `w-64` til `w-14` i kompakt mode

**I EditorToolbar:**
- Ny `compact` prop styrer visningen
- I kompakt mode:
  - Farvevælger bliver en dropdown med kun farve-cirkler
  - Pipette, Fasthold osv. bliver ikon-knapper med tooltip
  - Erstat-sektion kollapser til en knap der åbner en popover
  - Ryd plade forbliver ikon-knap

### Layout-forbedring
- Ændrer dialogen til at bruge `flex-col` på små skærme
- Toolbar flyttes under griddet på mobil i stedet for ved siden af
- Sikrer at griddet altid vises i fuld størrelse

---

## Problem 2: Header med Gem og Luk knapper på række

### Nuværende situation
```tsx
<DialogTitle className="flex items-center justify-between">
  <span>Række X, Plade Y</span>
  <Button>Gem</Button>  // X-knappen er shadcn default, placeret i hjørnet
</DialogTitle>
```

### Løsning
- Fjern den automatiske X-knap fra Dialog
- Tilføj eksplicit "Luk" knap ved siden af "Gem"
- Begge knapper i samme række med tydelig afstand

**Nyt layout:**
```
[Række 1, Plade 1]                    [Luk] [Gem]
```

---

## Problem 3: Galleri viser også private mønstre til ejeren

### Nuværende situation
```tsx
.eq('is_public', true)  // Kun offentlige mønstre vises
```

### Løsning
Opdater Gallery.tsx til at hente mønstre baseret på brugerens status:

**Logik:**
1. Hent altid offentlige mønstre
2. Hvis bruger er logget ind: hent også brugerens egne private mønstre
3. Hvis bruger er admin: hent alle mønstre (offentlige + private)

**SQL-strategi med OR-betingelser:**
```tsx
// Eksempel på logik (pseudokode)
if (isAdmin) {
  // Ingen filter på is_public
} else if (user) {
  // is_public = true ELLER user_id = current_user
  request = request.or(`is_public.eq.true,user_id.eq.${user.id}`);
} else {
  // Kun offentlige
  request = request.eq('is_public', true);
}
```

**PatternCard opdatering:**
- Tilføj `is_public` til Pattern interface (allerede der)
- Vis et "Privat" badge på kort der ikke er offentlige
- Brug lås-ikon eller anden visuel indikator

---

## Fil-ændringer

| Fil | Ændring |
|-----|---------|
| `src/components/workshop/PlateEditorDialog.tsx` | Responsiv layout, eksplicit luk-knap |
| `src/components/workshop/EditorToolbar.tsx` | Tilføj `compact` prop og kompakt visning |
| `src/pages/Gallery.tsx` | Opdater fetch til at inkludere private mønstre |
| `src/components/gallery/PatternCard.tsx` | Vis "Privat" badge |

---

## Tekniske detaljer

### EditorToolbar compact mode
- Bruger Tooltip på alle ikon-knapper
- Farvevælger: viser kun cirkel i trigger, dropdown har fuld info
- Erstat-sektion: Popover med samme indhold som nu
- Bredde: `w-14` i compact, `w-64` i normal

### Dialog responsivt layout
```tsx
// Detect compact mode
const isMobile = useIsMobile();
const isCompact = isMobile || windowWidth < 900;

// Layout
<div className={`flex ${isCompact ? 'flex-col' : 'flex-row'} gap-4`}>
  {/* Grid first, always full size */}
  <div className="flex-shrink-0">
    <InteractiveBeadGrid ... />
  </div>
  {/* Toolbar adapts */}
  <EditorToolbar compact={isCompact} ... />
</div>
```

### Galleri query med Supabase OR
```tsx
const { user, isAdmin } = useAuth();

let request = supabase.from('bead_patterns').select(...);

if (isAdmin) {
  // Hent alle - ingen filter
} else if (user) {
  request = request.or(`is_public.eq.true,user_id.eq.${user.id}`);
} else {
  request = request.eq('is_public', true);
}
```

---

## Visuelt resultat

### PlateEditorDialog - Kompakt mode
```
+------------------------------------------+
| Række 1, Plade 1          [Luk] [💾 Gem] |
+------------------------------------------+
|                                          |
|     [29x29 Perleplade Grid]              |
|                                          |
+------------------------------------------+
| [🎨] [💧] [✏️] [🔄] [🗑️]                |
+------------------------------------------+
```

### PatternCard med Privat badge
```
+----------------------------+
| Min opskrift       [🔒]  ♥ |
| [Kategori] [Privat]        |
| ...                        |
+----------------------------+
```

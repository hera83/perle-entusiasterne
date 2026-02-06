
# Plan: Ret Galleri-fejl og Tilføj Manuel Toolbar-toggle

## Identificerede Problemer

### Problem 1: Galleriet viser ingen opskrifter (400 fejl)
**Årsag:** Gallery.tsx prøver at joine `bead_patterns` med `profiles(display_name)`, men der er ingen foreign key mellem tabellerne. Supabase returnerer fejl 400.

**Løsning:** 
1. Tilføj foreign key fra `bead_patterns.user_id` til `profiles.user_id`
2. Alternativt: Hent skaber-navn separat med en database-funktion

Jeg vælger option 1 (foreign key) da det er den reneste løsning og du ønsker at vise skaber-navn for alle.

### Problem 2: Værktøjslinjen kan ikke minimeres manuelt
**Årsag:** Den nuværende logik bruger kun automatisk detektion (`windowWidth < 900`). Brugeren har ingen kontrol.

**Løsning:** Tilføj en toggle-knap i PlateEditorDialog headeren der lader brugeren selv vælge om toolbar skal være i kompakt mode.

---

## Database-ændring

### Tilføj Foreign Key
```sql
-- Tilføj foreign key fra bead_patterns.user_id til profiles.user_id
ALTER TABLE public.bead_patterns
ADD CONSTRAINT bead_patterns_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);
```

---

## Kode-ændringer

### 1. PlateEditorDialog.tsx - Tilføj manuel toggle

Tilføj en ny state-variabel og knap:

```typescript
// Ny state
const [forceCompact, setForceCompact] = useState(false);

// Opdateret logik
const autoCompact = isMobile || windowWidth < 900;
const isCompact = forceCompact || autoCompact;
```

Tilføj knap i headeren ved siden af Luk/Gem:

```tsx
<Button 
  variant="ghost"
  size="icon"
  onClick={() => setForceCompact(!forceCompact)}
  title={forceCompact ? 'Vis fuld værktøjslinje' : 'Minimer værktøjslinje'}
>
  {forceCompact ? <Maximize2 /> : <Minimize2 />}
</Button>
```

### 2. Gallery.tsx - Ret query for at virke med foreign key

Når foreign key er på plads, vil den eksisterende query virke:
```typescript
.select(`
  ...,
  profiles(display_name)  // Nu understøttet via FK
`)
```

---

## Fil-ændringer

| Fil | Ændring |
|-----|---------|
| Database migration | Tilføj FK fra `bead_patterns.user_id` til `profiles.user_id` |
| `PlateEditorDialog.tsx` | Tilføj `forceCompact` state og toggle-knap |

---

## Visuelt resultat

### PlateEditorDialog med toggle
```
+--------------------------------------------------+
| Række 1, Plade 1    [↔️] [Luk] [💾 Gem]         |
+--------------------------------------------------+
|                                                  |
|     [29x29 Perleplade Grid]      | [Toolbar]    |
|                                  | eller        |
|                                  | [Ikoner]     |
+--------------------------------------------------+
```

Knappen [↔️] skifter mellem fuld og kompakt toolbar-visning.

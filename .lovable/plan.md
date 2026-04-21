
## Plan: Galleri-paginering pr. række + auto-næste ved markering

### a) Dynamisk sidestørrelse (3 rækker pr. side)

Galleriet bruger faste breakpoints: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (1 / 2 / 3 / 4 kolonner). I dag er sidestørrelsen hardcodet til 10. Vi gør den responsiv så den altid svarer til **3 fyldte rækker**:

- Mobil (1 kol): 3 cards
- `sm` (2 kol): 6 cards
- `lg` (3 kol): 9 cards
- `xl` (4 kol): 12 cards

**Implementering i `src/pages/Gallery.tsx`:**
- Erstat `const ITEMS_PER_PAGE = 10` med en `useState`-værdi der opdateres via en lille hook der lytter på `window.innerWidth` og matcher Tailwind-breakpoints (`sm` ≥ 640, `lg` ≥ 1024, `xl` ≥ 1280).
- Når sidestørrelsen ændres (fx bruger ændrer vinduesstørrelse), nulstil til side 1 og refetch.
- `totalPages` regnes ud fra dynamisk værdi.
- Send den dynamiske værdi med ind i `range(from, to)`-kaldet.

Dermed bliver sidste række altid fyldt op (medmindre der reelt er færre opskrifter tilbage), og pagineringen fungerer stadig som i dag.

### b) Auto-naviger til næste plade når man markerer som færdig

I `src/components/gallery/PatternDialog.tsx` håndterer `togglePlateComplete` kun selve check-state. Vi udvider den så **når brugeren markerer pladen som færdig** (ikke når den fjernes igen), navigeres der automatisk til næste plade — hvis der findes en.

**Logik i `togglePlateComplete`:**
1. Beregn `newCompleted` som nu.
2. Gem progress.
3. Hvis pladen netop blev markeret færdig (`!isCompleted`) **og** `canGoNext`:
   - Vent kort (≈250 ms via `setTimeout`) så brugeren ser checken bliver sat og toast vises.
   - Kald `navigate('next')`.
4. Hvis det var sidste plade i mønstret: vis i stedet en lille "Tillykke, alle plader færdige!"-toast og bliv på pladen.
5. Ved af-markering: behold nuværende adfærd (ingen navigation).

Sikrer god UX: man kan tjekke af og fortsætte uden at skulle trykke "Frem" manuelt.

### Filer der ændres
- `src/pages/Gallery.tsx` — dynamisk `itemsPerPage` baseret på viewport-bredde + resize-handler.
- `src/components/gallery/PatternDialog.tsx` — auto-navigation efter `togglePlateComplete` når plade markeres færdig.

### Bemærkninger
- Ingen database- eller backend-ændringer.
- Virker både i cloud og local mode.
- Eksisterende paginering, søgning og kategorifilter er uændret.

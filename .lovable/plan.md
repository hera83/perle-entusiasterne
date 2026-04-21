
## Plan: Smartere paginering ved mange sider

I dag vises alle sidetal i én lang række, hvilket bryder layoutet når der bliver mange sider. Vi gør pagineringen kompakt og responsiv så den altid fylder samme højde uanset antallet af sider.

### Løsning

I `src/pages/Gallery.tsx` opdateres `renderPageNumbers()` og selve paginerings-UI'et:

**1. Kompakt sidetal-visning (allerede delvist på plads)**
Funktionen `renderPageNumbers()` bruger allerede ellipsis-logik (1 … 4 5 6 … 20), men vinduet omkring nuværende side er smalt. Vi udvider den så den altid viser:
- Første side
- Op til 1 side før og efter nuværende
- Sidste side
- Ellipsis (…) hvor der springes over

På mobil reduceres det yderligere: kun nuværende side vises mellem første og sidste (fx `1 … 7 … 20`), så knapperne aldrig wrapper.

**2. Skjul Forrige/Næste-tekst på små skærme**
"Forrige" og "Næste" erstattes af kun pile-ikoner under `sm`-breakpoint via `<span className="hidden sm:inline">`. Dermed fylder de mindre på mobil.

**3. Sikr at rækken ikke wrapper**
Tilføj `flex-wrap justify-center` som fallback hvis det alligevel sker, så det stadig ser pænt ud i ekstreme tilfælde (>50 sider).

**4. Tilføj "Side X af Y"-tekst** (allerede til stede) — beholdes som visuel ankerpunkt.

### Eksempel på resultat

- 3 sider: `‹ Forrige  1  2  3  Næste ›`
- 20 sider, side 7: `‹ Forrige  1 … 6 7 8 … 20  Næste ›`
- Mobil, 20 sider, side 7: `‹  1 … 7 … 20  ›`

### Filer der ændres
- `src/pages/Gallery.tsx` — udvid `renderPageNumbers()` med mobil-variant via `useIsMobile()`-hook (eksisterer allerede i `src/hooks/use-mobile.tsx`), og skjul prev/next-tekst under `sm`.

### Bemærkninger
- Ingen backend- eller database-ændringer.
- Virker i både cloud og local mode.
- Eksisterende dynamisk sidestørrelse (3/6/9/12 cards) påvirkes ikke.

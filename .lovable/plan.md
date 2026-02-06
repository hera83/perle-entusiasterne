
# Plan: Ret PlateEditorDialog Layout og Galleri Visning

## Status: ✅ IMPLEMENTERET

## Overblik
Rettede tre problemer: 1) Responsiv toolbar i plade-editor, 2) Bedre header layout med knapper på række, 3) Galleri viser nu også private mønstre til ejeren og alt til admins.

---

## Implementerede ændringer

### Problem 1: Responsiv Toolbar ✅
- Tilføjet `compact` prop til `EditorToolbar`
- I kompakt mode vises ikoner med tooltips i stedet for fuld tekst
- Farvevælger og erstat-sektion bruger popovers i kompakt mode
- Layout skifter til `flex-col` på små skærme (toolbar under griddet)

### Problem 2: Header med Gem og Luk knapper på række ✅
- Tilføjet `hideCloseButton` prop til `DialogContent` komponent
- Eksplicit "Luk" og "Gem" knapper side om side i headeren
- Ingen risiko for at trykke forkert længere

### Problem 3: Galleri viser private mønstre til ejeren ✅
- Admins ser alle mønstre (ingen filter)
- Loggede brugere ser offentlige + deres egne private mønstre
- Gæster ser kun offentlige mønstre
- Private mønstre vises med lås-ikon og "Privat" badge

---

## Fil-ændringer

| Fil | Ændring |
|-----|---------|
| `src/components/ui/dialog.tsx` | Tilføjet `hideCloseButton` prop |
| `src/components/workshop/PlateEditorDialog.tsx` | Responsiv layout, eksplicit luk-knap |
| `src/components/workshop/EditorToolbar.tsx` | Tilføjet `compact` prop og kompakt visning |
| `src/pages/Gallery.tsx` | Opdateret fetch til at inkludere private mønstre |
| `src/components/gallery/PatternCard.tsx` | Vis "Privat" badge og lås-ikon |

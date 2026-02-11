
# Gør plade-editor dialogen større

## Ændring

Udvid dialogen så perlepladen får mere plads og scrollbaren ikke dukker op så hurtigt:

- **max-h**: Øg fra `95vh` til `98vh` så dialogen bruger næsten hele skærmhøjden
- **ScrollArea max-h**: Øg fra `70vh` til `82vh` så selve perle-området får markant mere plads
- **Padding**: Tilføj lidt mere luft omkring grid-området

## Teknisk detalje

Én fil ændres: `src/components/workshop/PlateEditorDialog.tsx`

- Linje 162: `max-h-[95vh]` → `max-h-[98vh]`
- Linje 197: `max-h-[70vh]` → `max-h-[82vh]`

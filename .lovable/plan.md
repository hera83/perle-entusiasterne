

# Fuld-opskrift Preview - Stort skarpt billede af hele monsteret

## Oversigt

En ny "Preview"-knap og popup der viser hele opskriften som et stort, skarpt billede genereret dynamisk fra perledataen. Billedet viser perler med deres rigtige farver (uden farvekoder i midten), med lette skillelinjer mellem pladerne.

## Hvad din kone vil opleve

- I galleriet: En ny oje-ikon-knap ved siden af "Aben opskrift" som aabner et stort preview
- I editoren: En ny oje-ikon-knap til venstre for "Gem alt" som kun er aktiv naar alt er gemt
- Popuppen: Fyldt med et skarpt, farverigt billede af hele opskriften der fylder bredden, med scrollbar for hoeje moenstre

## Teknisk implementering

### 1. Ny komponent: `src/components/gallery/PatternFullPreview.tsx`

En dialog-komponent der:
- Modtager `patternId` (eller pattern-data direkte) og aabner en popup
- Henter alle plader og farver fra databasen
- Tegner hele monsteret paa et HTML Canvas element:
  - Perler som fyldte cirkler med deres rigtige farver (INGEN farvekoder/tal i midten)
  - Tynd graa kant paa hver perle for at give dybde
  - Lette skillelinjer (lysegraa) mellem pladerne, ligesom i PDF'en
  - Skarpe farver (ingen graatoning)
- Canvas fylder dialogens fulde bredde med en lille margin
- Vertikal scroll hvis monsteret er hojere end viewporten

**Smart tilfoejelse**: En "Download som billede"-knap i popuppen der gemmer canvas'et som PNG-fil. Saa kan din kone nemt dele billedet eller bruge det som reference paa telefonen uden at aabne en PDF.

### 2. AEndring: `src/components/gallery/PatternCard.tsx`

- Tilfoej ny knap (Image/ZoomIn ikon) ved siden af Eye-knappen (linje 383-385)
- Knappen aabner PatternFullPreview med pattern.id

### 3. AEndring: `src/components/workshop/PatternEditor.tsx`

- Tilfoej ny knap til venstre for "Gem alt" (omkring linje 638)
- Knappen er `disabled={hasUnsavedChanges}` saa den kun virker naar alt er gemt
- Aabner PatternFullPreview med patternId

### Canvas-tegnelogik (kernen)

```text
1. Hent alle plader og farver fra databasen
2. Byg et komplet grid (totalRows x totalCols)
3. Beregn beadSize saa bredden fylder containeren (containerWidth / totalCols)
4. For hver perle:
   - Tegn fyldt cirkel med perlens farve
   - Tegn tynd graa kant (strokeStyle = #ccc, lineWidth = 0.5)
   - Tomme felter: lys graa cirkel
5. Tegn skillelinjer mellem plader:
   - Lodret linje for hver plate_width graense
   - Vandret linje for hver plate_height graense
   - Farve: rgba(150, 150, 150, 0.4) - synlig men ikke dominerende
6. Canvas hoejde beregnes automatisk ud fra aspect ratio
```

### Dialog-opsaetning

- Samme storrelse som PatternDialog: `max-w-[95vw] max-h-[95vh]`
- Header med titel + "Download PNG" knap + "Luk" knap
- Body: Kun canvas-billedet i en scrollbar container
- Canvas bredde: 95% af dialogens bredde
- Canvas hoejde: beregnet fra aspect ratio (kan vaere hojere end viewporten = scroll)

### Filer der oprettes/aendres

| Fil | AEndring |
|-----|---------|
| `src/components/gallery/PatternFullPreview.tsx` | **NY** - Preview dialog med canvas-rendering |
| `src/components/gallery/PatternCard.tsx` | Tilfoej preview-knap i footer |
| `src/components/workshop/PatternEditor.tsx` | Tilfoej preview-knap ved "Gem alt" |

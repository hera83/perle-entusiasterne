
# Auto-beregn højde ud fra billedets dimensioner

## Hvad aendres
I stedet for at brugeren skal angive baade bredde og hoejde (antal plader), skal brugeren kun angive **bredden**. Hoejden beregnes automatisk ud fra det beskaarne billedes proportioner.

## Beregningslogik
Efter beskaering kender vi billedets bredde og hoejde i pixels (`cropRect.width` og `cropRect.height`). Naar brugeren vaelger antal plader i bredden og perler per plade, beregner vi hoejden:

```text
totalPixelBredde = plateWidth * plateDimension
skaleringsforhold = totalPixelBredde / cropRect.width
totalPixelHoejde = cropRect.height * skaleringsforhold
plateHeight = Math.max(1, Math.round(totalPixelHoejde / plateDimension))
```

## Aendringer i ImportImageDialog.tsx

1. **Fjern `plateHeight` som bruger-input** – det bliver en beregnet vaerdi i stedet
2. **Tilfoej `useEffect`** der genberegner `plateHeight` automatisk naar `plateWidth`, `plateDimension` eller `cropRect` aendres
3. **Erstat hoejde-inputfeltet** med en skrivebeskyttet visning der viser den beregnede hoejde (f.eks. en nedtonet tekst eller et disabled input med forklaring)
4. **Opdater overblik-boksen** saa den ogsaa viser at hoejden er automatisk beregnet

### Konkrete UI-aendringer i Settings-trinnet
- **Bredde-feltet** forbliver som det er (brugeren kan aendre det)
- **Hoejde-feltet** vises som skrivebeskyttet med en hjaelpetekst: "Beregnet automatisk ud fra billedets proportioner"
- **Overblik-boksen** viser de beregnede vaerdier med en note om aspektratio

Ingen aendringer i `imageUtils.ts` – al logik er allerede fleksibel nok til at haandtere vilkaarlige `plateWidth`/`plateHeight` vaerdier.


# Importer Billede – WorkShop

## Oversigt
Tilfoej funktionen "Importer billede" i WorkShoppen, saa brugere kan uploade et billede, beskaere det, og faa det konverteret til en perleplade-opskrift. Alt billedbehandling sker i browseren (ingen AI eller server noedvendigt).

## Brugerflow

```text
+---------------------+
| Klik "Vaelg billede" |
+---------------------+
         |
         v
+-------------------------+
| 1. Upload billede       |
|    (JPG/PNG, max 10MB)  |
+-------------------------+
         |
         v
+-------------------------+
| 2. Beskaer billedet     |
|    (traek i hjoerner)   |
+-------------------------+
         |
         v
+----------------------------+
| 3. Vaelg plade-dimensioner |
|    - Bredde (antal plader) |
|    - Hoejde (antal plader) |
|    - Perler per plade (29) |
|    - Titel + kategori      |
+----------------------------+
         |
         v
+----------------------------+
| 4. Preview: Se resultatet  |
|    som perle-gitter         |
|    (naermeste farve-match)  |
+----------------------------+
         |
         v
+----------------------------+
| 5. Bekraeft -> Opret       |
|    pattern + plates i DB   |
|    -> Naviger til editor   |
+----------------------------+
```

## Hvad bliver bygget

### 1. ImportImageDialog (ny komponent)
En dialog med en trinvis wizard:

- **Trin 1 – Upload**: Vaelg billede fra computeren. Vis billedet i en canvas.
- **Trin 2 – Beskaer**: Simpel beskaerings-funktion med et rektangulaert udvalgsfelt som brugeren kan traekke og justere over billedet. Ingen ekstra biblioteker – implementeres med mus/touch-events paa en canvas.
- **Trin 3 – Indstillinger**: Titel, kategori (genbrug CreatePatternDialog-logikken), antal plader i bredde/hoejde, pladedimension, offentlig/privat.
- **Trin 4 – Preview**: Vis en canvas-preview af det konverterede perle-mooenster. Brugeren kan se hvordan billedet vil se ud som perler foer de bekraefter. Vis ogsaa statistik: antal farver brugt, total antal perler.
- **Bekraeft**: Opret opskriften i databasen og naviger til editoren.

### 2. Farve-matching algoritme (ren klient-kode)
Konverterer hvert pixel i det beskaarne billede til den naermeste perlefarve:

1. Skalerer billedet ned til maal-stoerrelsen (plader x dimension)
2. Laeser RGB-vaerdien for hvert pixel
3. Beregner farveafstand (Euklidisk distance i RGB-rummet) til alle aktive perlefarver
4. Vaelger den naermeste farve for hvert pixel
5. Springer helt hvide/transparente pixels over (ingen perle)

### 3. Opdatering af Workshop.tsx
- Aktiver "Vaelg billede"-knappen (fjern `disabled` og "Kommer snart")
- Tilfoej state for ImportImageDialog
- Forbind knappen til dialogen

## Filer der oprettes/aendres

| Fil | Handling |
|-----|----------|
| `src/components/workshop/ImportImageDialog.tsx` | **NY** – Wizard-dialog med upload, beskaering, indstillinger og preview |
| `src/components/workshop/imageUtils.ts` | **NY** – Hjaelpefunktioner til billedbehandling og farve-matching |
| `src/pages/Workshop.tsx` | **AENDRING** – Aktiver import-knappen og tilfoej ImportImageDialog |

## Tekniske detaljer

### Farve-matching (imageUtils.ts)

```typescript
// Beregn Euklidisk farveafstand
function colorDistance(r1, g1, b1, r2, g2, b2): number {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

// Find naermeste perlefarve for et pixel
function findNearestColor(r, g, b, colors): ColorInfo | null {
  // Spring hvide/naesten-hvide pixels over
  if (r > 240 && g > 240 && b > 240) return null;
  
  let nearest = null;
  let minDist = Infinity;
  for (const color of colors) {
    const dist = colorDistance(r, g, b, color.r, color.g, color.b);
    if (dist < minDist) {
      minDist = dist;
      nearest = color;
    }
  }
  return nearest;
}
```

### Beskaerings-logik (canvas-baseret)
- Tegn billedet paa en canvas
- Tegn et semi-transparent overlay med et rektangulaert "hul"
- Brugeren kan traekke i kanterne/hjoernerne for at justere udvalget
- Ved bekraeftelse: brug `ctx.drawImage()` med source-rektanglet til at uddrage det beskaarne omraade

### Database-oprettelse (genbruger eksisterende mooenster)
- Opretter `bead_patterns` med valgte indstillinger
- Opretter `bead_plates` med de genererede perledata (beads JSON)
- Genererer thumbnail som ved "Gem alt" i editoren
- Navigerer til `/workshop/{patternId}`

### Afhaengigheder
- Ingen nye npm-pakker noedvendige
- Alt billedbehandling bruger native Canvas API
- Genbruger eksisterende Supabase-klient og typer

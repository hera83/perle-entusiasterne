

# Plan: Tilføj Admin-rolle og Generer Preview-thumbnails

## Problem 1: Ingen slet-knap synlig

### Årsag
Tabellen `user_roles` er tom. Din bruger (heine@ramskov.cc) har ingen admin-rolle, derfor er `isAdmin` altid `false`, og slet-knappen skjules.

### Losning
Tilføj admin-rollen via en database-migration:
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('e9253e57-d54a-4ad4-96ca-155162ce787f', 'admin');
```

---

## Problem 2: Ingen preview-billeder i galleriet

### Årsag
Der findes ingen gemt thumbnail. `PatternPreview` prøver at generere et canvas-billede dynamisk, men det fungerer ikke pålideligt. Der mangler en mekanisme til at generere og gemme et thumbnail når man trykker "Gem alt".

### Losning
1. Tilføj en `thumbnail` kolonne i `bead_patterns` tabellen (text, til base64 data-URL)
2. Generer et canvas-thumbnail i `PatternEditor.tsx` under "Gem alt"
3. Opdater `PatternPreview.tsx` til at vise det gemte thumbnail i stedet for dynamisk generering

### Database-aendring
```sql
ALTER TABLE public.bead_patterns
ADD COLUMN thumbnail text;
```

### Thumbnail-generering i PatternEditor (handleSaveAll)
Tilføj en funktion der:
1. Opretter et offscreen canvas (200x200 pixels)
2. Tegner alle pladers perler med korrekte farver
3. Eksporterer til base64 PNG (`canvas.toDataURL('image/png', 0.8)`)
4. Gemmer resultatet i `bead_patterns.thumbnail`

```text
+-------------------+
|  Gem alt klikket   |
+-------------------+
        |
        v
+-------------------+
| Gem plader (beads) |
+-------------------+
        |
        v
+----------------------------+
| Generer thumbnail canvas   |
| (200x200 px, alle plader)  |
+----------------------------+
        |
        v
+----------------------------+
| Konverter til base64 PNG   |
+----------------------------+
        |
        v
+----------------------------+
| Gem thumbnail + total_beads |
| i bead_patterns             |
+----------------------------+
```

### Opdateret PatternPreview
Forenklet komponent der:
- Viser det gemte thumbnail som et `<img>` tag
- Hvis intet thumbnail: viser "Ingen preview" med et ikon
- Ingen dynamisk canvas-generering meer (fjerner 3 ekstra API-kald per kort)

---

## Fil-aendringer

| Fil | AEndring |
|-----|---------|
| Database migration | Tilføj admin-rolle + thumbnail kolonne |
| `PatternEditor.tsx` | Generer og gem thumbnail ved "Gem alt" |
| `PatternPreview.tsx` | Vis gemt thumbnail (img tag) i stedet for dynamisk canvas |

---

## Tekniske detaljer

### Thumbnail-generator funktion
```typescript
const generateThumbnail = (): string | null => {
  const canvas = document.createElement('canvas');
  const maxSize = 200;
  const totalWidth = pattern.plate_width * pattern.plate_dimension;
  const totalHeight = pattern.plate_height * pattern.plate_dimension;
  const scale = Math.min(maxSize / totalWidth, maxSize / totalHeight);
  
  canvas.width = Math.ceil(totalWidth * scale);
  canvas.height = Math.ceil(totalHeight * scale);
  const ctx = canvas.getContext('2d');
  
  // Baggrund
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Tegn alle plader
  plates.forEach(plate => {
    const offsetX = plate.column_index * pattern.plate_dimension * scale;
    const offsetY = plate.row_index * pattern.plate_dimension * scale;
    
    plate.beads.forEach(bead => {
      if (bead.colorId) {
        const color = colorMap.get(bead.colorId);
        ctx.fillStyle = color?.hex_color || '#ccc';
        ctx.fillRect(
          offsetX + bead.col * scale,
          offsetY + bead.row * scale,
          Math.max(scale, 1),
          Math.max(scale, 1)
        );
      }
    });
  });
  
  return canvas.toDataURL('image/png', 0.8);
};
```

### Forenklet PatternPreview
```typescript
export const PatternPreview = ({ patternId, thumbnail }) => {
  if (!thumbnail) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
        <ImageOff className="h-8 w-8" />
        <span className="text-xs">Ingen preview</span>
      </div>
    );
  }
  
  return (
    <img 
      src={thumbnail} 
      alt="Pattern preview" 
      className="w-full h-full object-contain"
    />
  );
};
```

### PatternCard opdatering
PatternCard skal videregive thumbnail til PatternPreview:
- Tilfoej `thumbnail` til Pattern interface
- Hent `thumbnail` i Gallery.tsx query
- Send som prop: `<PatternPreview thumbnail={pattern.thumbnail} />`

---

## Visuelt resultat

### Galleri med thumbnails
```
+----------------------------+
| Test plade          [🔒] ♥ |
| [Kategori]                 |
+----------------------------+
|  [Thumbnail]  | Offentlig  |
|  (200x200)    | 6. feb     |
|  gemt som     | Heine      |
|  base64 PNG   | 2x1 plader |
|               | 20 perler  |
|               | [Progress] |
+----------------------------+
| [Åben] [Nulstil]  [✏️] [🗑️]|
+----------------------------+
```

Slet-knappen (🗑️) vises nu fordi admin-rollen er tildelt.


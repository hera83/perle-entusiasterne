

# Tydelig forskel mellem tomme og hvide perler

## Problem
Tomme pladefelter (ingen perle) og hvide perler ligner hinanden for meget i full preview, fordi tomme felter tegnes som lysegra cirkler (`#e6e6e6`) som ligner hvide perler (`#ffffff`).

## Losning
Tegn slet ikke en fyldt cirkel for tomme felter. I stedet vises kun en meget svag stiplet cirkelomrids, sa man kan se at der er en position, men det er tydeligt at den er tom. Hvide perler forbliver som solide hvide cirkler med kant.

### Visuel forskel
- **Hvid perle**: Solid hvid cirkel med tynd gra kant (som nu)
- **Tom position**: Ingen fyldt cirkel, kun en meget svag stiplet cirkelomrids (`rgba(200, 200, 200, 0.3)`)

## Teknisk aendring

### Fil: `src/components/gallery/PatternFullPreview.tsx`

AEndre tegnelogikken for tomme felter (ca. linje 115-120):

**Fra:**
```typescript
// Empty bead
ctx.beginPath();
ctx.arc(cx, cy, radius, 0, Math.PI * 2);
ctx.fillStyle = '#e6e6e6';
ctx.fill();
```

**Til:**
```typescript
// Empty position - subtle dashed outline only
ctx.beginPath();
ctx.arc(cx, cy, radius, 0, Math.PI * 2);
ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
ctx.lineWidth = 0.5;
ctx.setLineDash([2, 2]);
ctx.stroke();
ctx.setLineDash([]);
```

Dette giver en klar visuel forskel: hvide perler er solide cirkler, tomme positioner er naesten usynlige stiplede omrids.


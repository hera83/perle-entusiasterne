

# Flyt "Ugemte ændringer" til header + Større PDF-skrifttype

## 1. Flyt "Ugemte ændringer" op i headeren

Problemet er at teksten "Ugemte ændringer" vises i bunden af dialogen som et ekstra element der kun dukker op ved første ændring, hvilket skubber layoutet.

### Løsning

Fjern den separate blok i bunden (linje 265-270) og flyt indikatoren op i headeren ved siden af "Række X, Plade Y" teksten. Den vises altid i headeren -- enten som en synlig amber-indikator eller som usynlig placeholder -- så headeren har fast højde uanset om der er ændringer.

**Ændring i `src/components/workshop/PlateEditorDialog.tsx`:**

I DialogTitle, efter `<span>Række {rowIndex + 1}, Plade {columnIndex + 1}</span>`, tilføjes:

```text
{hasChanges && (
  <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1 font-normal">
    <span className="w-2 h-2 rounded-full bg-amber-500" />
    Ugemte ændringer
  </span>
)}
```

Og den eksisterende blok i bunden (linje 265-270) fjernes helt.

---

## 2. Større skrifttype i PDF-perler

Teksten i perlerne er stadig for lille. Skriftstørrelsen skaleres nu markant op.

### Ændringer i `src/lib/generatePatternPdf.ts`:

**drawBead (linje 71):** Ændrer default fontSize fra `Math.max(5, radius * 1.1)` til `Math.max(5, radius * 1.6)` -- dette gør teksten ca. 45% større og fylder mere af perlen.

**Side 2 - perleoptælling (linje 253):** Ændrer fontSize fra `6` til `7` for koden inde i perlen.

**Side 3+ - pladesider (linje 355):** Ændrer `codeFontSize` fra `Math.min(7, beadSize * 0.7)` til `Math.min(9, beadSize * 0.9)` for bedre læsbarhed.

**Legende-perler (linje 313):** Ændrer fontSize fra `5` til `6`.

**Vertikal centrering (linje 75):** Ændrer `y + actualFontSize * 0.12` til `y + actualFontSize * 0.13` for bedre centrering med den større skrift.

---

## Filer der ændres

| Fil | Ændring |
|-----|---------|
| `src/components/workshop/PlateEditorDialog.tsx` | Flyt "Ugemte ændringer" fra bund til header |
| `src/lib/generatePatternPdf.ts` | Øg skriftstørrelse i drawBead, perleoptælling, pladesider og legende |

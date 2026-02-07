

# PDF skriftstorrelse + Baggrundsfjerning som valgfrit step

## 1. Storre skrifttype i PDF-perler

Problemet er at `fontSize` i `drawBead`-funktionen er sat til 5 som default, og plade-siderne beregner `codeFontSize = Math.min(5, beadSize * 0.5)`. Disse vaerdier er for smaa til at vaere laesbare.

### AEndringer i `src/lib/generatePatternPdf.ts`:

- **drawBead default fontSize**: aendres fra `5` til `fontSize` beregnet som `radius * 1.1` (saa teksten skalerer med perlens stoerrelse)
- **Side 2 (perleoptaelling)**: `beadRadius` er `3` - fonten aendres fra `5` til `6`
- **Side 3+ (pladesider)**: `codeFontSize` aendres fra `Math.min(5, beadSize * 0.5)` til `Math.min(7, beadSize * 0.7)` saa den fylder mere af perlen
- **Legende-perlerne**: fonten aendres fra `4` til `5`
- Vertikal justering af tekst i perler opdateres ogsaa saa den centreres bedre

---

## 2. Baggrundsfjerning som valgfrit step med tolerancejustering

### Hvad sker der i dag

I `imageUtils.ts` springer `findNearestColor` automatisk over:
- Transparente pixels (alpha < 128)
- Naesten-hvide pixels (r > 240 AND g > 240 AND b > 240)

Det betyder at hvid/lys baggrund altid fjernes - brugeren har ingen kontrol over dette.

### Ny tilgang

Tilfoej to nye kontroller i "Indstillinger"-stepet i ImportImageDialog:

1. **"Fjern baggrund" toggle** (default: FRA) - naar slaaet fra, mappes ALLE pixels til naermeste perlefarve
2. **"Baggrundstolerance" slider** (kun synlig naar toggle er TIL, range 200-255, default 240) - styrer hvor "hvid" en pixel skal vaere for at blive behandlet som baggrund

### Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/lib/generatePatternPdf.ts` | Stoerre fontstoerrelser i drawBead, perleoptaelling og pladesider |
| `src/components/workshop/imageUtils.ts` | convertImageToBeads faar nye parametre: removeBackground + tolerance |
| `src/components/workshop/ImportImageDialog.tsx` | Ny toggle + slider i settings-stepet, parametre sendes videre |

### Tekniske detaljer

#### imageUtils.ts - findNearestColor

```text
// FOER:
function findNearestColor(r, g, b, a, colorPalette) {
  if (a < 128) return null;
  if (r > 240 && g > 240 && b > 240) return null;
  ...
}

// EFTER: tilfoej removeBackground og tolerance parametre
function findNearestColor(r, g, b, a, colorPalette, removeBackground, bgTolerance) {
  if (a < 128) return null;  // transparente pixels springes altid over
  if (removeBackground && r > bgTolerance && g > bgTolerance && b > bgTolerance) return null;
  ...
}
```

#### imageUtils.ts - convertImageToBeads

Funktionen faar to nye valgfrie parametre:

```text
export function convertImageToBeads(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  colors: BeadColor[],
  removeBackground: boolean = true,   // NY - default true for bagudkompatibilitet
  bgTolerance: number = 240           // NY
)
```

#### ImportImageDialog.tsx - Nyt i settings-stepet

Tilfoej efter "Offentlig opskrift" toggle:

```text
// Ny state
const [removeBackground, setRemoveBackground] = useState(false);
const [bgTolerance, setBgTolerance] = useState(240);

// I settings UI:
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label>Fjern baggrund</Label>
    <p className="text-xs text-muted-foreground">
      Fjerner hvide/lyse pixels og goer dem gennemsigtige.
    </p>
  </div>
  <Switch checked={removeBackground} onCheckedChange={setRemoveBackground} />
</div>

{removeBackground && (
  <div className="grid gap-2">
    <Label>Baggrundstolerance ({bgTolerance})</Label>
    <Slider min={200} max={255} value={[bgTolerance]} onValueChange={([v]) => setBgTolerance(v)} />
    <p className="text-xs text-muted-foreground">
      Lavere vaerdi = kun de hvideste pixels fjernes. Hoejere = flere lyse farver fjernes.
    </p>
  </div>
)}
```

Parametrene sendes videre til `convertImageToBeads` i `generatePreview`:

```text
const result = convertImageToBeads(
  croppedCanvas, targetWidth, targetHeight, beadColors,
  removeBackground, bgTolerance
);
```

#### generatePatternPdf.ts - Stoerre fontstoerrelser

```text
// drawBead: fontSize default aendres fra 5 til beregnet vaerdi
const drawBead = (doc, x, y, radius, color, showCode = true, fontSize?: number) => {
  ...
  if (showCode && color.code) {
    const actualFontSize = fontSize ?? Math.max(5, radius * 1.1);
    doc.setFontSize(actualFontSize);
    doc.text(color.code, x, y + actualFontSize * 0.12, { align: 'center' });
  }
};

// Side 2: beadRadius er 3, fontSize aendres fra 5 til 6
doc.setFontSize(6);

// Side 3+: codeFontSize aendres
const codeFontSize = Math.min(7, beadSize * 0.7);

// Legende: fontSize aendres fra 4 til 5
doc.setFontSize(5);
```

### Forventet resultat

- PDF: farvekoderne i perlerne er tydeligt laesbare uden at aendre perlens stoerrelse
- Billedimport: brugeren kan valgfrit slaa baggrundsfjerning til/fra og justere tolerancen
- Default er INGEN baggrundsfjerning (alle pixels mappes til naermeste farve)
- Naar baggrundsfjerning er slaaet til, virker det praecis som foer med justerbar tolerance


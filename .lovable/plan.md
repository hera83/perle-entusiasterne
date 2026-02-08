

# Tre smaa rettelser

## 1. Kun fornavn i PDF

**Fil**: `src/lib/generatePatternPdf.ts` (linje 141)

Nuvaerende kode:
```text
doc.text(`Skaber: ${pattern.creator_name}`, margin, y);
```

AEndres til:
```text
doc.text(`Skaber: ${pattern.creator_name.split(' ')[0]}`, margin, y);
```

Simpel aendring - tager kun foerste ord (fornavn) ligesom vi allerede goer i PatternCard.

---

## 2. Workshop-layout og hjaelpetekst for brugere

**Fil**: `src/pages/Workshop.tsx`

To aendringer:

### 2a. Grid fylder hele siden naar Farve-administration er skjult
AEndr grid-klassen saa den tilpasser sig antallet af synlige kort:

```text
// Fra:
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

// Til:
<div className={`grid gap-6 ${isAdmin ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'}`}>
```

Med kun 2 kort (Importer billede + Ny opskrift) giver `md:grid-cols-2` et paent layout uden et tomt tredje felt.

### 2b. Skjul Farve-administration hjaelpetekst for ikke-admins
Wrap det tredje listepunkt i `{isAdmin && (...)}`:

```text
<ol className="list-decimal list-inside space-y-2 text-muted-foreground">
  <li>Importer billede: ...</li>
  <li>Ny opskrift: ...</li>
  {isAdmin && (
    <li>Farve-administration: ...</li>
  )}
</ol>
```

---

## 3. Vis alle farver i rediger-popuppen og sorter dem

**Fil**: `src/components/workshop/PatternEditor.tsx` (linje 147-151)

Nuvaerende kode henter kun aktive farver:
```text
.from('bead_colors')
.select('id, hex_color, name, code')
.eq('is_active', true)
.order('code');
```

AEndres til at hente ALLE farver (aktive og inaktive):
```text
.from('bead_colors')
.select('id, hex_color, name, code')
.order('code');
```

`.eq('is_active', true)` filteret fjernes. `.order('code')` bibeholdes saa farverne sorteres med laveste kode foerst. Da `code` allerede bruges som sorteringsnogle og er et kort tekstfelt (f.eks. "01", "02"), vil dette give den oenskede raekkefoelge.

Billedimport-dialogen (`ImportImageDialog.tsx`) beholder sit `is_active`-filter, da aktiver/deaktiver-funktionen netop er tiltaenkt billedkonvertering.

---

## Oversigt

| Fil | AEndring |
|-----|---------|
| `src/lib/generatePatternPdf.ts` | Vis kun fornavn ved "Skaber:" |
| `src/pages/Workshop.tsx` | Responsivt grid for 2 kort + skjul admin-hjaelpetekst |
| `src/components/workshop/PatternEditor.tsx` | Fjern `is_active` filter saa alle farver vises i editoren |


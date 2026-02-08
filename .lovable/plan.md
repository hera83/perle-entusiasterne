
# To rettelser: Undertekst + Opskrifts-link deling

## 1. Skift undertekst i Galleriet

**Fil**: `src/pages/Gallery.tsx` (linje 173)

AEndr teksten fra:
```text
Søg i vores samling af perleplade-opskrifter
```
til:
```text
Find inspiration, del glæde og byg med perler
```

Simpel tekstaendring - ingen logik.

---

## 2. Opskrifts-link deling (ny funktion)

### Oversigt

En ny knap i PatternCard's footer (til hoejre for PDF-download), der kopierer et delingslink til udklipsholderen. Linket aabner en ny dedikeret side der viser opskriften i et stoerre, standalone format - uden soegning, filtre eller andre galleri-funktioner. Siden er tilgaengelig for ALLE (ogsaa anonyme brugere og private opskrifter).

### Delings-mekanisme: Share Token

Da private opskrifter er beskyttet af RLS (kun ejer og admin kan se dem), kan vi ikke bare bruge pattern-ID'et i URL'en. I stedet:

1. Tilfoej en `share_token` kolonne (UUID) til `bead_patterns`
2. Naar brugeren klikker "Del link", genereres en unik token (hvis den ikke allerede eksisterer) og gemmes paa opskriften
3. URL'en bruger denne token: `/opskrift/<share_token>`
4. En edge function henter opskriften via service role (bypass RLS) baseret paa token

### Database-aendring

Tilfoej kolonne til `bead_patterns`:
```text
ALTER TABLE bead_patterns ADD COLUMN share_token UUID DEFAULT NULL;
CREATE UNIQUE INDEX idx_bead_patterns_share_token ON bead_patterns(share_token) WHERE share_token IS NOT NULL;
```

### Edge Function: `get-shared-pattern`

Ny edge function der:
1. Modtager `share_token` som query parameter
2. Bruger service role til at hente opskriften (bypasser RLS)
3. Henter tilhoerende plader og farver
4. Returnerer alt data samlet til klienten

Returnerer:
```text
{
  pattern: { id, title, category_name, creator_name (fornavn), plate_width, plate_height, plate_dimension, total_beads, thumbnail },
  plates: [{ row_index, column_index, beads }],
  colors: [{ id, hex_color, name, code }]
}
```

### Ny side: `src/pages/SharedPattern.tsx`

En standalone side med:
- Simpelt header med link tilbage til galleriet ("Gaa til Galleriet")
- Opskriftens titel, kategori, skaber (fornavn), metadata
- Stoerre preview-billede (thumbnail)
- Plade-navigation (som i PatternDialog men i fuld side-format)
- BeadPlateView til at vise den aktuelle plade
- Footer med copyright

Ingen soegning, ingen favorit-knapper, ingen rediger-funktioner. Rent visnings-format.

### AEndringer i PatternCard

Tilfoej en ny ikon-knap (Link/Share ikon) efter PDF-download knappen:
- Ved klik: kalder Supabase for at generere/hente share_token
- Kopierer URL'en til udklipsholderen
- Viser toast: "Link kopieret til udklipsholder"

### Routing

Tilfoej ny route i `App.tsx`:
```text
<Route path="/opskrift/:shareToken" element={<SharedPattern />} />
```

---

## Filer der aendres/oprettes

| Fil | AEndring |
|-----|---------|
| `src/pages/Gallery.tsx` | AEndr undertekst |
| `src/components/gallery/PatternCard.tsx` | Tilfoej "Del link" knap |
| `supabase/functions/get-shared-pattern/index.ts` | NY - Edge function til at hente delt opskrift |
| `src/pages/SharedPattern.tsx` | NY - Standalone visningsside |
| `src/App.tsx` | Tilfoej route `/opskrift/:shareToken` |
| Database migration | Tilfoej `share_token` kolonne til `bead_patterns` |

---

## Brugerflow

```text
1. Bruger ser opskrift i galleriet
2. Klikker paa "Del link" knappen (Link-ikon)
3. System genererer share_token (UUID) og gemmer det
4. URL kopieres til udklipsholderen
5. Bruger deler URL'en (social medie, besked, email)
6. Modtager aabner linket
7. SharedPattern-siden henter data via edge function
8. Opskriften vises i fuld stoerrelse uden login-krav
```

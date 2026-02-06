
# Plan: Farve-Administration i WorkShoppen

## Overblik
Implementer Farve-administrations popup i WorkShoppen, hvor brugere kan se, tilføje, redigere og slette perlefarver. Ændringer gemmes først når brugeren trykker "Gem" - ingen automatisk gemning.

## Komponenter der skal oprettes

### 1. ColorManagementDialog.tsx
En popup-dialog med følgende funktionalitet:

**Header:**
- Titel: "Farve-administration"
- Forklarende tekst: "Administrer dine perlefarver. Ændringer gemmes først når du trykker Gem."

**Body - Farvetabel:**
| Farve | Kode | Navn | HEX | Aktiv | Handlinger |
|-------|------|------|-----|-------|------------|
| [cirkel] | 01 | Hvid | #FFFFFF | [switch] | Rediger / Slet |

- Farvevisning: Rund cirkel med baggrundfarven
- Kode: Tekstfelt (string, f.eks. "01")
- Navn: Tekstfelt (f.eks. "Hvid")
- HEX: Farve-input med color picker
- Aktiv: Switch/toggle til at aktivere/deaktivere farver
- Handlinger: Rediger og Slet knapper

**Tilføj ny farve:**
- Knap "Tilføj farve" åbner inline formular eller separat række
- Felter: Kode, Navn, HEX-farve, Aktiv (default: true)

**Footer:**
- "Annuller" knap - lukker uden at gemme
- "Gem ændringer" knap - gemmer alle ændringer til databasen

### 2. Lokal state-håndtering
- Hent farver fra database ved åbning
- Gem ændringer lokalt i component state
- Marker ændringer som "unsaved" (vis indikator)
- Ved "Gem": sammenlign med original og udfør INSERT/UPDATE/DELETE
- Ved "Annuller": nulstil til original state

### 3. Workshop.tsx opdatering
- Aktiver "Åben farver" knappen (fjern disabled)
- Tilføj state til at styre dialog åben/lukket
- Importér og brug ColorManagementDialog

## Database-interaktion

**Læs farver:**
```sql
SELECT * FROM bead_colors ORDER BY code
```

**Gem ændringer (batch):**
- Nye farver: INSERT INTO bead_colors
- Ændrede farver: UPDATE bead_colors WHERE id = ...
- Slettede farver: DELETE FROM bead_colors WHERE id = ...

## Validering
- Kode: Påkrævet, unik
- Navn: Påkrævet
- HEX: Påkrævet, valid HEX format (#RRGGBB)

## Brugeroplevelse
- Bekræftelsesdialog ved sletning af farve
- Toast-besked ved succesfuld gemning
- Advarsel hvis bruger lukker med ugemte ændringer
- Hjælpetekster på alle felter (tooltips/labels)

## Tekniske detaljer

**Nye filer:**
- `src/components/workshop/ColorManagementDialog.tsx` - Hovedkomponent
- `src/components/workshop/ColorRow.tsx` - Enkelt farve-række (optional, kan være inline)

**Ændrede filer:**
- `src/pages/Workshop.tsx` - Tilføj dialog og state

**UI-komponenter brugt:**
- Dialog, DialogContent, DialogHeader, DialogFooter fra shadcn
- Table, TableHeader, TableBody, TableRow, TableCell
- Input, Button, Switch, Label
- AlertDialog for bekræftelse ved sletning

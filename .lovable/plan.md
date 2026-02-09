

# 6 rettelser fra brugertests

## 1. Fjern tooltip i plade-editoren og goer dialogen bredere

**Problem**: Tooltip-popuppen paa perler i redigerings-dialogen generer brugeren og bloekerer adgang til naboeperlerne. Derudover er perlepladen lidt klemt saa scrollbaren gaar ind over den.

**Loesning**:
- **InteractiveBeadGrid.tsx**: Fjern Tooltip-wrapperen helt fra perlerne i editoren. Behold kun den rene `<div>` med mouse-handlers. Tooltip giver ingen vaerdi under redigering - brugeren kan allerede se farvekoden paa perlen.
- **PlateEditorDialog.tsx**: Goer dialogen bredere ved at aendre `max-w-[95vw]` til `max-w-[98vw]` og tilfoej mere padding til scroll-omraadet.

**Filer**: `src/components/workshop/InteractiveBeadGrid.tsx`, `src/components/workshop/PlateEditorDialog.tsx`

---

## 2. Spaer/laaas brugere i administrationen

**Problem**: Administratorer skal kunne spaerre en bruger (ikke admin), saa de ikke kan logge ind. Ved login-forsoeg skal brugeren se en besked om at kontakte en administrator.

**Loesning**:
- **Database**: Tilfoej en `is_banned` boolean kolonne til `profiles` tabellen (default `false`).
- **Edge function** (`admin-manage-user`): Tilfoej en ny action `ban-user` og `unban-user` der saetter `is_banned` flaget. Beskyt mod at spaerre administratorer.
- **AuthContext.tsx**: Efter succesfuldt login, tjek `profiles.is_banned`. Hvis `true`, vis fejlbesked og kald `signOut()` med det samme.
- **UserManagement.tsx**: Tilfoej en "Spaer"/"Aktiver" knap per bruger (ikke vist for admin-brugere). Vis status med et badge.

**Filer**: Database migration, `supabase/functions/admin-manage-user/index.ts`, `src/contexts/AuthContext.tsx`, `src/components/admin/UserManagement.tsx`

---

## 3. Sorter farver numerisk efter kode

**Problem**: Farver sorteres som strenge i databasen (`order('code')`), saa "109" kommer foer "11". Brugeren forventer numerisk sortering.

**Loesning**: I alle steder hvor farver hentes og sorteres, tilfoej en klient-side sort efter fetch:
```text
colors.sort((a, b) => parseInt(a.code) - parseInt(b.code))
```

Dette skal goeres i:
- `PatternEditor.tsx` (linje 150)
- `ImportImageDialog.tsx` (linje 154)
- `ColorManagementDialog.tsx` (linje 83)
- `EditorToolbar.tsx` (alle dropdown-lister bruger `colors` prop'en - sorteres foer den sendes)
- `PatternDialog.tsx` (linje 150)
- `generatePatternPdf.ts` (linje 400)

Alternativt: da `code` altid er et heltal, kan vi tilfoeje `::int` cast i SQL-queryen, men det er ikke muligt via Supabase JS client. Klient-side sort er den simpleste og mest konsistente loesning.

**Filer**: Alle filer der fetcher fra `bead_colors`

---

## 4. Top 10 downloads - to kolonner (total og denne maaned)

**Problem**: Admin-dashboardet viser kun een total top-10 liste. Brugeren oensker en side-by-side visning med "alle tider" til venstre og "denne maaned" til hoejre.

**Loesning**:
- **AdminDashboard.tsx**: Tilfoej en ny state `topDownloadsMonth` og en `fetchTopDownloadsMonth()` funktion der filtrerer paa `downloaded_at >= start af aktuel maaned`.
- Vis de to tabeller side om side i et 2-kolonne grid layout.

**Filer**: `src/components/admin/AdminDashboard.tsx`

---

## 5. Gem aendringer foer "erstat farve" paa pladen

**Problem**: Naar brugeren redigerer perler manuelt og derefter bruger "erstat farve paa plade", nulstilles de manuelle aendringer fordi erstatningen koerer paa den lokale `beads` state som allerede indeholder aendringerne, men `handleReplaceOnPlate` i `PlateEditorDialog` arbejder korrekt paa den lokale state. 

Lad mig kigge naermere... Faktisk ser koden korrekt ud: `handleReplaceOnPlate` kalder `setBeads(prev => ...)` som arbejder paa den aktuelle lokale state. Problemet maa vaere med "Alle plader" (global replace) - den kalder `onReplaceColorGlobal` som opdaterer parent-state, og naar dialogen lukkes/genaabnes, resetter den lokale state fra den nye `initialBeads` som nu er aendret af global replace, men de lokale ugemte aendringer gaar tabt.

**Loesning**: I `PlateEditorDialog`, naar `handleReplaceGlobal` kaldes: gem foerst de lokale aendringer til parent via `onSave(beads)`, og derefter kald `onReplaceColorGlobal`. Opdater ogsaa den lokale state med farve-erstatningen saa dialogen forbliver synkroniseret.

```text
const handleReplaceGlobal = useCallback(() => {
  if (!replaceFromColorId) return;
  // 1. Gem lokale aendringer foerst
  onSave(beads);
  // 2. Udfoerf global erstatning (opdaterer ALLE plader inkl. den aktuelle)
  onReplaceColorGlobal(replaceFromColorId, replaceToColorId);
  // 3. Opdater lokal state saa den matcher
  setBeads(prev => prev.map(bead => {
    if (bead.colorId === replaceFromColorId) {
      return { ...bead, colorId: replaceToColorId };
    }
    return bead;
  }).filter(bead => bead.colorId !== null));
}, [...]);
```

**Filer**: `src/components/workshop/PlateEditorDialog.tsx`

---

## 6. AEndr galleri-undertekst

**Problem**: Underteksten skal aendres fra "byg med perler" til "perl med perler".

**Loesning**: Simpel tekstaendring i `Gallery.tsx` linje 173.

**Filer**: `src/pages/Gallery.tsx`

---

## Teknisk oversigt

| Fil | AEndring |
|-----|---------|
| `src/components/workshop/InteractiveBeadGrid.tsx` | Fjern Tooltip fra perler |
| `src/components/workshop/PlateEditorDialog.tsx` | Bredere dialog + gem foer global replace |
| Database migration | Tilfoej `is_banned` til `profiles` |
| `supabase/functions/admin-manage-user/index.ts` | Tilfoej ban/unban actions |
| `src/contexts/AuthContext.tsx` | Tjek `is_banned` ved login |
| `src/components/admin/UserManagement.tsx` | Tilfoej spaer/aktiver knap og status |
| `src/components/workshop/PatternEditor.tsx` | Numerisk sort af farver |
| `src/components/workshop/ImportImageDialog.tsx` | Numerisk sort af farver |
| `src/components/workshop/ColorManagementDialog.tsx` | Numerisk sort af farver |
| `src/components/gallery/PatternDialog.tsx` | Numerisk sort af farver |
| `src/lib/generatePatternPdf.ts` | Numerisk sort af farver |
| `src/components/admin/AdminDashboard.tsx` | To-kolonne top 10 layout |
| `src/pages/Gallery.tsx` | AEndr undertekst |


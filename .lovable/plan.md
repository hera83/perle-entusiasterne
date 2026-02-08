

# 5 Blandede Rettelser

## 1. Vis kun fornavn paa opskrift-kort

**Nuvaerende**: PatternCard viser `pattern.creator_name` som er det fulde `display_name` fra profiles-tabellen.

**Aendring**: Ekstraher foerste ord (fornavn) fra `creator_name` ved visning.

### Filer der aendres:
- `src/components/gallery/PatternCard.tsx` - Tilfoej en hjaepler til at tage foerste ord af `creator_name`

```text
// Linje 332: AEndre fra:
<span className="truncate">{pattern.creator_name || 'Ukendt'}</span>

// Til:
<span className="truncate">{pattern.creator_name?.split(' ')[0] || 'Ukendt'}</span>
```

Det samme moenster anvendes ogsaa i PDF-generering (`generatePatternPdf.ts`), men der beholder vi fuldt navn da PDF er privat for brugeren.

---

## 2. Farve-administration kun for administratorer

**Nuvaerende**: Alle indloggede brugere ser "Farve-administration" kortet i WorkShoppen.

**Aendring**: Brug `isAdmin` fra `useAuth()` til at skjule kortet for almindelige brugere.

### Filer der aendres:
- `src/pages/Workshop.tsx` - Tilfoej `isAdmin` fra useAuth og wrap Farve-administration kortet i `{isAdmin && (...)}`

---

## 3. Toolbar altid kompakt i plade-editoren

**Nuvaerende**: PlateEditorDialog har en fuld vertikal toolbar i hoejre side, med mulighed for at minimere/udvide via en knap.

**Aendring**: 
- Fjern toggle-knappen (PanelLeft/PanelLeftClose)
- Fjern `forceCompact` state og `autoCompact` logik
- Altid vis den kompakte toolbar
- Placer den kompakte toolbar i hoejre side (ikke under grid'et)

### Filer der aendres:
- `src/components/workshop/PlateEditorDialog.tsx`:
  - Fjern `forceCompact` state, `windowWidth` state, resize-listener, `autoCompact`/`isCompact` beregninger
  - Fjern toggle-knappen fra headeren
  - AEndr layout til altid at bruge `flex-row` med den kompakte toolbar i hoejre side
  - Toolbar-omraadet bliver en smal kolonne (`w-auto flex-shrink-0`) med den kompakte toolbar renderet vertikalt

Kompakt toolbar layout i hoejre side:

```text
<div className="flex flex-row gap-4 overflow-hidden">
  {/* Grid area */}
  <ScrollArea className="flex-1 max-h-[70vh]">
    <InteractiveBeadGrid ... />
  </ScrollArea>

  {/* Compact toolbar - right side, vertical strip */}
  <div className="flex-shrink-0">
    <EditorToolbar compact ... />
  </div>
</div>
```

Da compact-mode allerede renderer en horisontal toolbar med wrap, skal `EditorToolbar` ogsaa tilpasses til at vise ikonerne vertikalt naar den er i hoejre side. Vi tilfoej en `vertical` prop:

- `src/components/workshop/EditorToolbar.tsx`:
  - Tilfoej `vertical?: boolean` prop
  - Naar `compact && vertical`: brug `flex-col` i stedet for `flex-row` / `flex-wrap`, saa ikonerne stables lodret

---

## 4. Vis brugerens fornavn i headeren

**Nuvaerende**: Headeren viser ikke hvem der er logget ind.

**Aendring**: Vis brugerens fornavn til venstre for Favoritter-knappen. Hent det fra `user.user_metadata.display_name` (sat ved oprettelse) eller fra profiles-tabellen.

Da `user.user_metadata.display_name` allerede er tilgaengeligt paa auth-user objektet (det saettes ved signup/create-user), kan vi bruge det direkte uden ekstra database-kald.

### Filer der aendres:
- `src/components/layout/Header.tsx`:
  - Ekstraher fornavn: `user?.user_metadata?.display_name?.split(' ')[0]`
  - Vis det som tekst til venstre for Favoritter-knappen
  - Skjules paa meget smaa skaerme (`hidden sm:block`)

```text
{user && (
  <span className="text-sm font-medium hidden sm:block">
    {user.user_metadata?.display_name?.split(' ')[0] || ''}
  </span>
)}
```

---

## 5. Bruger-administration: rediger-popup og forbedret tabel

### 5a. Tabel-aendringer

**Nuvaerende kolonner**: Navn | Rolle (dropdown) | Oprettet | Handlinger (slet)

**Nye kolonner**: Navn | Oprettet | Sidst logget ind | Handlinger (rediger + slet ikoner)

- Fjern rolle-dropdown fra tabellen
- Tilfoej "Sidst logget ind" kolonne
- AEndr Handlinger til to ikon-knapper: Rediger (Pencil) og Slet (Trash2)
- Vis rolle som Badge ved siden af navnet

### 5b. Hent "sidst logget ind" via edge function

Profiles-tabellen har ikke `last_sign_in_at`. Denne info findes kun i auth.users (via admin API). Vi opretter en ny edge function `admin-list-users` der:

1. Verificerer at kalderen er admin
2. Bruger `adminClient.auth.admin.listUsers()` til at hente alle brugeres `last_sign_in_at`
3. Returnerer et map af `user_id -> last_sign_in_at`

### 5c. Rediger-popup (ny dialog)

En dialog der aabnes ved klik paa Rediger-ikonet, med felter for:
- **Navn** (display_name) - opdateres i profiles-tabellen
- **Email** - opdateres via edge function (admin API)
- **Rolle** (admin/user dropdown) - opdateres i user_roles-tabellen
- **Nulstil adgangskode** - knap der genererer en ny adgangskode via edge function

### 5d. Edge function: `admin-manage-user`

Ny edge function der haandterer admin-operationer:

```text
POST /admin-manage-user
Body: {
  action: 'list-users' | 'update-user' | 'reset-password',
  userId?: string,
  email?: string,
  displayName?: string,
  role?: 'admin' | 'user',
  newPassword?: string,
}
```

Operationer:
- `list-users`: Returnerer alle brugere med `last_sign_in_at` fra admin API
- `update-user`: Opdaterer email (via admin API), display_name (profiles), rolle (user_roles)
- `reset-password`: Saetter ny adgangskode via `adminClient.auth.admin.updateUserById()`

### Filer der oprettes:
- `supabase/functions/admin-manage-user/index.ts` - Ny edge function

### Filer der aendres:
- `src/components/admin/UserManagement.tsx` - Komplet redesign af tabel og tilfoejelse af rediger-dialog

### Database-aendringer:
Ingen - vi bruger eksisterende tabeller og admin API via edge function.

---

## Oversigt over alle filaendringer

| Fil | AEndring |
|-----|---------|
| `src/components/gallery/PatternCard.tsx` | Vis kun fornavn |
| `src/pages/Workshop.tsx` | Skjul Farve-admin for ikke-admins |
| `src/components/workshop/PlateEditorDialog.tsx` | Altid kompakt toolbar, hoejre side, fjern toggle |
| `src/components/workshop/EditorToolbar.tsx` | Tilfoej `vertical` prop for lodret compact-layout |
| `src/components/layout/Header.tsx` | Vis brugerens fornavn |
| `src/components/admin/UserManagement.tsx` | Redesign tabel + tilfoej rediger-dialog |
| `supabase/functions/admin-manage-user/index.ts` | NY - Admin bruger-operationer |


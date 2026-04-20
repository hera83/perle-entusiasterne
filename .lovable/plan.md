

User wants admins to also reassign pattern owner via the metadata edit dialog in PatternCard. Need to add a user/owner selector.

Plan:

## Plan: Tilføj ejer-redigering for administratorer

Udvid metadata-dialogen i `PatternCard.tsx`, så administratorer udover titel og kategori også kan ændre ejeren (creator) af en opskrift. Dette løser problemet efter import mellem systemer, hvor bruger-IDs ikke matcher.

### Funktionalitet
- Admin åbner "Ret metadata" på en opskrift (eksisterende knap, gear-ikon).
- Et nyt felt "Ejer" vises **kun for admins** — almindelige ejere ser det ikke.
- Feltet er en søgbar dropdown (Combobox) med alle brugere fra `profiles`, som viser `display_name` (eller email som fallback).
- Den nuværende ejer er forvalgt.
- Ved gem opdateres `bead_patterns.user_id` sammen med titel/kategori i samme kald.

### Tekniske ændringer

**`src/components/gallery/PatternCard.tsx`**
- Tilføj state: `editUserId`, `users` (liste af `{user_id, display_name, email}`), `userPickerOpen`.
- I `handleOpenMetaDialog`: hvis `isAdmin`, hent brugere via `db.from('profiles').select('user_id, display_name, email').eq('is_deleted', false).order('display_name')`.
- I `handleSaveMeta`: byg update-objekt dynamisk — inkluder `user_id: editUserId` kun hvis admin og værdien er ændret.
- UI: Tilføj nyt afsnit i dialogen (kun synligt når `isAdmin`) med Label "Ejer" og en `Command`/`Popover`-baseret søgbar liste (genbrug shadcn `command.tsx` + `popover.tsx`), så admin nemt kan finde rette bruger blandt mange.
- Efter gem trigges `onDelete?.()` (eksisterende reload-mekanisme), så listen genindlæses og det nye creator-navn vises.

### Bemærkninger
- Eksisterende RLS-policy på `bead_patterns` tillader allerede admins at opdatere alle felter inkl. `user_id`.
- Ingen database-ændringer nødvendige.
- Lokal backend (`server/src/index.ts`) bruger samme update-endpoint, så det virker i begge modes uden ændringer.
- Privacy-reglen om kun fornavn på offentlige visninger påvirkes ikke — kun selve admin-dialogen viser fulde navne/emails.




# Soft-delete bruger-system + oprydning af karsten@test.dk

## Oversigt

Ny slettelogik: Hvis en bruger har opskrifter, soft-deletes den (markeres som slettet, skjules fra admin). Hvis ingen opskrifter, slettes den helt. Ved genbrug af email genaktiveres den soft-deletede bruger.

## Oprydning

Sletter `karsten@test.dk` fra auth-systemet (har ingen profil, roller eller opskrifter - kun en foraeldre-loes auth-post).

## Database-aendring

Tilfoej `is_deleted` boolean kolonne til `profiles` tabellen (default `false`).

```text
ALTER TABLE public.profiles ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
```

## Edge function: `admin-manage-user` - ny delete-logik

Aendr `delete-user` action:

1. Tjek om brugeren har opskrifter i `bead_patterns`
2. **Ingen opskrifter**: Slet helt (user_roles, profiles, auth user) - som nu
3. **Har opskrifter**: Soft-delete:
   - Saet `is_deleted = true` og `is_banned = true` paa profilen
   - Slet fra `user_roles`
   - Slet auth-brugeren (saa email frigives til genbrug)

## Edge function: `create-user` - genaktivering

Aendr oprettelses-flowet:

1. Foer oprettelse, tjek om der findes en profil med `is_deleted = true` for en bruger med samme email (via auth admin API lookup eller direkte)
2. Faktisk, da auth-brugeren er slettet ved soft-delete, vil `createUser` bare oprette en ny auth-bruger
3. Efter oprettelse, tjek om der findes en profil med `is_deleted = true` og samme email-display (vi kan ikke matche paa email i profiles da den ikke er gemt der)

**Bedre tilgang**: Gem email i profiles-tabellen saa vi kan matche ved genoprettelse.

Revideret plan:
- Tilfoej `email` kolonne til `profiles` (nullable, udfyldes ved oprettelse)
- Ved soft-delete: behold profilen med `is_deleted = true`, slet auth-bruger
- Ved oprettelse: Foer auth.createUser, tjek om der findes en soft-deleted profil med samme email. Hvis ja:
  - Opret ny auth-bruger
  - Opdater den eksisterende profil: saet `is_deleted = false`, `is_banned = false`, opdater `user_id` til den nye auth-brugers id, opdater `display_name`
  - Dette bevarer forbindelsen til eksisterende opskrifter via det gamle `user_id`

**Vent** - opskrifterne peger paa det GAMLE `user_id`. Hvis vi opdaterer profilens `user_id` til den nye auth-bruger, mister vi forbindelsen til opskrifterne.

**Endelig tilgang**:
1. Soft-delete: Saet `is_deleted = true`, `is_banned = true` paa profil. Slet auth-bruger. Behold `user_id` uaendret.
2. Genoprettelse: Opret ny auth-bruger. Opdater ALLE opskrifter (`bead_patterns.user_id`) til den nye brugers id. Opdater profilens `user_id` til den nye bruger. Saet `is_deleted = false`, `is_banned = false`.

## Database-aendringer

```text
ALTER TABLE public.profiles ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN email text;
```

Opdater eksisterende profiler med emails fra auth:
```text
-- Koeres manuelt via edge function eller migration
```

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| Database migration | Tilfoej `is_deleted` og `email` til profiles |
| `supabase/functions/admin-manage-user/index.ts` | Ny delete-logik med soft-delete check |
| `supabase/functions/create-user/index.ts` | Genaktiverings-logik ved oprettelse med eksisterende slettet email |
| `src/components/admin/UserManagement.tsx` | Filtrer `is_deleted` brugere fra visningen |

## Detaljeret edge function logik

### delete-user (admin-manage-user)

```text
1. Hent antal opskrifter for userId
2. IF opskrifter == 0:
   - Slet user_roles, profiles, auth user (som nu)
3. ELSE:
   - Hent brugerens email fra auth
   - Opdater profiles: is_deleted=true, is_banned=true, gem email
   - Slet user_roles
   - Slet auth user
```

### create-user

```text
1. Modtag email, password, displayName, role
2. Tjek om der findes en profil med is_deleted=true og email=input email
3. IF soft-deleted profil findes:
   a. Opret ny auth-bruger
   b. Opdater bead_patterns: saet user_id = ny bruger id WHERE user_id = gammel profil user_id
   c. Opdater bead_plates via pattern_id (automatisk pga. RLS peger paa patterns)
   d. Opdater user_favorites, user_progress ligeledes
   e. Opdater profil: user_id = ny bruger id, is_deleted=false, is_banned=false, display_name, email
   f. Tilfoej user_roles
4. ELSE:
   a. Opret bruger som normalt
```

### UserManagement.tsx

Tilfoej filter i `fetchUsers`:
```text
.eq('is_deleted', false)
```

## Oprydning af karsten@test.dk

Slet auth-brugeren `3c477f1c-587b-422d-a0ab-fec0b9182a03` via migration eller direkte kald. Da der ingen profil eller data er, er det en ren sletning.


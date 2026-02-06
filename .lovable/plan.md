
# Plan: Ret Login og Opret Opskrift Fejl

## Identificerede Problemer

### Problem 1: Login viser "Opret administrator" selvom brugere eksisterer
**Årsag:** Login-siden tjekker `profiles`-tabellen for at se om der er brugere. Men RLS-politikken på `profiles` tillader kun at se din egen profil (`auth.uid() = user_id`). Når du ikke er logget ind, er `auth.uid()` tom, så queryen returnerer 0 rækker.

**Løsning:** Brug `auth.users`-tabellen via en database-funktion i stedet, da denne kræver service-role. Alternativt: lav en simpel RPC-funktion der returnerer om der findes brugere.

### Problem 2: Oprette opskrift fejler
**Årsag:** `categories`-tabellen har INSERT-politik der kun tillader admins at oprette kategorier. Men `CreatePatternDialog` prøver at oprette nye kategorier for alle brugere.

**Løsning:** Enten tillad alle autentificerede brugere at oprette kategorier, eller håndter det i koden så kun eksisterende kategorier kan vælges af ikke-admins.

---

## Ændringer

### 1. Database: Opret funktion til at tjekke om brugere eksisterer
Opretter en simpel database-funktion der returnerer om der findes profiler i systemet - denne kører med `SECURITY DEFINER` så den omgår RLS.

```sql
CREATE OR REPLACE FUNCTION public.has_any_users()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles);
$$;
```

### 2. Login.tsx: Brug den nye funktion
Ændrer `checkForUsers` til at kalde RPC-funktionen i stedet for at query `profiles` direkte.

```typescript
// Før
const { count, error } = await supabase
  .from('profiles')
  .select('*', { count: 'exact', head: true });

// Efter
const { data, error } = await supabase.rpc('has_any_users');
if (!error && data === false) {
  setShowFirstAdmin(true);
}
```

### 3. Database: Opdater categories INSERT-politik
Tillader alle autentificerede brugere at oprette kategorier (ikke kun admins). Dette giver mening da kategorier er en fælles ressource.

```sql
-- Drop eksisterende politik
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;

-- Opret ny politik
CREATE POLICY "Authenticated users can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

---

## Fil-ændringer

| Fil | Ændring |
|-----|---------|
| Database migration | Opret `has_any_users()` funktion |
| Database migration | Opdater INSERT-politik på `categories` |
| `src/pages/Login.tsx` | Brug `supabase.rpc('has_any_users')` i stedet for direkte query |

---

## Tekniske detaljer

### has_any_users() funktion
- Returnerer `true` hvis der er mindst én profil
- Bruger `SECURITY DEFINER` så den kører med creator's rettigheder (omgår RLS)
- Simpel og hurtig query

### Categories politik
- Ændres fra "kun admins" til "alle autentificerede"
- UPDATE og DELETE forbliver admin-only
- SELECT er allerede åben for alle

---

## Efter ændringerne

1. **Login-siden** vil korrekt vise login-formularen når der allerede er brugere
2. **Opret opskrift** vil virke fordi brugere nu kan oprette kategorier
3. Eksisterende funktionalitet påvirkes ikke

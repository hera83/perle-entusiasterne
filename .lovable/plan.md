

# Fix: Session-tab ved gemning - den RIGTIGE root cause (med bevis)

## Beviset fra auth-loggen

Auth-loggen viser praecis hvad der sker:

```text
14:09:02 - token_revoked (status 200) - refresh #1
14:09:02 - token_revoked (status 200) - refresh #2
14:09:02 - token_revoked (status 200) - refresh #3
14:09:02 - token_revoked (status 200) - refresh #4
14:09:03 - token_revoked (status 200) - refresh #5
14:09:03 - 429: Request rate limit reached  <-- HER DOER SESSIONEN
```

6 token-refresh requests inden for 1 sekund. Supabase's rate limiter slaar til, returnerer 429, og klienten tolker det som "session kompromitteret" og fyrer SIGNED_OUT.

## Hvad udloeser stormen

`handleSaveAll` i PatternEditor kalder `supabase.auth.getUser()` foer gemning. Denne funktion laver et NETVAERKS-kald til `/auth/v1/user`. Hvis JWT-tokenet er taet paa at udloebe, trigger klienten internt et token-refresh FoER getUser-kaldet.

MEN: Supabase-klienten har ogsaa en intern auto-refresh timer der fyrer ~60 sekunder foer token udloeber. Naar BAADE getUser() OG auto-refresh timeren forsoeeger at refreshe paa samme tid, starter en kaede:

```text
1. getUser() finder expired token -> trigger refresh med T1 -> faar T2
2. Auto-refresh timer fyrer -> bruger T2 -> faar T3  
3. Klienten ser nyt token -> trigger refresh igen -> T3 -> T4
4. Kaede fortsaetter: T4 -> T5 -> T5 -> ...
5. Rate limit (429) -> SIGNED_OUT
```

Derefter: AuthContext saetter user=null, isAdmin=false. Administration-siden ser `!user || !isAdmin` og redirecter til "/". Galleriet loader og fyrer flere queries (som ogsaa kan trigger yderligere refreshes).

## Den EGENTLIGE fejl

**`supabase.auth.getUser()` er et netvaerks-kald der racer med Supabase-klientens interne auto-refresh.** Det var tilfojet som "server-side validering", men det er praecis det der udloeser token-stormen.

`supabase.auth.getSession()` laeser derimod fra LOCAL CACHE - ingen netvaerkskald, ingen token-refresh, ingen race condition.

## Loesning (4 filer)

### 1. PatternEditor.tsx - Erstat getUser() med getSession()

**Problem**: `getUser()` paa linje 452-453 laver et auth-netvaerkskald der racer med auto-refresh.

**Fix**: 
- Erstat `getUser()` med `getSession()` (cached, ingen netvaerkskald)
- Tjek `session.expires_at` for at sikre tokenet ikke er udloebet
- Hvis tokenet udloeber inden for 60 sekunder, vis en fejlbesked
- Ingen aendring i resten af gem-logikken (sekventielle saves er fine)

### 2. PatternDialog.tsx - Erstat getUser() med getSession()

**Problem**: `getUser()` paa linje 155 har praecis det samme problem.

**Fix**: Samme aendring - erstat med `getSession()` og tjek `expires_at`.

### 3. AdminDashboard.tsx - Serialiser COUNT queries

**Problem**: `fetchStats()` fyrer 6 COUNT queries parallelt (bead_patterns x3, categories, profiles, user_progress). Naar Administration loader efter en side-navigation, kan disse 6 samtidige requests trigge samtidige token-refreshes.

**Fix**: 
- Koer queries sekventielt i stedet for parallelt
- Tilfoej 50ms pause mellem hvert kald

### 4. UserManagement.tsx - Serialiser rolle-hentning

**Problem**: `fetchUsers()` bruger `Promise.all` til at hente roller for ALLE brugere parallelt. Med N brugere = N samtidige requests.

**Fix**: 
- Hent alle roller i EN enkelt query i stedet for N individuelle
- Kombiner med profiles-data lokalt

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/components/workshop/PatternEditor.tsx` | Erstat getUser() med getSession() + expires_at tjek |
| `src/components/gallery/PatternDialog.tsx` | Erstat getUser() med getSession() + expires_at tjek |
| `src/components/admin/AdminDashboard.tsx` | Serialiser 6 COUNT queries |
| `src/components/admin/UserManagement.tsx` | Hent roller i 1 query i stedet for N |

## Tekniske detaljer

### PatternEditor.tsx - handleSaveAll (linje 448-516)

```text
// FOER (linje 451-462):
const { data: { user: currentUser }, error: userError } =
  await supabase.auth.getUser();  // <-- NETVAERKSKALD! Trigger token refresh!

if (userError || !currentUser) { ... }

// EFTER:
const { data: { session } } = await supabase.auth.getSession();  // <-- LOCAL CACHE!

if (!session) {
  toast({
    title: 'Session udloebet',
    description: 'Du er blevet logget ud. Log ind igen for at gemme.',
    variant: 'destructive',
  });
  return;
}

// Tjek om token udloeber inden for 60 sekunder
const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
const now = Date.now();
if (expiresAt > 0 && expiresAt - now < 60000) {
  // Token er ved at udloebe - proev at refreshe EN gang
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    toast({
      title: 'Session udloebet',
      description: 'Din session er udloebet. Log ind igen.',
      variant: 'destructive',
    });
    return;
  }
}

// Resten af handleSaveAll forbliver uaendret (sekventielle saves)
```

### PatternDialog.tsx - saveProgress (linje 150-187)

```text
// FOER (linje 154-159):
const { data: { user: currentUser }, error: userError } = 
  await supabase.auth.getUser();
if (userError || !currentUser) {
  toast.error('Session udloebet...');
  return { error: new Error('Session expired') };
}

// EFTER:
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  toast.error('Session udloebet - log ind igen for at gemme progress');
  return { error: new Error('Session expired') };
}
```

### AdminDashboard.tsx - fetchStats (linje 32-81)

```text
// FOER: 6 parallelle COUNT queries
const { count: totalPatterns } = await supabase...
const { count: publicPatterns } = await supabase...
const { count: privatePatterns } = await supabase...
const { count: totalCategories } = await supabase...
const { count: totalUsers } = await supabase...
const { count: startedPatterns } = await supabase...

// EFTER: Sekventielle queries med pauser
const { count: totalPatterns } = await supabase
  .from('bead_patterns').select('*', { count: 'exact', head: true });

const { count: publicPatterns } = await supabase
  .from('bead_patterns').select('*', { count: 'exact', head: true })
  .eq('is_public', true);

await new Promise(r => setTimeout(r, 50));

const { count: privatePatterns } = await supabase
  .from('bead_patterns').select('*', { count: 'exact', head: true })
  .eq('is_public', false);

const { count: totalCategories } = await supabase
  .from('categories').select('*', { count: 'exact', head: true });

await new Promise(r => setTimeout(r, 50));

const { count: totalUsers } = await supabase
  .from('profiles').select('*', { count: 'exact', head: true });

const { count: startedPatterns } = await supabase
  .from('user_progress').select('*', { count: 'exact', head: true });
```

### UserManagement.tsx - fetchUsers (linje 73-107)

```text
// FOER: Promise.all med N individuelle rolle-queries
const usersWithRoles = await Promise.all(
  profiles.map(async (profile) => {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.user_id)
      .maybeSingle();
    return { ...profile, role: roleData?.role || null };
  })
);

// EFTER: EN enkelt query der henter ALLE roller
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, user_id, display_name, created_at')
  .order('created_at', { ascending: false });

// Hent alle roller i en enkelt query
const userIds = (profiles || []).map(p => p.user_id);
const { data: allRoles } = await supabase
  .from('user_roles')
  .select('user_id, role')
  .in('user_id', userIds);

// Kombiner lokalt
const roleMap = new Map(
  (allRoles || []).map(r => [r.user_id, r.role])
);

const usersWithRoles = (profiles || []).map(profile => ({
  ...profile,
  role: (roleMap.get(profile.user_id) as 'admin' | 'user') || null,
}));
```

## Forventet resultat

- `getUser()` erstattes med `getSession()` - ingen ekstra netvaerkskald, ingen token-refresh race
- Gem-operationer bruger det EKSISTERENDE token fra cache (Supabase-klienten haandterer refresh automatisk internt naar det er noedvendigt)
- Admin-sider laver faerre samtidige requests, hvilket reducerer risikoen for burst
- Ingen flere 429 rate limit fejl paa token-endpoint
- Sessionen forbliver stabil efter gemning OG ved navigation til Administration


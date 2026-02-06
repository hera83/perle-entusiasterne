

# Fix: Token-refresh loop - helt ny tilgang

## Problemet (nu med bevis fra network-loggen)

Network-loggen afslorer det EGENTLIGE problem. Det er IKKE concurrent queries der trigger samtidige refreshes. Det er Supabase-klientens interne auto-refresh mekanisme der gaar i LOOP:

```text
15:23:44 - Login (password) -> refresh_token: vr3j4ghnmexh
15:23:44 - Refresh #1: vr3j4ghnmexh -> 2emwpcnm277d
15:23:44 - Refresh #2: 2emwpcnm277d -> eeglqvubjau3
15:23:44 - Refresh #3: eeglqvubjau3 -> u4xonkldtxsm
15:23:44 - Refresh #4: u4xonkldtxsm -> v4z6r5qah4em
15:23:44 - Refresh #5: v4z6r5qah4em -> uks6xevlk3oq
15:23:44 - Refresh #6: uks6xevlk3oq -> zdus7ualzrwe
15:23:44 - Refresh #7: zdus7ualzrwe -> ...
                         ... indtil 429 rate limit
```

Hvert refresh KAeDER det naeste. Tokenet er helt nyt (1 times gyldighed), saa det er IKKE udloebet. Supabase-klientens `autoRefreshToken` mekanisme korer i en loop - den trigger et refresh, som trigger et nyt refresh, osv.

## Hvorfor alle tidligere fixes ikke virkede

Vi har proevet at:
- Fjerne re-renders ved TOKEN_REFRESHED (hjaelper ikke - loopet er internt i klienten)
- Serialisere database-queries (hjaelper ikke - det er ikke queries der trigger det)
- Erstatte getUser() med getSession() (hjaelper ikke - det er auto-refresh timeren)
- Tilfoeje delays mellem queries (hjaelper ikke - loopet starter uafhaengigt af vores kode)

INGEN af disse fixes adresserer det faktiske problem: **Supabase-klientens interne auto-refresh timer gaar i loop.**

## Den nye loesning: Stop auto-refresh, styr det manuelt

Supabase-klienten har en offentlig metode: `supabase.auth.stopAutoRefresh()`. Vi kan stoppe den interne (buggy) auto-refresh og implementere vores EGEN kontrollerede refresh-timer.

Vi kan ikke redigere `client.ts` (auto-genereret), men vi kan kalde `stopAutoRefresh()` ved runtime i AuthContext.

### Hvad loesningen goer:

1. **Stopper den interne auto-refresh** der looper
2. **Implementerer en kontrolleret refresh-timer** der fyrer PRGCIS een gang, 5 minutter foer tokenet udloeber
3. **Opretter en database-funktion** til admin-statistikker (1 query i stedet for 6)
4. **Fjerner alle manuelle auth-checks** foer gem-operationer

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Stop auto-refresh, implementer kontrolleret refresh-timer |
| `src/components/workshop/PatternEditor.tsx` | Fjern getSession/refreshSession check, bare gem direkte |
| `src/components/gallery/PatternDialog.tsx` | Fjern getSession check |
| `src/components/admin/AdminDashboard.tsx` | Brug ny RPC-funktion i stedet for 6 queries |

Plus en ny database-migration til RPC-funktionen.

## Tekniske detaljer

### AuthContext.tsx - Kontrolleret token-refresh

Kerneideen: vi stopper Supabase-klientens auto-refresh og styrer det selv.

```text
// Ved opstart:
supabase.auth.stopAutoRefresh();

// Vores egen refresh-timer:
const refreshTimerRef = useRef<number | null>(null);

const scheduleRefresh = (session: Session) => {
  // Ryd eksisterende timer
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }

  // Beregn hvornaar tokenet udloeber
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAt === 0) return;

  // Refresh 5 minutter foer udloeb (minimum 30 sekunder)
  const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 30000);

  refreshTimerRef.current = window.setTimeout(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      // Planlaeg naeste refresh med det nye token
      scheduleRefresh(data.session);
    }
    // Hvis refresh fejler: auto-refresh var allerede stoppet,
    // brugeren vil se "session udloebet" naeste gang de proever noget
  }, refreshIn);
};

// I onAuthStateChange:
if (event === 'SIGNED_IN' && session) {
  scheduleRefresh(session);
}

if (event === 'TOKEN_REFRESHED' && session) {
  sessionRef.current = session;
  scheduleRefresh(session);  // Nulstil timer med nyt token
  return; // Ingen re-render
}

if (event === 'SIGNED_OUT') {
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }
  // ... reset state
}

// I initializeAuth:
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  scheduleRefresh(session);
}

// I cleanup:
return () => {
  isMounted = false;
  subscription.unsubscribe();
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
  }
};
```

### PatternEditor.tsx - Fjern auth-checks foer gem

Alle manuelle `getSession()` og `refreshSession()` kald fjernes. Vi stoler paa at Supabase-klienten har et gyldigt token (fordi vi styrer refresh selv), og haandterer fejl hvis den ikke har.

```text
// FOER (linje 448-475):
const handleSaveAll = async () => {
  if (!patternId) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { ... }
  const expiresAt = session.expires_at ? ...;
  if (expiresAt ...) {
    const { error } = await supabase.auth.refreshSession();
    ...
  }
  // ... gem logik
};

// EFTER:
const handleSaveAll = async () => {
  if (!patternId) return;

  setIsSaving(true);
  try {
    // Gem direkte - ingen auth-check noedvendig
    // Vores kontrollerede refresh-timer holder tokenet gyldigt
    for (const plate of plates) {
      const { error } = await supabase
        .from('bead_plates')
        .update({ beads: plate.beads as unknown as Json })
        .eq('id', plate.id);

      if (error) {
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          throw new Error('SESSION_EXPIRED');
        }
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Thumbnail + metadata...
    setHasUnsavedChanges(false);
    toast({ title: 'Gemt', description: 'Alle aendringer er gemt.' });
  } catch (error) {
    // ... fejlhaandtering
  } finally {
    setIsSaving(false);
  }
};
```

### PatternDialog.tsx - Fjern getSession check

```text
// FOER:
const saveProgress = async (...) => {
  if (user) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { ... }
    // ... gem
  }
};

// EFTER:
const saveProgress = async (...) => {
  if (user) {
    // Gem direkte - ingen session-check
    const { error } = await supabase
      .from('user_progress')
      .upsert({ ... });

    if (error) {
      console.error('Error saving progress:', error);
      return { error };
    }
  }
  // ...
};
```

### Database migration - RPC funktion for admin stats

Opretter en enkelt database-funktion der returnerer alle admin-statistikker i eet kald:

```sql
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Kun admins maa kalde denne
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'total_patterns', (SELECT count(*) FROM bead_patterns),
    'public_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = true),
    'private_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = false),
    'total_categories', (SELECT count(*) FROM categories),
    'total_users', (SELECT count(*) FROM profiles),
    'started_patterns', (SELECT count(*) FROM user_progress)
  ) INTO result;

  RETURN result;
END;
$$;
```

### AdminDashboard.tsx - Brug RPC

```text
// FOER: 6 separate COUNT queries med delays
const { count: totalPatterns } = await supabase.from('bead_patterns')...
await new Promise(r => setTimeout(r, 50));
const { count: publicPatterns } = await supabase.from('bead_patterns')...
// ... 6 queries total

// EFTER: 1 enkelt kald
const { data, error } = await supabase.rpc('get_admin_stats');

if (!error && data) {
  setStats({
    totalPatterns: data.total_patterns,
    publicPatterns: data.public_patterns,
    privatePatterns: data.private_patterns,
    totalCategories: data.total_categories,
    totalUsers: data.total_users,
    startedPatterns: data.started_patterns,
    completedPatterns: 0,
  });
}
```

## Forventet resultat

- **INGEN auto-refresh loop** - den interne mekanisme er stoppet
- **PRAECIS 1 refresh per session** - vores timer fyrer 5 min foer udloeb
- **1 database-kald for admin stats** i stedet for 6
- **Ingen manuelle auth-checks** der kan race med refresh
- **Sessionen forbliver stabil** ved navigation, gemning og alt andet

## Hvorfor denne loesning er anderledes

Alle tidligere fixes proevede at reducere ANTALLET af queries for at undgaa at trigge refresh-stormen. Men stormen sker INTERNT i Supabase-klienten, uafhaengigt af vores queries. Den eneste loesning er at STOPPE den interne auto-refresh og styre det selv.

`supabase.auth.stopAutoRefresh()` er en officielt undersoettet metode i Supabase JS v2.


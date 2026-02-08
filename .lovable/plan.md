

# Fix: Genindfoer kontrolleret token-refresh (stop stormen)

## Problemet

Netvaerksloggen viser tydeligt at **token-refresh stormen fortsaetter**. Inden for 2 sekunder sendes 5 refresh-requests, hvor den sidste rammer en 429 rate limit. Herefter er sessionen ugyldig og brugeren ser ud til at vaere logget ud.

Aarsagen er at `client.ts` (auto-genereret, kan ikke aendres) har `autoRefreshToken: true`, som foraarsager at Supabase's interne refresh-mekanisme kaeder refresh-kald:

```text
Token expires snart
  -> Built-in auto-refresh kalder refresh
  -> TOKEN_REFRESHED event -> ny session med nyt refresh_token
  -> Built-in auto-refresh ser nyt token, scheduler nyt refresh
  -> Multiple interne timers kaskaderer
  -> 4-5 refresh-kald paa under 2 sekunder
  -> 429 rate limit
  -> Session ugyldig
  -> Brugeren er "logget ud"
```

Den loesning der **virkede** for administrator-delen (disable built-in refresh + kontrolleret timer) blev ved en fejl fjernet i det forrige fix.

## Loesningen

Genindfoer den kontrollerede refresh-strategi fra administrator-loesningen, men nu paa en maade der virker for ALLE brugere:

### 1. Stop Supabase's built-in auto-refresh (AuthContext.tsx)

Kald `supabase.auth.stopAutoRefresh()` som det allerfoerste i `initializeAuth`. Dette er den **officielle API** til at deaktivere den indbyggede refresh-mekanisme (i stedet for den gamle hacky property-override).

### 2. Kontrolleret manuel refresh-timer

Genindfoer en `scheduleRefresh`-funktion der:
- Beregner hvornaar token udloeber (fra session.expires_at)
- Saetter **et enkelt** setTimeout til at refreshe 60 sekunder foer udloeb
- Bruger en `refreshTimerRef` til at forhindre dobbelte timers
- Ved hvert TOKEN_REFRESHED event: opdaterer session-ref og re-scheduler timeren

### 3. Beskyttelse mod samtidige refreshes

Tilfoej en `isRefreshingRef` (boolean ref) der sikrer at kun EN refresh koerer ad gangen. Hvis en refresh allerede er i gang, ignoreres nye forsog.

---

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Stop built-in auto-refresh, tilfoej kontrolleret timer |

---

## Tekniske detaljer

### AuthContext.tsx - Nye refs og funktioner

```text
const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const isRefreshingRef = useRef(false);

const scheduleRefresh = useCallback((session: Session) => {
  // Ryd eksisterende timer
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }

  if (!session.expires_at) return;

  const expiresAt = session.expires_at * 1000; // sekunder -> ms
  const now = Date.now();
  const refreshIn = expiresAt - now - 60_000; // 60 sek foer udloeb

  if (refreshIn <= 0) {
    // Allerede udloebet eller taet paa - refresh med det samme
    performRefresh();
    return;
  }

  refreshTimerRef.current = setTimeout(() => {
    performRefresh();
  }, refreshIn);
}, []);

const performRefresh = async () => {
  if (isRefreshingRef.current) return; // Forhindre dobbelt refresh
  isRefreshingRef.current = true;

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error('Session refresh failed:', error.message);
    }
    // TOKEN_REFRESHED event haandterer resten
  } catch (err) {
    console.error('Error refreshing session:', err);
  } finally {
    isRefreshingRef.current = false;
  }
};
```

### AuthContext.tsx - Opdateret initializeAuth

```text
const initializeAuth = async () => {
  try {
    // STOP Supabase's built-in auto-refresh foerst
    supabase.auth.stopAutoRefresh();

    const { data: { session } } = await supabase.auth.getSession();
    if (!isMounted) return;

    sessionRef.current = session ?? null;
    setUser(session?.user ?? null);
    currentUserIdRef.current = session?.user?.id ?? null;

    if (session?.user) {
      wasLoggedInRef.current = true;
      scheduleRefresh(session);
      const adminResult = await checkAdminRole(session.user.id);
      if (isMounted) setIsAdmin(adminResult);
    }
  } catch (err) {
    console.error('Error initializing auth:', err);
  } finally {
    if (isMounted) setLoading(false);
  }
};
```

### AuthContext.tsx - Opdateret onAuthStateChange

```text
if (event === 'TOKEN_REFRESHED') {
  if (session) {
    sessionRef.current = session;
    scheduleRefresh(session); // Re-schedule naeste refresh
  }
  return;
}

if (event === 'SIGNED_IN' && session?.user) {
  wasLoggedInRef.current = true;
  if (currentUserIdRef.current !== session.user.id) {
    currentUserIdRef.current = session.user.id;
    sessionRef.current = session;
    setUser(session.user);
    scheduleRefresh(session);
    checkAdminRole(session.user.id).then(result => {
      if (isMounted) setIsAdmin(result);
    });
  } else {
    sessionRef.current = session;
    scheduleRefresh(session);
  }
}
```

### AuthContext.tsx - Cleanup

```text
return () => {
  isMounted = false;
  subscription.unsubscribe();
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
  }
};
```

### Hvorfor dette virker

1. `stopAutoRefresh()` er Supabase's officielle API - den stopper den indbyggede timer paalideligt
2. Vores egen timer koerer KUN en gang per session-fornyelse (ingen kaskade)
3. `isRefreshingRef` sikrer at kun et refresh-kald koerer ad gangen
4. Denne strategi er den SAMME der virkede for administrator-delen, nu anvendt globalt


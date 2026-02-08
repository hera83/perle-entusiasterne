
# Fix: Clock-skew-resistent auth med korrekt stopAutoRefresh-timing

## Problemet (rod-aarsag identificeret)

Tre ting sammenspiller og skaber refresh-stormen:

### 1. Klientens ur er 1 time foran serveren

Netvaerksloggen viser at browserens tid er 13:39:09Z mens serverens `iat` (issued-at) er 12:39:11 UTC - praecis 1 times forskel. Med Docker-containeren lokalt kan tidsforskellen vaere endnu stoerre.

### 2. stopAutoRefresh() kaldes paa det forkerte tidspunkt

Nuvaerende kode kalder `stopAutoRefresh()` FOER `getSession()`. Men `getSession()` afventer `_initialize()`, og i `_initialize()`'s finally-blok koerer `_handleVisibilityChange()` som GENSTARTER auto-refresh med en ny visibility-listener og setInterval. Saa vores stop-kald er virkningsloest.

```text
Nuvaerende raekkefoel:
  stopAutoRefresh()          -> stopper timer (ok)
  getSession()               -> afventer _initialize()
    _initialize() finally:
      _handleVisibilityChange()
        _startAutoRefresh()  -> GENSTARTER timer!
  ... auto-refresh koerer igen
```

### 3. scheduleRefresh bruger expires_at (absolut tid)

Med 1 times clock-skew:
- Serveren udsteder token med expires_at = serverNow + 3600
- Klientens Date.now() = serverNow + 3600 (1 time foran)
- refreshIn = (expires_at * 1000) - Date.now() - 60000 = 0 - 60000 = -60000
- refreshIn er NEGATIVT = ojeblikkelig refresh
- Hvert nyt token faar samme beregning = endeloes kaskade
- Supabase's interne _autoRefreshTokenTick goer det SAMME = dobbelt kaskade

## Loesningen

### 1. Kald stopAutoRefresh() EFTER getSession()

```text
// FOER (forkert):
supabase.auth.stopAutoRefresh();
const { data: { session } } = await supabase.auth.getSession();

// EFTER (korrekt):
const { data: { session } } = await supabase.auth.getSession();
await supabase.auth.stopAutoRefresh();
```

Naar `getSession()` returnerer, er `_initialize()` faerdig, og `_handleVisibilityChange()` har koert. NU kan `stopAutoRefresh()` stoppe baade timer OG visibility-listener, og intet genstarter det.

### 2. Brug FAST interval (55 minutter) i stedet for expires_at

```text
const REFRESH_INTERVAL_MS = 55 * 60 * 1000; // 55 minutter

const scheduleRefresh = () => {
  if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  refreshTimerRef.current = setTimeout(performRefresh, REFRESH_INTERVAL_MS);
  lastRefreshRef.current = Date.now();
};
```

setTimeout bruger RELATIV tid (millisekunder fra nu), ikke absolut tid. Saa clock-skew er fuldstaendig irrelevant. Uanset hvad klientens ur viser, vil 55 minutter vaere 55 rigtige minutter.

### 3. Haandter tab-synlighed manuelt

Naar `stopAutoRefresh()` fjerner visibility-listeneren, mister vi evnen til at genoptage sessionen naar fanen bliver synlig igen (f.eks. efter computeren har vaeret i dvale). Vi tilfojer vores egen handler der refresher hvis der er gaaet mere end 5 minutter siden sidste refresh:

```text
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sessionRef.current) {
    const elapsed = Date.now() - lastRefreshRef.current;
    if (elapsed > 5 * 60 * 1000) {
      performRefresh();
    }
  }
});
```

---

## Fil der aendres

| Fil | AEndring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Ret timing af stopAutoRefresh, brug fast interval, tilfoej visibility-handler |

---

## Tekniske detaljer

### AuthContext.tsx - Komplette aendringer

Nye konstanter og refs:

```text
const REFRESH_INTERVAL_MS = 55 * 60 * 1000; // 55 minutter - sikkert for 60-minutters tokens
const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const isRefreshingRef = useRef(false);
const lastRefreshRef = useRef<number>(Date.now());
```

Ny scheduleRefresh (UDEN expires_at):

```text
const scheduleRefresh = useCallback(() => {
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }
  refreshTimerRef.current = setTimeout(() => {
    performRefresh();
  }, REFRESH_INTERVAL_MS);
  lastRefreshRef.current = Date.now();
}, [performRefresh]);
```

performRefresh forbliver naesten uaendret (beholder isRefreshingRef guard).

Opdateret initializeAuth:

```text
const initializeAuth = async () => {
  try {
    // FOERST hent session (dette afventer _initialize() internt)
    const { data: { session } } = await supabase.auth.getSession();

    // NU er _initialize() faerdig og auto-refresh er startet.
    // Stop det EFTER _initialize() saa det faktisk virker.
    await supabase.auth.stopAutoRefresh();

    if (!isMounted) return;

    sessionRef.current = session ?? null;
    setUser(session?.user ?? null);
    currentUserIdRef.current = session?.user?.id ?? null;

    if (session?.user) {
      wasLoggedInRef.current = true;
      scheduleRefresh(); // Fast 55-min timer
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

Opdateret onAuthStateChange:

```text
if (event === 'TOKEN_REFRESHED') {
  if (session) {
    sessionRef.current = session;
    scheduleRefresh(); // Reset 55-min timer (aldrig ojeblikkelig refresh)
  }
  return;
}

if (event === 'SIGNED_IN' && session?.user) {
  wasLoggedInRef.current = true;
  if (currentUserIdRef.current !== session.user.id) {
    currentUserIdRef.current = session.user.id;
    sessionRef.current = session;
    setUser(session.user);
    scheduleRefresh();
    checkAdminRole(session.user.id).then(result => {
      if (isMounted) setIsAdmin(result);
    });
  } else {
    sessionRef.current = session;
    scheduleRefresh();
  }
}
```

Ny visibility-handler i useEffect:

```text
// Haandter tab-synlighed manuelt (da vi har stoppet Supabase's handler)
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && sessionRef.current) {
    const elapsed = Date.now() - lastRefreshRef.current;
    if (elapsed > 5 * 60 * 1000) { // Mere end 5 min siden sidste refresh
      performRefresh();
    }
  }
};
document.addEventListener('visibilitychange', handleVisibilityChange);
```

Opdateret cleanup:

```text
return () => {
  isMounted = false;
  subscription.unsubscribe();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
  }
};
```

---

## Hvorfor dette virker (og er anderledes end foer)

1. **stopAutoRefresh() EFTER getSession()**: Stopper auto-refresh EFTER _initialize() har koert faerdigt, saa intet genstarter det
2. **Fast 55-min interval**: setTimeout bruger relativ tid, ikke absolut - fuldstaendig immun over for clock-skew
3. **scheduleRefresh() kalder ALDRIG performRefresh() ojeblikkelig**: Bryder kaskadekaedenm uanset hvad
4. **Visibility-handler**: Erstatter Supabase's fjernede handler, men med relativ tidsberegning (elapsed) i stedet for absolut expires_at
5. **Virker identisk i Docker og Lovable**: Fordi loesningen er uafhaengig af klient-server tidssynkronisering

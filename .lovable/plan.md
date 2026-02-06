

# Fix: Login-loop med token-storm og session-tab

## Hvad sker der (root cause analyse)

Problemet er mere alvorligt end en simpel race condition. Her er den praecise kaede af haendelser:

1. Du logger ind med din email og adgangskode - det lykkes
2. Auth-systemet sender en SIGNED_IN event til `onAuthStateChange`
3. Handleren saetter `setSession(session)` og `setUser(session.user)` - dette skaber NYE React-objekter HVER gang, selv om det er den SAMME bruger
4. Disse nye objekter trigger re-renders i HELE appen:
   - **ThemeContext** afhanger af `[user]` og fyrer en database-query for at hente temaet
   - **Gallery** afhanger af `[user, isAdmin]` og fyrer `fetchPatterns` for at hente moenstre
   - **checkAdminRole** fyrer endnu en database-query
   - **Login** kalder `navigate('/')` UNDER render (ikke i en useEffect)
5. Alle disse samtidige database-queries kan trigger ekstra token-operations internt i auth-klienten
6. Auth-systemet fyrer TOKEN_REFRESHED events, som OGSAA trigger `onAuthStateChange`
7. Hvert TOKEN_REFRESHED event starter hele cyklussen forfra (punkt 3-6)
8. Resultatet: 30+ token-refreshes inden for 2-3 sekunder
9. Serveren rammer rate-limit (429-fejl) paa token-refresh
10. Naar en token-refresh fejler med 429, mister klienten sin session
11. Brugeren er nu "logget ud" - alle efterfoelgende requests bruger kun den anonyme noegle

**Bevis fra loggen**: Auth-loggene viser 30+ `token_revoked` events inden for 2-3 sekunder, efterfulgt af en 429 rate-limit fejl. Network-requests viser at ALLE database-queries bruger den anonyme noegle (ikke brugerens JWT), og `user_roles`-queryen returnerer tomt array `[]` fordi RLS-policyen kraever `auth.uid() = user_id`.

## Loesning (4 filer skal rettes)

### 1. AuthContext.tsx - Hovedfix

Problemet: `onAuthStateChange` reagerer paa ALLE events (inkl. TOKEN_REFRESHED) og skaber nye state-objekter hver gang.

**Aendringer:**
- Tilfoej event-filtrering i `onAuthStateChange`: Ignorer TOKEN_REFRESHED events helt - de aendrer ikke hvem brugeren er
- Brug `useRef` til at holde styr paa den aktuelle bruger-ID, saa vi kun opdaterer state naar brugeren faktisk skifter
- Fjern `setTimeout`-wrapperen for `checkAdminRole` - den er unoevendig og skaber ekstra async-cyklusser
- I `onAuthStateChange`: kun opdater user/session ved SIGNED_IN og SIGNED_OUT

```text
onAuthStateChange handler (ny logik):
  - Hvis event er TOKEN_REFRESHED: ignorer (sessionen er allerede opdateret internt)
  - Hvis event er SIGNED_IN: saet user/session, kald checkAdminRole
  - Hvis event er SIGNED_OUT: nulstil user/session/isAdmin
  - Hvis event er INITIAL_SESSION: ignorer (initializeAuth haandterer dette)
```

### 2. Login.tsx - Stop navigate under render

Problemet: Linje 51-53 kalder `navigate('/')` UNDER render, ikke i en `useEffect`. React kan ikke haandtere navigation under render korrekt.

**Aendring:** Flyt redirectet til en `useEffect` med `[user, authLoading, navigate]` som dependencies.

### 3. ThemeContext.tsx - Stabiliser dependencies

Problemet: `useEffect` paa linje 45-62 afhanger af `[user]` - et helt objekt. Hver gang `onAuthStateChange` saetter en ny `user`-reference, koerer dette effect igen og fyrer en database-query.

**Aendring:** Brug `user?.id` i stedet for `user` som dependency. Temaet aendrer sig ikke bare fordi user-objektets reference aendrer sig.

### 4. Gallery.tsx - Stabiliser fetchPatterns

Problemet: `useCallback` for `fetchPatterns` afhanger af `[user, isAdmin]`. Hver gang user-objektet faar ny reference, genskabes funktionen, og `useEffect` fyrer den igen.

**Aendring:** Brug `user?.id` og `isAdmin` som stabile dependencies i stedet for hele `user`-objektet. Referencen til user-objektet aendrer sig, men user.id forbliver den samme.

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Filtrer events i onAuthStateChange, brug useRef for user ID, fjern setTimeout |
| `src/pages/Login.tsx` | Flyt redirect fra render til useEffect |
| `src/contexts/ThemeContext.tsx` | Brug user?.id i dependency array |
| `src/pages/Gallery.tsx` | Brug user?.id i useCallback dependencies |

## Tekniske detaljer

### AuthContext.tsx - Ny implementering

```text
// Tilfoej useRef
const currentUserIdRef = useRef<string | null>(null);

useEffect(() => {
  let isMounted = true;

  // Listener for ONGOING auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (!isMounted) return;

      // KRITISK: Ignorer TOKEN_REFRESHED - det aendrer ikke brugeren
      if (event === 'TOKEN_REFRESHED') return;

      // Kun opdater state ved meningsfulde aendringer
      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
        setSession(null);
        setUser(null);
        setIsAdmin(false);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Kun opdater hvis det er en ny bruger
        if (currentUserIdRef.current !== session.user.id) {
          currentUserIdRef.current = session.user.id;
          setSession(session);
          setUser(session.user);
          checkAdminRole(session.user.id).then(result => {
            if (isMounted) setIsAdmin(result);
          });
        }
      }
    }
  );

  // INITIAL load
  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      currentUserIdRef.current = session?.user?.id ?? null;

      if (session?.user) {
        const adminResult = await checkAdminRole(session.user.id);
        if (isMounted) setIsAdmin(adminResult);
      }
    } catch (err) {
      console.error('Error initializing auth:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  initializeAuth();

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);
```

### Login.tsx - useEffect redirect

```text
// FOER (under render - FORKERT):
if (user && !authLoading) {
  navigate('/');
  return null;
}

// EFTER (i useEffect - KORREKT):
const [redirecting, setRedirecting] = useState(false);

useEffect(() => {
  if (user && !authLoading) {
    setRedirecting(true);
    navigate('/');
  }
}, [user, authLoading, navigate]);

if (redirecting) return null;
```

### ThemeContext.tsx - Stabil dependency

```text
// FOER:
}, [user]);

// EFTER:
}, [user?.id]);
```

### Gallery.tsx - Stabil useCallback

```text
// FOER:
const fetchPatterns = useCallback(async (...) => {
  // bruger user og isAdmin direkte
}, [user, isAdmin]);

// EFTER:
const userId = user?.id;
const fetchPatterns = useCallback(async (...) => {
  // bruger userId og isAdmin
}, [userId, isAdmin]);
```


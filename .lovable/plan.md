
# Fix: Login-problemet med blinkende admin-knapper

## Hvad gaar galt

Problemet er en **race condition** (tidskonflikt) i hvordan login og brugerroller indlaeses. Her er hvad der sker trin for trin:

1. Du trykker "Log ind" - login lykkes
2. Systemet registrerer at du er logget ind og viser admin-knapper
3. Men admin-rolle-tjekket koerer **efter** at siden allerede er vist
4. Samtidig fyrer auth-systemet flere events (INITIAL_SESSION, SIGNED_IN), som hver saetter bruger-tilstanden igen
5. Hver gang tilstanden opdateres, blinker UI'et - og i et kort oejeblik er `isAdmin = false`, saa admin-knapperne forsvinder
6. Login-siden har ogsaa en dobbelt-navigation (baade useEffect og handleSubmit navigerer til `/`), som goer problemet vaerre

Kerneproblemet: `loading` saettes til `false` **foer** admin-rolle-tjekket er faerdigt. Saa UI'et viser en tilstand der aendrer sig flere gange paa et split-sekund.

## Loesningen

### 1. Omskriv AuthContext.tsx (hovedfix)

Implementer et robust initialiseringsflow:

- Tilfoej `isMounted`-flag saa vi ikke opdaterer tilstand paa en afmonteret komponent
- Under **foerste indlaesning**: Vent paa at admin-rolle-tjekket er faerdigt **foer** `loading` saettes til `false`
- I `onAuthStateChange` (loebenede aendringer): Opdater bruger-tilstand men lad vaere med at styre `loading`
- Giv `checkAdminRole` et returnvaerdi saa vi kan afvente den

Ny logik:

```text
useEffect:
  1. isMounted = true
  2. Saet onAuthStateChange-listener op (opdaterer user/session, starter admin-check men styrer IKKE loading)
  3. Kald getSession() for at faa eksisterende session
  4. Hvis session findes: AFVENT checkAdminRole() foer loading saettes til false
  5. Saet loading = false
  6. Cleanup: isMounted = false, unsubscribe
```

### 2. Fix Login.tsx (dobbelt-navigation)

- Fjern `useEffect`-redirectet der reagerer paa `user`-aendringer (linje 32-36)
- Login-flowet styres udelukkende af `handleSubmit`, som navigerer efter login er fuldfoert
- Dette forhindrer at navigeringen sker to gange og afbryder `syncFavoritesOnLogin`

### 3. Header.tsx: Vis loading-tilstand

- Brug `loading` fra AuthContext til at undgaa at vise/skjule knapper mens auth-tilstanden stadig indlaeses
- Vis en diskret loading-indikator i stedet for at blinke med knapper

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Omskriv initialiseringslogik med isMounted og korrekt loading-haandtering |
| `src/pages/Login.tsx` | Fjern useEffect-redirect, lad handleSubmit styre navigation |
| `src/components/layout/Header.tsx` | Tilfoej loading-check saa knapper ikke blinker |

## Tekniske detaljer

### AuthContext.tsx - Ny implementering

```text
checkAdminRole:
  - Returnerer nu resultatet (boolean) saa den kan awaites
  - Bruger isMounted-tjek foer setState

useEffect:
  let isMounted = true

  // Listener for LOEBENEDE auth-aendringer (styrer IKKE loading)
  onAuthStateChange((event, session) => {
    if (!isMounted) return
    setSession(session)
    setUser(session?.user ?? null)
    if (session?.user) {
      checkAdminRole(session.user.id)  // fire-and-forget
    } else {
      setIsAdmin(false)
    }
  })

  // INITIAL load (styrer loading)
  const initializeAuth = async () => {
    const { session } = await getSession()
    if (!isMounted) return
    setSession(session)
    setUser(session?.user ?? null)
    if (session?.user) {
      await checkAdminRole(session.user.id)  // VENT paa resultatet
    }
    if (isMounted) setLoading(false)  // Foerst NU er vi klar
  }
  initializeAuth()

  return () => { isMounted = false; unsubscribe() }
```

### Login.tsx - Aendringer

```text
// FJERN dette useEffect (linje 32-36):
useEffect(() => {
  if (user) navigate('/');
}, [user, navigate]);

// TILFOEJ i stedet en simpel check oeverst i komponenten:
// Hvis brugeren allerede er logget ind naar Login-siden indlaeses,
// vis bare en loading-spinner og redirect
if (user && !loading) {
  navigate('/');
  return null;
}
```

### Header.tsx - Aendringer

```text
// Tilfoej loading fra useAuth
const { user, isAdmin, loading, signOut } = useAuth();

// Wrap navigation-knapper i loading-check
// Hvis loading er true, vis en diskret spinner i stedet for knapper
{loading ? (
  <Loader2 className="h-4 w-4 animate-spin" />
) : (
  // ... eksisterende navigation-knapper
)}
```

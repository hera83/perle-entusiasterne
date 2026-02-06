

# Fix: Tilfaeldige logouts og token-storm (den egentlige root cause)

## Hvad gaar galt - den RIGTIGE aarsag

Trods alle tidligere fixes sker problemet stadig. Aarsagen er fundet:

### Den skjulte re-render kaskade

`AuthContext` eksponerer `session` i sin context-value. Naar `TOKEN_REFRESHED` fyrer, kalder vi `setSession(session)` - dette aendrer context-valuens reference, og **ALLE** komponenter der bruger `useAuth()` re-renderer. Men INGEN komponent bruger faktisk `session` fra contexten (de kalder `supabase.auth.getSession()` direkte naar de har brug for det).

Saa her er kaskaden:

```text
TOKEN_REFRESHED event
  -> setSession(newSession)
  -> AuthContext.Provider value aendres
  -> ALLE useAuth() consumers re-renderer
  -> PatternCard (3 stk paa galleriet) har [pattern.id, user] dependency
  -> Hver PatternCard fyrer checkFavorite() + refreshProgress() = 2 queries
  -> 6+ database queries paa een gang
  -> Nogle af disse kan trigge endnu en token refresh
  -> Ny TOKEN_REFRESHED -> gentag fra start
  -> 429 rate limit -> session tabt -> logget ud
```

### Yderligere problemer fundet

- **PatternCard.tsx**: `useEffect` afhanger af `[pattern.id, user]` (hele objektet) - fyrer 2 DB-queries per kort ved ENHVER user-reference aendring
- **Favorites.tsx**: `useEffect` afhanger af `[user]` (hele objektet)
- **PatternDialog.tsx**: `navigate()` kalder `saveProgress()` UDEN `await` - fire-and-forget requests der hober sig op
- **AuthContext.tsx**: `session` state er unodvendig i React - den bruges aldrig af consumers, men trigger re-renders

## Loesning (4 filer)

### 1. AuthContext.tsx - Stop unodvendige re-renders

**Problem**: `setSession()` paa TOKEN_REFRESHED trigger re-renders i hele appen, men ingen komponent bruger `session` fra contexten.

**Fix**:
- Gem session i en `useRef` i stedet for `useState` - dette trigger IKKE re-renders
- Behold `session` i context-interfacet for bagudkompatibilitet, men laes den fra ref
- Memoiser context-value med `useMemo` saa den kun aendres naar `user`, `loading` eller `isAdmin` faktisk aendres
- TOKEN_REFRESHED opdaterer kun session-ref (ingen re-render)

### 2. PatternCard.tsx - Stabiliser dependencies

**Problem**: `useEffect` med `[pattern.id, user]` fyrer 2 database-queries (checkFavorite + refreshProgress) for HVERT kort, hver gang user-objektet faar ny reference.

**Fix**: Aendr dependency fra `[pattern.id, user]` til `[pattern.id, user?.id]`

### 3. Favorites.tsx - Stabiliser dependencies

**Problem**: `useEffect` med `[user]` re-fetcher alle favoritter ved enhver user-reference aendring.

**Fix**: Aendr dependency fra `[user]` til `[user?.id]`

### 4. PatternDialog.tsx - Undgaa fire-and-forget

**Problem**: `navigate()` funktionen (linje 233) kalder `saveProgress()` uden `await`. Disse fire-and-forget requests kan hobe sig op og trigge samtidige token refreshes.

**Fix**: Goed saveProgress-kaldet `await` i navigate-funktionen, saa det foerste kald er faerdigt foer det naeste starter.

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Session i useRef, memoiser context value |
| `src/components/gallery/PatternCard.tsx` | Stabiliser useEffect dependency |
| `src/pages/Favorites.tsx` | Stabiliser useEffect dependency |
| `src/components/gallery/PatternDialog.tsx` | Await saveProgress i navigate |

## Tekniske detaljer

### AuthContext.tsx - Ny implementering

```text
// FOER:
const [session, setSession] = useState<Session | null>(null);

// EFTER:
const sessionRef = useRef<Session | null>(null);

// I onAuthStateChange:
if (event === 'TOKEN_REFRESHED') {
  if (session) {
    sessionRef.current = session;  // Opdater ref - INGEN re-render
  }
  return;
}

// Ved SIGNED_IN:
sessionRef.current = session;
setUser(session.user);  // Kun user trigger re-render

// Memoiser context value:
const contextValue = useMemo(() => ({
  user,
  session: sessionRef.current,
  loading,
  isAdmin,
  signIn,
  signOut,
}), [user, loading, isAdmin]);

return (
  <AuthContext.Provider value={contextValue}>
    {children}
  </AuthContext.Provider>
);
```

### PatternCard.tsx

```text
// FOER (linje 59-62):
useEffect(() => {
  checkFavorite();
  refreshProgress();
}, [pattern.id, user]);

// EFTER:
useEffect(() => {
  checkFavorite();
  refreshProgress();
}, [pattern.id, user?.id]);
```

### Favorites.tsx

```text
// FOER (linje 32-36):
useEffect(() => {
  if (user) {
    fetchFavorites();
  }
}, [user]);

// EFTER:
useEffect(() => {
  if (user) {
    fetchFavorites();
  }
}, [user?.id]);
```

### PatternDialog.tsx

```text
// FOER (linje 209-234):
const navigate = (direction: 'prev' | 'next') => {
  // ... beregn ny position ...
  setCurrentPosition(newPosition);
  saveProgress(completedPlates, newPosition);  // fire-and-forget!
};

// EFTER:
const navigate = async (direction: 'prev' | 'next') => {
  // ... beregn ny position ...
  setCurrentPosition(newPosition);
  await saveProgress(completedPlates, newPosition);  // vent paa det er faerdigt
};
```

## Forventet resultat

- TOKEN_REFRESHED trigger INGEN re-renders (session er i ref)
- PatternCard queries fyrer KUN naar brugeren faktisk skifter (user.id aendres)
- Favorites re-fetcher KUN naar brugeren faktisk skifter
- saveProgress kald sker sekventielt i stedet for at hobe sig op
- Ingen cascade af database-kald -> ingen 429 rate limit -> ingen session-tab


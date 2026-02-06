

# Fix: Token-storm og session-tab ved gemning

## Hvad sker der (endelig root cause)

Problemet har to dele:

### Del 1: Sessionen doer ved login (eller ved token-udloeb efter ~1 time)

Auth-loggen viser 4 `token_revoked` events og en `429 rate limit` inden for 1 sekund. Det sker fordi for mange samtidige API-kald trigger flere token-refresh forsog paa een gang. Naar to refresh-forsog bruger det SAMME refresh-token, lykkes det foerste, men det andet fejler - og serveren draeeber sessionen.

**Konkret ved login sker foelgende race condition:**
- Login.tsx har to redirect-mekanismer der korer samtidigt:
  1. En `useEffect` der navigerer naar `user` er sat
  2. `handleSubmit` der ogsaa kalder `navigate('/')`
- `syncFavoritesOnLogin()` kalder `supabase.auth.getUser()` (et ekstra auth-kald)
- Samtidigt: ThemeContext loader tema, Gallery fyrer fetchPatterns, PatternCards fyrer checkFavorite + refreshProgress
- Resultat: 10+ samtidige API-kald inden for 100ms

### Del 2: "Gem alt" bruger anon-noeglen (data gemmes IKKE)

Network-loggen bekraefter: ALLE PATCH requests bruger anon-noeglen som Bearer token. Sessionen var allerede doed FOER brugeren trykkede "Gem alt".

`getSession()` tjekket paa linje 452 returnerer en cached session (fra localStorage), men denne session er ugyldig serverside. Supabase's `getSession()` laaser ikke fra serveren men fra browserens cache. Saa den siger "du har en session" selvom den er dead.

Endnu vaerre: `Promise.all` fyrer N samtidige PATCH-requests. Hvis tokenet udloeber UNDER disse requests, trigger de alle en refresh - og vi faar stormen igen.

## Loesning (4 filer)

### 1. Login.tsx - Fjern race condition ved login

**Problemer:**
- To redirect-mekanismer (useEffect + handleSubmit) koerer samtidigt
- `syncFavoritesOnLogin` kalder `getUser()` (unodvendigt auth-kald)
- Favorit-sync sker FOER navigation, hvilket forsinker og tilfojer samtidige kald

**Fix:**
- Fjern useEffect-redirectet helt - handleSubmit styrer flowet
- Behold en simpel render-check for brugere der allerede er logget ind
- Fjern `getUser()` fra syncFavoritesOnLogin - brug `user` fra signIn-responsens onAuthStateChange
- Flyt favorit-sync til EFTER navigation (fire-and-forget med setTimeout)

### 2. PatternEditor.tsx - Sekventielle saves med fejldetektering

**Problemer:**
- `getSession()` returnerer cached (potentielt stale) session
- `Promise.all` fyrer N samtidige requests der kan trigge token-refresh-storm
- Ingen detektering af om data faktisk blev gemt (204 med 0 raekker opdateret = "success")

**Fix:**
- Erstat `getSession()` med `getUser()` for reel serverside validering
- Erstat `Promise.all` med sekventiel for-loop (et request ad gangen)
- Tilfoej 50ms delay mellem saves for at lade token-operationer settle
- Verificer at UPDATE faktisk opdaterede raekker (brug `.select()` after update)
- Tilfoej detektering af auth-fejl med specifik fejlbesked

### 3. AuthContext.tsx - Haandter SIGNED_OUT med brugerbesked

**Problem:** Naar sessionen doer (pga. 429), modtager klienten et SIGNED_OUT event. Brugeren redirectes stille til login uden at vide at deres data ikke blev gemt.

**Fix:**
- Tilfoej en `wasLoggedIn` ref der tracker om brugeren var logget ind
- Naar SIGNED_OUT fyrer og `wasLoggedIn` er true: vis en toast-besked "Du er blevet logget ud uventet. Dine seneste aendringer er muligvis ikke gemt."
- Dette giver brugeren klar feedback i stedet for stille datatab

### 4. Login.tsx - Serialiser post-login operationer

Samlet ny login-flow:
```text
handleSubmit:
  1. signIn(email, password)        -- auth-kald
  2. navigate('/')                   -- navigation
  3. setTimeout(() => {              -- forsinket sync
       syncFavoritesOnLogin()       -- brug bruger fra auth context
     }, 2000)                       -- 2 sekunders delay
```

## Tekniske detaljer

### Login.tsx

```text
// FOER: Race condition med to redirects
useEffect(() => {
  if (user && !authLoading) {
    setRedirecting(true);
    navigate('/');
  }
}, [user, authLoading, navigate]);

// EFTER: Simpel check i render (ingen useEffect)
if (user && !authLoading) {
  return <Navigate to="/" replace />;
}

// handleSubmit: serialiser flowet
const handleSubmit = async (e) => {
  e.preventDefault();
  // ... validation ...
  const { error } = await signIn(email, password);
  if (error) { /* haandter fejl */ return; }

  toast.success('Du er nu logget ind');
  navigate('/');

  // Sync favorites EFTER navigation med delay
  setTimeout(() => syncFavoritesOnLogin(), 2000);
};

// syncFavoritesOnLogin: ingen getUser()
const syncFavoritesOnLogin = async () => {
  const localFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  if (localFavorites.length === 0) return;

  // Brug getSession() her - sessionen bor vaere stabil 2 sek efter login
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase.from('user_favorites').upsert(
    localFavorites.map((id) => ({
      user_id: session.user.id,
      pattern_id: id,
    })),
    { onConflict: 'user_id,pattern_id' }
  );
  localStorage.removeItem('favorites');
};
```

### PatternEditor.tsx - handleSaveAll

```text
const handleSaveAll = async () => {
  if (!patternId) return;

  // Verificer session mod serveren (IKKE kun cache)
  const { data: { user: currentUser }, error: userError } =
    await supabase.auth.getUser();

  if (userError || !currentUser) {
    toast({
      title: 'Session udloebet',
      description: 'Du er blevet logget ud. Log ind igen for at gemme.',
      variant: 'destructive',
    });
    return;
  }

  setIsSaving(true);
  try {
    // SEKVENTIEL gemning - et request ad gangen
    for (const plate of plates) {
      const { error } = await supabase
        .from('bead_plates')
        .update({ beads: plate.beads as unknown as Json })
        .eq('id', plate.id);

      if (error) {
        // Detekter auth-fejl specifikt
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          throw new Error('SESSION_EXPIRED');
        }
        throw error;
      }

      // Kort pause mellem saves for at undgaa token-refresh-storm
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Thumbnail + metadata
    const totalBeads = plates.reduce((sum, p) => sum + p.beads.length, 0);
    const thumbnail = generateThumbnail();

    const { error: metaError } = await supabase
      .from('bead_patterns')
      .update({ total_beads: totalBeads, thumbnail })
      .eq('id', patternId);

    if (metaError) throw metaError;

    setHasUnsavedChanges(false);
    toast({ title: 'Gemt', description: 'Alle aendringer er gemt.' });
  } catch (error) {
    console.error('Error saving:', error);
    const isAuthError = error instanceof Error &&
      error.message === 'SESSION_EXPIRED';
    toast({
      title: isAuthError ? 'Session udloebet' : 'Fejl',
      description: isAuthError
        ? 'Du er blevet logget ud. Log ind igen og proev at gemme.'
        : 'Kunne ikke gemme aendringer.',
      variant: 'destructive',
    });
  } finally {
    setIsSaving(false);
  }
};
```

### AuthContext.tsx - Uventet logout-besked

```text
// Tilfoej en ref for at tracke om brugeren var logget ind
const wasLoggedInRef = useRef(false);

// I onAuthStateChange:
if (event === 'SIGNED_IN' && session?.user) {
  wasLoggedInRef.current = true;
  // ... eksisterende logik ...
}

if (event === 'SIGNED_OUT') {
  const wasLoggedIn = wasLoggedInRef.current;
  wasLoggedInRef.current = false;
  currentUserIdRef.current = null;
  sessionRef.current = null;
  setUser(null);
  setIsAdmin(false);

  // Vis besked KUN hvis brugeren ikke selv loggede ud
  if (wasLoggedIn) {
    // Import toast fra sonner
    toast.error('Du er blevet logget ud. Dine seneste aendringer er muligvis ikke gemt.');
  }
}

// I signOut funktionen: markér at det er frivilligt
const signOut = useCallback(async () => {
  wasLoggedInRef.current = false; // Forhindrer "uventet logout" besked
  await supabase.auth.signOut();
  setIsAdmin(false);
}, []);
```

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/pages/Login.tsx` | Fjern useEffect redirect, fjern getUser(), forsinket favorit-sync |
| `src/components/workshop/PatternEditor.tsx` | Sekventielle saves, getUser() validering, auth-fejl detektering |
| `src/contexts/AuthContext.tsx` | Uventet logout-besked med wasLoggedInRef |
| `src/components/gallery/PatternDialog.tsx` | Opdater saveProgress med getUser() validering |

## Forventet resultat

- Ved login: Kun 1 auth-kald (signIn) efterfulgt af navigation. Favorit-sync sker 2 sekunder senere. Ingen storm.
- Ved gem: Sekventielle requests (1 ad gangen med 50ms pause). Ingen samtidige token-refresh forsog.
- Ved session-tab: Brugeren faar en klar fejlbesked i stedet for stille datatab.
- Ved "Gem alt": Sessionen valideres mod serveren (getUser) foer gemning starter.

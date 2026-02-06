
# Fix: "Browser Session" tilgang - ignorer Supabase's interne SIGNED_OUT

## Problemet (nu med fuld forstaelse)

Alle tidligere fixes har proevet at forhindre token-refresh stormen. Men den EGENTLIGE fejl er at appen REAGERER paa `SIGNED_OUT` events fra Supabase-klienten. Disse events fyres af mange interne grunde (failed refresh, rate limit, token reuse detection), og hver gang de fyrer, rydder vi brugerens state og redirecter til forsiden.

## Den nye tilgang: Ignorer SIGNED_OUT helt

I stedet for at kaempe med Supabase-klientens interne mekanismer, goer vi appen immun over for dem:

1. **SIGNED_OUT fra onAuthStateChange: IGNORER** - ryd ALDRIG brugerstate baseret paa denne event
2. **"Log ud" knappen: Den ENESTE maade at logge ud** - `signOut()` funktionen rydder state direkte
3. **Operationsfejl (401): Haandter graciost** - hvis en gem/query fejler med auth-fejl, redirect til login
4. **Behold manual refresh timer** - holder tokenet gyldigt i baggrunden

## Hvorfor dette virker

```text
FOER (saarbar):
  Supabase intern refresh fejler -> SIGNED_OUT event -> user = null -> redirect til "/"
  Bruger mister alt arbejde!

EFTER (robust):
  Supabase intern refresh fejler -> SIGNED_OUT event -> IGNORERET
  Bruger forbliver "logget ind" i UI
  Naeste operation fejler med 401 -> "Din session er udloebet, log ind igen"
  Bruger ser en tydelig fejlbesked, mister ikke arbejde
```

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Ignorer SIGNED_OUT events, signOut() rydder direkte |
| `src/components/workshop/PatternEditor.tsx` | Tilfoej auth-fejl haandtering der redirecter |
| `src/components/gallery/PatternDialog.tsx` | Tilfoej auth-fejl haandtering |
| `src/pages/Administration.tsx` | Tilfoej session-recovery ved mount |

## Tekniske detaljer

### AuthContext.tsx - Kerneaendringen

```text
// onAuthStateChange handler:
supabase.auth.onAuthStateChange((event, session) => {
  if (!isMounted) return;

  // TOKEN_REFRESHED: opdater session ref, ingen re-render
  if (event === 'TOKEN_REFRESHED') {
    if (session) {
      sessionRef.current = session;
      scheduleRefresh(session);
    }
    return;
  }

  // INITIAL_SESSION: haandteres af initializeAuth
  if (event === 'INITIAL_SESSION') return;

  // SIGNED_OUT: IGNORER FULDSTAENDIGT
  // Vi rydder KUN brugerstate via den eksplicitte signOut() funktion
  // Dette goer appen immun over for Supabase-klientens interne SIGNED_OUT events
  if (event === 'SIGNED_OUT') {
    return; // <-- DET ER HELE AENDRINGEN
  }

  // SIGNED_IN: opdater state som foer
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
});
```

### AuthContext.tsx - signOut() rydder state direkte

```text
const signOut = useCallback(async () => {
  // Ryd ALLE auth-relaterede state FOER vi kalder Supabase
  currentUserIdRef.current = null;
  sessionRef.current = null;
  wasLoggedInRef.current = false;
  setUser(null);
  setIsAdmin(false);

  // Ryd refresh timer
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }

  // Kald Supabase signOut (vi har allerede ryddet vores state,
  // saa SIGNED_OUT eventet er irrelevant)
  try {
    await supabase.auth.signOut();
  } catch (err) {
    // Ignorer fejl - vi har allerede ryddet state
    console.error('Error during signOut:', err);
  }
}, []);
```

### AuthContext.tsx - Ny verifySession funktion

Tilfoej en funktion som komponenter kan bruge til at verificere sessionen foer kritiske operationer:

```text
const verifySession = useCallback(async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return true;

  // Session er virkelig vaek - ryd state og redirect
  currentUserIdRef.current = null;
  sessionRef.current = null;
  setUser(null);
  setIsAdmin(false);
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }
  return false;
}, []);
```

Tilfoej `verifySession` til AuthContextType interfacet og context value.

### PatternEditor.tsx - Auth-fejl haandtering

I `handleSaveAll`, naar en save fejler med auth-fejl, kald `verifySession`:

```text
const { user, verifySession } = useAuth();

// I handleSaveAll catch block:
catch (error) {
  const isAuthError = error instanceof Error &&
    (error.message === 'SESSION_EXPIRED' ||
     error.message?.includes('JWT') ||
     error.message?.includes('401'));

  if (isAuthError) {
    const isValid = await verifySession();
    if (!isValid) {
      toast({
        title: 'Session udloebet',
        description: 'Du er blevet logget ud. Log ind igen for at gemme.',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
  }

  toast({
    title: 'Fejl',
    description: 'Kunne ikke gemme aendringer.',
    variant: 'destructive',
  });
}
```

### PatternDialog.tsx - Auth-fejl haandtering

Samme moenster: fang auth-fejl og kald `verifySession`:

```text
const saveProgress = async (completed: string[], position: PlatePosition) => {
  if (!pattern) return { error: null };

  if (user) {
    const { error } = await supabase
      .from('user_progress')
      .upsert({ ... });

    if (error) {
      // Tjek om det er en auth-fejl
      if (error.message?.includes('JWT') || error.code === 'PGRST301') {
        console.error('Auth error saving progress, session may be expired');
      }
      return { error };
    }
  }
  // ...
};
```

### Administration.tsx - Fjern aggressiv redirect

I stedet for at redirecte naar `!user || !isAdmin`, tilfoej et ekstra tjek:

```text
// FOER: Redirect oejeblikkeligt naar user er null
if (!user || !isAdmin) {
  return <Navigate to="/" replace />;
}

// EFTER: Vis loading mens vi tjekker, redirect kun naar vi er sikre
if (!user && !loading) {
  return <Navigate to="/login" replace />;
}
if (user && !isAdmin && !loading) {
  return <Navigate to="/" replace />;
}
```

## Oversigt over aendringer

### AuthContext.tsx (hoveddaendring):
- SIGNED_OUT handler: aendret fra "ryd alt" til "ignorer"
- signOut(): rydder state DIREKTE (ikke via event)
- Ny verifySession() funktion eksponeret via context
- Behold alt andet (autoRefreshToken=false, scheduleRefresh, cleanupAutoRefresh)

### PatternEditor.tsx:
- Import verifySession fra useAuth
- I catch-block: kald verifySession ved auth-fejl, redirect til login

### PatternDialog.tsx:
- Tilfoej auth-fejl logging (ikke redirect - det er en dialog)

### Administration.tsx:
- Adskil "ingen bruger" og "ikke admin" checks
- Redirect til /login (ikke /) naar ingen bruger

## Forventet resultat

- Supabase-klientens interne SIGNED_OUT events pavirker IKKE brugerens oplevelse
- "Log ud" knappen virker stadig normalt
- Hvis tokenet udloeber og refresh fejler, faar brugeren en tydelig fejlbesked naar de proever at gemme
- Administration-siden forbliver stabil ved navigation
- Docker + preview kan bruges samtidig uden at pavirke hinanden
- Ingen flere "Du er blevet logget ud" beskeder medmindre brugeren selv logger ud

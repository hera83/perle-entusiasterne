

# Fix: Deaktiver auto-refresh KORREKT via property override

## Problemet (med bevis fra kildekoden)

`stopAutoRefresh()` har ALDRIG virket i nogen af de tidligere fixes. Her er hvorfor:

### Supabase-klientens interne flow (fra kildekoden)

```text
createClient() 
  -> GoTrueClient constructor
    -> this.autoRefreshToken = true  (lagret som property)
    -> this.initialize()             (asynkron!)

_initialize()
  -> _recoverAndRefresh()            (tjekker gammel session)
  -> _handleVisibilityChange()       (registrerer visibility listener)
    -> _onVisibilityChanged(true)
      -> if (this.autoRefreshToken)   <-- TJEKKER PROPERTY
        -> _startAutoRefresh()        <-- STARTER AUTO-REFRESH
```

### Hvad vores kode goer

```text
useEffect() koerer:
  1. stopAutoRefresh()     <-- Koerer FOER _initialize() er faerdig!
                               Intet at stoppe endnu = no-op
  2. onAuthStateChange()   <-- Registrerer callback
  3. getSession()          <-- Venter paa _initialize()
                               _initialize() kalder _handleVisibilityChange()
                               som GENSTARTER auto-refresh!
```

Resultatet: `stopAutoRefresh()` er en komplet no-op. Auto-refresh koerer ALTID.

Derudover: Hver gang brugeren skifter tab (eller preview-iframet re-fokuseres), koerer Supabase-klienten internt:

```text
window 'visibilitychange' event
  -> _onVisibilityChanged()
    -> if (this.autoRefreshToken)   <-- Stadig true!
      -> _startAutoRefresh()        <-- Genstarter IGEN
```

## Loesningen: Override `autoRefreshToken` property

Den ENESTE maade at forhindre auto-refresh paa er at saette `autoRefreshToken = false` DIREKTE paa klient-instansen. Alle interne checks bruger denne property:

- `_handleVisibilityChange()`: `if (this.autoRefreshToken)` -> starter auto-refresh
- `_onVisibilityChanged()`: `if (this.autoRefreshToken)` -> starter auto-refresh ved tab-switch
- `_recoverAndRefresh()`: `if (this.autoRefreshToken && currentSession.refresh_token)` -> refresher ved init

Ved at saette property'en til `false` FOER noget andet sker, vil INGEN af disse code paths aktiveres.

## Aendringer (2 filer)

### 1. Ny fil: `src/lib/supabase-auth-config.ts`

Opretter en lille initialiseringsmodul der:
- Importerer supabase-klienten
- Saetter `autoRefreshToken = false` med det samme (synkront, ved modul-load)
- Eksporterer en `initializeAuth()` funktion der AuthContext kan kalde

Dette sikrer at property'en er sat FOER React overhovedet renderer.

```text
import { supabase } from '@/integrations/supabase/client';

// Deaktiver auto-refresh SYNKRONT ved modul-load
// Dette sker FOER React renderer, saa _initialize() 
// aldrig starter auto-refresh
(supabase.auth as any).autoRefreshToken = false;

export async function cleanupAutoRefresh() {
  // Vent paa at initialization er faerdig
  await supabase.auth.getSession();
  // Ryd op i eventuelt allerede startede timers og visibility listeners
  await supabase.auth.stopAutoRefresh();
}
```

### 2. `src/contexts/AuthContext.tsx`

- Importerer det nye modul (import = synkron koersel af modul-kode)
- Kalder `cleanupAutoRefresh()` EFTER `getSession()` i stedet for foer
- Beholder vores manuelle `scheduleRefresh` timer uaendret

Aendringer i `useEffect`:

```text
// FOER:
useEffect(() => {
  supabase.auth.stopAutoRefresh();  // <-- NO-OP!
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...);
  
  const initializeAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    // ...
  };
  initializeAuth();
}, []);

// EFTER:
import { cleanupAutoRefresh } from '@/lib/supabase-auth-config';

useEffect(() => {
  // INGEN stopAutoRefresh() her - det virker ikke foer init er faerdig
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...);
  
  const initializeAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // NU er initialization faerdig - ryd op i eventuelle timers
    await cleanupAutoRefresh();
    
    // ... resten af init (scheduleRefresh, checkAdminRole, etc.)
  };
  initializeAuth();
}, []);
```

## Hvorfor dette virker

1. **Modul-import er synkron**: Naar AuthContext importerer `supabase-auth-config`, koeres `autoRefreshToken = false` OEJEBLIKKELIGT - foer React renderer, foer useEffect koerer, foer alt andet.

2. **Alle interne checks fejler**: Supabase-klientens `_handleVisibilityChange()`, `_onVisibilityChanged()`, og `_recoverAndRefresh()` tjekker alle `this.autoRefreshToken`. Da den er `false`, starter de ALDRIG auto-refresh.

3. **Tab-skift udloeser ikke refresh**: `_onVisibilityChanged()` starter kun auto-refresh hvis `this.autoRefreshToken === true`. Det er det ikke laengere.

4. **Vores manuelle timer styrer refresh**: `scheduleRefresh()` i AuthContext fyrer praecis 1 gang, 5 minutter foer token udloeber. Ingen loop, ingen race condition.

5. **`cleanupAutoRefresh()` rydder op**: Selv hvis `_initialize()` naaede at starte noget foer vores property-override tog effekt, rydder `cleanupAutoRefresh()` op efter init er faerdig.

## Tekniske detaljer

### `src/lib/supabase-auth-config.ts` (ny fil)

```text
import { supabase } from '@/integrations/supabase/client';

// KRITISK: Dette koerer synkront ved modul-load, FOER React renderer.
// Det forhindrer Supabase-klientens interne auto-refresh fra nogensinde at starte.
//
// Kildekode-reference (GoTrueClient.js):
//   _onVisibilityChanged() linje 2281: if (this.autoRefreshToken) -> _startAutoRefresh()
//   _recoverAndRefresh() linje 1916: if (this.autoRefreshToken) -> _callRefreshToken()
//   _handleVisibilityChange() linje 2250: if (this.autoRefreshToken) -> startAutoRefresh()
//
// Ved at saette denne til false, vil INGEN af disse code paths aktiveres.
(supabase.auth as any).autoRefreshToken = false;

/**
 * Rydder op i eventuelle auto-refresh timers og visibility listeners
 * der blev startet under initialization.
 * 
 * SKAL kaldes EFTER supabase.auth.getSession() (som venter paa init).
 */
export async function cleanupAutoRefresh() {
  await supabase.auth.stopAutoRefresh();
}
```

### `src/contexts/AuthContext.tsx` - aendringer

```text
// Tilfoej import (dette KOERER modulet synkront = saetter autoRefreshToken = false)
import { cleanupAutoRefresh } from '@/lib/supabase-auth-config';

// I useEffect:
useEffect(() => {
  let isMounted = true;

  // FJERNET: supabase.auth.stopAutoRefresh() 
  // (virkede aldrig - autoRefreshToken property er allerede sat til false via import)

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      // ... eksisterende handler uaendret
    }
  );

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      // Ryd op EFTER initialization er faerdig
      await cleanupAutoRefresh();

      // ... resten af init uaendret (sessionRef, setUser, scheduleRefresh, etc.)
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
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };
}, [scheduleRefresh]);
```

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/lib/supabase-auth-config.ts` | NY FIL - saetter autoRefreshToken = false ved modul-load |
| `src/contexts/AuthContext.tsx` | Importerer ny fil, flytter cleanup til efter init |

## Forskellen fra alle tidligere forsog

| Forsog | Hvorfor det ikke virkede |
|--------|------------------------|
| stopAutoRefresh() foer init | No-op - intet at stoppe endnu |
| stopAutoRefresh() + scheduleRefresh | stopAutoRefresh stadig no-op, og visibility listener genstarter auto-refresh |
| Serialisere queries | Problemet er IKKE queries, det er auto-refresh timeren |
| getSession() i stedet for getUser() | Hjjaelper ikke naar auto-refresh allerede looper |
| **Ny: autoRefreshToken = false** | **Forhindrer ALLE interne auto-refresh code paths** |

## Forventet resultat

- INGEN auto-refresh loop - den interne mekanisme kan aldrig starte
- Tab-skift udloeser IKKE token refresh
- Praecis 1 refresh per session - vores timer fyrer 5 min foer udloeb
- Sessionen forbliver stabil ved navigation, gemning, tab-skift og alt andet


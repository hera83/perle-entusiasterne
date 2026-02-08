
# Fix: Token-refresh storm foraarsager logout

## Problemet

Loggen viser en **massiv storm af token-refresh requests** -- over 30 refresh-kald inden for 2-3 sekunder, som til sidst rammer en 429 rate limit. Dette sker fordi der koerer **to konkurrerende refresh-mekanismer** samtidigt:

1. **Supabase's indbyggede auto-refresh** -- konfigureret med `autoRefreshToken: true` i `client.ts` (auto-genereret fil, kan IKKE aendres)
2. **En custom `scheduleRefresh`** i AuthContext -- et setTimeout-baseret system der ogsaa kalder `refreshSession()`

Derudover proever `supabase-auth-config.ts` at disable den indbyggede refresh via `(supabase.auth as any).autoRefreshToken = false`, men dette er en skroebelig race condition der ikke altid virker.

### Hvad der sker naar du bruger appen:

```text
Login med password
  -> Supabase's built-in refresh starter automatisk
  -> Custom scheduleRefresh starter OGSaa
  -> Begge kalder refreshSession() samtidigt
  -> Hvert kald revokerer det forrige token
  -> Dette trigger TOKEN_REFRESHED events
  -> Som kalder scheduleRefresh IGEN
  -> Kaskade af refresh-requests
  -> 429 rate limit ramt
  -> Token bliver ugyldigt
  -> Naeste handling (aaben opskrift/rediger) fejler
  -> Brugeren ser ud til at vaere logget ud
```

## Loesningen

Fjern den custom refresh-mekanisme og lad Supabase's indbyggede auto-refresh haandtere det alene. Da `client.ts` allerede har `autoRefreshToken: true`, er der INGEN grund til at have et ekstra refresh-system.

### AEndring 1: Fjern `supabase-auth-config.ts`

Slet filen helt. Den proever at disable noget der ikke kan disables (fordi `client.ts` er auto-genereret med `autoRefreshToken: true`).

### AEndring 2: Forenkl AuthContext

Fjern:
- `scheduleRefresh` funktionen og `refreshTimerRef`
- Import af `cleanupAutoRefresh`
- `cleanupAutoRefresh()` kaldet i `initializeAuth`
- Alle `scheduleRefresh()` kald

Behold:
- `TOKEN_REFRESHED` handler: opdaterer kun `sessionRef` (ingen reschedule)
- `SIGNED_OUT` handler: forbliver ignoreret (beskytter mod uoensket logout)
- `SIGNED_IN` handler: opdaterer user state (ingen scheduleRefresh)
- Al oevrig logik (checkAdminRole, signIn, signOut, verifySession)

### Resultat

Kun EN refresh-mekanisme (Supabase's indbyggede), ingen konflikter, ingen token-storm, ingen 429 errors.

---

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/lib/supabase-auth-config.ts` | Slettes helt |
| `src/contexts/AuthContext.tsx` | Fjern custom refresh, forenkl auth state management |

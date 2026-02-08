

# Fix: Clock-skew-resistent auth via Storage-wrapper

## Rod-aarsagen (bekraeftet via kildekode-analyse)

Problemet er IKKE kun i auto-refresh-timeren. Det sidder MEGET dybere i Supabase-klienten.

### Tre steder tjekker token-udloeb med `Date.now()`

1. **`_recoverAndRefresh()`** (ved initialisering): Tjekker `expires_at * 1000 - Date.now() < 90000`. Med 1-times clock-skew er resultatet altid `< 90000` => refresh.

2. **`_autoRefreshTokenTick()`** (hvert 30. sekund): Tjekker `(expires_at * 1000 - now) / 30000 <= 3`. Med clock-skew er resultatet altid `<= 3` => refresh.

3. **`__loadSession()`** (paa HVER ENESTE API-foresporgsel): Tjekker `expires_at * 1000 - Date.now() < 90000`. Denne kaldes ved ALLE database-kald, storage-kald og funktionskald, fordi `_getAccessToken()` kalder `getSession()` som kalder `__loadSession()`.

Det er punkt 3 der er det virkelige problem. `stopAutoRefresh()` stopper kun punkt 2 (baggrunds-timeren). Men HVER gang du laver en database-foresporgsel, kører `__loadSession()` og ser tokenet som udløbet pga. clock-skew. Det trigger endnu en refresh. Hvis flere kald sker samtidigt (f.eks. ved navigation), faar du en kaskade.

### Hvorfor expires_at altid ser "udloebet" ud

Med dit system-ur 1 time foran:
- Server udsteder token med `iat = 13:02 UTC`, `expires_at = 14:02 UTC` (1770559322)
- Din browsers `Date.now()` svarer til `14:02 UTC` (fordi dit ur er 1 time foran)
- `expires_at * 1000 - Date.now() = ca. 0`
- `0 < 90000` (EXPIRY_MARGIN_MS) => "udloebet!"
- Hvert NYT token fra refresh har SAMME problem

## Loesningen: Storage-wrapper der justerer expires_at

Da ALLE tre tjek laeser `expires_at` fra `this.storage`, kan vi loese problemet ved at wrappe storage-adapteren. Naar Supabase laeser sessionen, justerer vi `expires_at` saa den altid ser gyldig ud. Vores egen 55-minutters timer haandterer den faktiske refresh.

### Fil 1: `src/lib/clock-skew-storage.ts` (NY)

En storage-adapter der wrapper localStorage:

```text
class ClockSkewStorage {
  private storageKeyPrefix: string;

  constructor() {
    // Supabase storage key format: sb-<ref>-auth-token
    this.storageKeyPrefix = 'sb-';
  }

  private isAuthKey(key: string): boolean {
    return key.startsWith(this.storageKeyPrefix) && key.endsWith('-auth-token');
  }

  getItem(key: string): string | null {
    const value = localStorage.getItem(key);
    if (!value || !this.isAuthKey(key)) return value;

    try {
      const session = JSON.parse(value);
      if (session && typeof session.expires_at === 'number') {
        // Override expires_at to always appear valid (1 hour from NOW in client time)
        // This prevents ALL internal expiry checks from triggering premature refreshes
        session.expires_at = Math.floor(Date.now() / 1000) + 3600;
        return JSON.stringify(session);
      }
    } catch { /* not JSON, return as-is */ }
    return value;
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}
```

Naar `__loadSession()`, `_recoverAndRefresh()` eller `_autoRefreshTokenTick()` laeser sessionen, ser de ALTID `expires_at` som 1 time fra nu. Med en EXPIRY_MARGIN paa 90 sekunder vil de ALDRIG trigge et refresh.

### Fil 2: `src/lib/patch-supabase-auth.ts` (NY)

En simpel funktion der patcher Supabase-klientens storage:

```text
import { supabase } from '@/integrations/supabase/client';
import { ClockSkewStorage } from './clock-skew-storage';

// Patch storage SYNCHRONOUSLY after import, before _initialize() reads from it.
// This works because _initialize() is async (awaits navigator.locks)
// and our synchronous patch runs before the first async read.
(supabase.auth as any).storage = new ClockSkewStorage();
```

Denne fil importeres i `AuthContext.tsx` som det allerfoerste.

### Fil 3: `src/contexts/AuthContext.tsx` (AENDRES)

Aendringer:
1. Importerer patch-filen som foerste import: `import '@/lib/patch-supabase-auth';`
2. Beholder `stopAutoRefresh()` efter `getSession()` (ekstra sikkerhed)
3. Beholder den kontrollerede 55-minutters refresh-timer
4. Beholder visibility-handler for tab-genoptagelse
5. Beholder `isRefreshingRef` guard mod samtidige refreshes

Minimale aendringer - kun tilfoejelse af import-linjen.

## Hvorfor dette virker

1. **Storage-wrapperen rammer rod-aarsagen**: Alle tre steder der tjekker `expires_at` laeser fra `this.storage`. Ved at justere vaerdien ved laesning, ser de ALDRIG tokenet som udloebet.

2. **Ingen kaskade mulig**: `__loadSession()` (som koerer paa HVER API-foresporgsel) vil aldrig trigge `_callRefreshToken()`, fordi `expires_at` altid er 1 time i fremtiden.

3. **Vores timer haandterer refresh**: Den 55-minutters `setTimeout` bruger relativ tid og er immun over for clock-skew.

4. **Patchet virker foer initialisering**: Fordi `_initialize()` er async og venter paa `navigator.locks`, naar vores synkrone patch at koere foer den foerste laesning fra storage.

5. **Virker i baade Docker og Lovable**: Uafhaengig af clock-skew stoerrelse, fordi `expires_at` altid justeres relativt til klientens nuvaerende tid.

6. **Ingen aendringer til auto-genererede filer**: `client.ts` forbliver uroert.

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/lib/clock-skew-storage.ts` | NY - Storage-adapter der justerer expires_at |
| `src/lib/patch-supabase-auth.ts` | NY - Patcher Supabase-klientens storage |
| `src/contexts/AuthContext.tsx` | Tilfoej import af patch-filen |


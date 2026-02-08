/**
 * Clock-skew-resistant storage adapter for Supabase Auth.
 *
 * Problem: Supabase internally checks `expires_at` against `Date.now()` in THREE places:
 *   1. _recoverAndRefresh() – on init
 *   2. _autoRefreshTokenTick() – every 30s
 *   3. __loadSession() – on EVERY API call
 *
 * With clock skew (e.g. client 1h ahead of server), tokens always appear expired,
 * causing a cascade of refresh requests (429 errors).
 *
 * Solution: When Supabase reads the session from storage, we override `expires_at`
 * to always be 1 hour in the future (client time). This makes ALL internal checks
 * see the token as valid. Our own 55-minute timer handles actual refreshes.
 */
export class ClockSkewStorage {
  private isAuthKey(key: string): boolean {
    return key.startsWith('sb-') && key.endsWith('-auth-token');
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
    } catch {
      /* not JSON, return as-is */
    }
    return value;
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

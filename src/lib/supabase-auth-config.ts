import { supabase } from '@/integrations/supabase/client';

// CRITICAL: This runs synchronously at module load, BEFORE React renders.
// It prevents the Supabase client's internal auto-refresh from ever starting.
//
// GoTrueClient source code references:
//   _onVisibilityChanged(): if (this.autoRefreshToken) -> _startAutoRefresh()
//   _recoverAndRefresh(): if (this.autoRefreshToken) -> _callRefreshToken()
//   _handleVisibilityChange(): if (this.autoRefreshToken) -> startAutoRefresh()
//
// By setting this to false, NONE of these code paths will activate.
(supabase.auth as any).autoRefreshToken = false;

/**
 * Cleans up any auto-refresh timers and visibility listeners
 * that may have started during initialization.
 * 
 * MUST be called AFTER supabase.auth.getSession() (which waits for init).
 */
export async function cleanupAutoRefresh() {
  await supabase.auth.stopAutoRefresh();
}

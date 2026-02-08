/**
 * Patch Supabase Auth storage SYNCHRONOUSLY before _initialize() reads from it.
 *
 * This works because _initialize() is async (awaits navigator.locks)
 * and our synchronous patch runs before the first async read.
 *
 * MUST be imported before any auth operations occur (first import in AuthContext).
 */
import { supabase } from '@/integrations/supabase/client';
import { ClockSkewStorage } from './clock-skew-storage';

(supabase.auth as any).storage = new ClockSkewStorage();

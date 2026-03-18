/**
 * Database client abstraction layer.
 * 
 * In hosted/Lovable mode (default): re-exports the real Supabase client.
 * In local mode (VITE_BACKEND_MODE=local): uses a Supabase-compatible proxy
 * that routes all calls to the local Express/PostgreSQL backend.
 */
import { supabase } from '@/integrations/supabase/client';
import { localClient } from './local-client';

const isLocalMode = import.meta.env.VITE_BACKEND_MODE === 'local';

export const db: typeof supabase = isLocalMode ? (localClient as any) : supabase;

import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase admin client using the service role key.
 * Bypasses all RLS policies — use only for server-side mutations
 * that require elevated access (e.g. audit log writes).
 * Never expose this client to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

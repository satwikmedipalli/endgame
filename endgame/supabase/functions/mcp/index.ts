import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { handle } from './server.ts';

// Secrets live in Supabase (npx supabase secrets set), never in git. SUPABASE_URL and
// SUPABASE_ANON_KEY are provided by Supabase itself.
const env = (k: string) => Deno.env.get(k) ?? '';

// Signs in as me, so row-level security still applies; reused while the function stays warm.
let client: Promise<SupabaseClient> | null = null;
function signedIn(): Promise<SupabaseClient> {
  client ??= (async () => {
    const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: true } });
    const { error } = await sb.auth.signInWithPassword({ email: env('ENDGAME_EMAIL'), password: env('ENDGAME_PASSWORD') });
    if (error) throw error;
    return sb;
  })().catch((e) => {
    client = null;
    throw e;
  });
  return client;
}

Deno.serve((req) => handle(req, env('MCP_KEY'), signedIn));

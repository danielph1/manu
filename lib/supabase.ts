import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only client (bypassa RLS - usar só em API routes)
export const supabaseAdmin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Client-safe (p/ realtime do chat; respeita RLS)
export const supabasePublic = createClient(url, anon, {
  auth: { persistSession: false },
});

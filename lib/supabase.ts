/**
 * Cliente Supabase com inicializacao tardia.
 * Next.js importa alguns Route Handlers durante `next build`; esse import nao deve
 * exigir as variaveis do servidor antes de uma requisicao real.
 *
 * ATENCAO: nao ignora a autenticacao. Requisicoes de runtime que utilizem o
 * Supabase exigem URL e chaves validas. service_role nao deve chegar ao browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

function mandatoryEnv(name: string, fallbacks: string[] = []): string {
  for (const n of [name, ...fallbacks]) {
    const value = process.env[n]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Configuracao Supabase incompleta: ${name}. ` +
    'Configure as variaveis no .env.local (desenvolvimento) ' +
    'ou no ambiente do servidor antes de executar a funcionalidade.',
  );
}

function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    if (!url) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL no servidor');
    const service = mandatoryEnv('SUPABASE_SERVICE_ROLE_KEY');
    adminClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function getPublicClient(): SupabaseClient {
  if (!publicClient) {
    // Acesso estatico: o Next.js precisa reconhecer NEXT_PUBLIC_ no bundle do navegador.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
    if (!url || !key) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
    publicClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return publicClient;
}

/** Preserva a interface existente `.from()`, `.auth`, `.storage` etc. */
function lazyClient(factory: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = factory();
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}

/** APENAS no servidor. Usa service_role e ignora RLS. */
export const supabaseAdmin: SupabaseClient = lazyClient(getAdminClient);
/** Chave publica, respeita as regras do projeto. */
export const supabasePublic: SupabaseClient = lazyClient(getPublicClient);

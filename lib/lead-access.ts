import { queryOne } from '@/lib/db';
import type { SessionUser } from '@/lib/session';

/** Autorizacao por empresa/loja. Backend, antes de usar supabaseAdmin. */
export async function podeAcessarLead(u: SessionUser, id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const lead = await queryOne<{ vendedor_id: number | null; empresa_id: number | null; loja: string | null }>(`
    SELECT l.vendedor_id, v.empresa_id, v.loja FROM public.leads l
    LEFT JOIN public.vendedores v ON v.id=l.vendedor_id WHERE l.id=$1`, [id]);
  if (!lead) return false;
  const role = String(u.tipo || '').toLowerCase();
  if (role === 'superadmin') return true;
  if (!u.empresa_id || lead.empresa_id == null || Number(lead.empresa_id) !== Number(u.empresa_id)) return false;
  if (role === 'vendedor') return Number(u.vendedor_id) === Number(lead.vendedor_id);
  if (role === 'gerente') return !!u.loja && String(u.loja).toUpperCase() === String(lead.loja || '').toUpperCase();
  return ['admin','marketing','elfenai','documento','documentista'].includes(role);
}

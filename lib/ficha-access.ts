import { queryOne } from '@/lib/db';
import { leadAcessivel } from '@/lib/lead-access';
import type { SessionUser } from '@/lib/session';
import { permiteArea } from '@/lib/permissoes-acesso';

/** Acesso às fichas é conferido no servidor, nunca por um ID fornecido pelo browser. */
export async function fichaAcessivel(u: SessionUser, ficha: { lead_id?: number | null; vendedor_id?: number | null }) {
  if (!permiteArea(u.tipo,'fichas')) return false;
  if (u.tipo === 'superadmin') return true;
  if (ficha.lead_id) return Boolean(await leadAcessivel(u, Number(ficha.lead_id)));
  // Fichas legadas sem lead: liberar somente se a empresa do vendedor for conhecida.
  if (!ficha.vendedor_id || !u.empresa_id) return false;
  const v = await queryOne<{ empresa_id: number | null; loja: string | null }>(
    `SELECT empresa_id, loja FROM public.vendedores WHERE id=$1`, [ficha.vendedor_id]);
  if (!v?.empresa_id || Number(v.empresa_id) !== Number(u.empresa_id)) return false;
  if (u.tipo === 'vendedor' && Number(ficha.vendedor_id) !== Number(u.vendedor_id)) return false;
  if (u.tipo === 'gerente' && String(v.loja || '').toUpperCase() !== String(u.loja || '').toUpperCase()) return false;
  return true;
}

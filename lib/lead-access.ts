import { queryOne } from '@/lib/db';
import type { SessionUser } from '@/lib/session';

/** Determina empresa e acesso sem confiar em IDs enviados pelo browser. */
export async function leadAcessivel(u: SessionUser, leadId: number) {
  if (!Number.isSafeInteger(leadId) || leadId <= 0) return null;
  const lead = await queryOne<{
    id: number; empresa_id: number | null; vendedor_id: number | null;
    vendedor_empresa_id: number | null; vendedor_loja: string | null; telefone: string | null;
  }>(`SELECT l.id, l.empresa_id, l.vendedor_id,
            v.empresa_id AS vendedor_empresa_id, v.loja AS vendedor_loja, l.telefone
       FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
      WHERE l.id=$1`, [leadId]);
  if (!lead) return null;
  if (lead.empresa_id && lead.vendedor_empresa_id && Number(lead.empresa_id) !== Number(lead.vendedor_empresa_id)) return null;
  const empresaId = Number(lead.empresa_id || lead.vendedor_empresa_id || 0);
  const tipo = String(u.tipo || '').toLowerCase();
  if (tipo === 'superadmin') return { ...lead, empresaId };
  // Leads antigos sem empresa e sem vendedor não podem ser abertos por outras lojas.
  if (!empresaId || !u.empresa_id || empresaId !== Number(u.empresa_id)) return null;
  if (tipo === 'vendedor' && Number(lead.vendedor_id) !== Number(u.vendedor_id)) return null;
  if (tipo === 'gerente' && String(lead.vendedor_loja || '').toUpperCase() !== String(u.loja || '').toUpperCase()) return null;
  return { ...lead, empresaId };
}

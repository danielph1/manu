import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';

export type GestorAtendimento = {
  id: number;
  tipo: 'superadmin' | 'admin' | 'gerente' | 'marketing';
  empresa_id: number | null;
};

/** Valida sessao atual no banco; verifica permissao no servidor. */
export async function gestorAtendimento(req: NextRequest): Promise<GestorAtendimento | null> {
  const user = await requireUser(req);
  if (!user) return null;
  const role = String(user.tipo || '').toLowerCase();
  if (!['superadmin', 'admin', 'gerente', 'marketing'].includes(role)) return null;
  if (role !== 'superadmin' && !user.empresa_id) return null;
  return { id: user.id, tipo: role as GestorAtendimento['tipo'],
    empresa_id: user.empresa_id == null ? null : Number(user.empresa_id) };
}

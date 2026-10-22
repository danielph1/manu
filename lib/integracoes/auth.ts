import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { queryOne } from '@/lib/db';

export type GestorIntegracoes = {
  id: number;
  tipo: 'admin' | 'marketing' | 'superadmin';
  empresa_id: number | null;
};

/** Falha de banco NÃO autoriza ninguém: valida papel novamente no PostgreSQL. */
export async function gestorIntegracoes(req: NextRequest): Promise<GestorIntegracoes | null> {
  const tokenUser = await requireUser(req);
  if (!tokenUser) return null;
  const row = await queryOne<{
    id: number; tipo: string; empresa_id: number | null; ativo: boolean; status: string; empresa_ativa: boolean;
  }>(
    `SELECT u.id, LOWER(TRIM(u.tipo)) AS tipo, u.empresa_id,
            COALESCE(u.ativo, FALSE) AS ativo,
            COALESCE(u.status,'ativo') AS status,
            COALESCE(e.ativo, TRUE) AS empresa_ativa
       FROM public.usuarios u LEFT JOIN public.empresas e ON e.id = u.empresa_id
      WHERE u.id = $1`,
    [tokenUser.id],
  );
  if (!row || !row.ativo || !row.empresa_ativa || row.status.toLowerCase() !== 'ativo') return null;
  if (!['admin', 'marketing', 'superadmin'].includes(row.tipo)) return null;
  if (row.tipo !== 'superadmin' && !row.empresa_id) return null;
  return {
    id: row.id, tipo: row.tipo as GestorIntegracoes['tipo'],
    empresa_id: row.empresa_id == null ? null : Number(row.empresa_id),
  };
}

export function escopoEmpresa(a: GestorIntegracoes, empresaRecebida?: unknown): number | null {
  if (a.tipo !== 'superadmin') return a.empresa_id;
  if (empresaRecebida == null || empresaRecebida === '') return null;
  const id = Number(empresaRecebida);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

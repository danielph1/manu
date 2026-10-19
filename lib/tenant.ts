import type { SessionUser } from './session';

/**
 * Isolamento multi-empresa (SaaS B2B).
 *
 * - Cada usuário pertence a 1 empresa (usuarios.empresa_id).
 * - Admin/gerente da empresa NÃO vê outra empresa.
 * - empresa.ativo = false → ninguém da empresa entra.
 * - status do usuário ≠ ativo → bloqueado (pausado, demitido, férias…).
 * - Super-plataforma: tipo "superadmin" (Aurox) pode cruzar empresas.
 */

export const STATUS_LOGIN_OK = new Set(['ativo']);

export function isSuperAdmin(u: SessionUser): boolean {
  return String(u.tipo || '').toLowerCase() === 'superadmin';
}

export function isEmpresaAdmin(u: SessionUser): boolean {
  const t = String(u.tipo || '').toLowerCase();
  return t === 'admin' || t === 'marketing';
}

/** SQL fragment: vendedores da mesma empresa do usuário */
export function sqlVendedoresDaEmpresa(
  u: SessionUser,
  paramIndex: number,
  columnExpr = 'vendedor_id',
): { sql: string; param: number | null; nextIndex: number } {
  if (isSuperAdmin(u) || !u.empresa_id) {
    return { sql: '', param: null, nextIndex: paramIndex };
  }
  return {
    sql: ` AND ${columnExpr} IN (SELECT id FROM public.vendedores WHERE empresa_id = $${paramIndex})`,
    param: u.empresa_id,
    nextIndex: paramIndex + 1,
  };
}

/** SQL: usuários da mesma empresa */
export function sqlUsuariosDaEmpresa(
  u: SessionUser,
  paramIndex: number,
  alias = 'u',
): { sql: string; param: number | null; nextIndex: number } {
  if (isSuperAdmin(u) || !u.empresa_id) {
    return { sql: '', param: null, nextIndex: paramIndex };
  }
  return {
    sql: ` AND ${alias}.empresa_id = $${paramIndex}`,
    param: u.empresa_id,
    nextIndex: paramIndex + 1,
  };
}

import type { SessionUser } from './session';

/**
 * Isolamento multi-empresa / multi-loja (SaaS B2B).
 *
 * - superadmin (Aurox): vê tudo
 * - admin / marketing: EMPRESA (todas as lojas dela)
 * - gerente: só a LOJA dele
 * - demais: empresa (+ regra do papel)
 */

export const STATUS_LOGIN_OK = new Set(['ativo']);

export function isSuperAdmin(u: SessionUser): boolean {
  return String(u.tipo || '').toLowerCase() === 'superadmin';
}

export function isEmpresaAdmin(u: SessionUser): boolean {
  const t = String(u.tipo || '').toLowerCase();
  return t === 'admin' || t === 'marketing';
}

export function isGerenteLoja(u: SessionUser): boolean {
  return String(u.tipo || '').toLowerCase() === 'gerente';
}

/** Escopo por vendedor_id: empresa + loja do gerente */
export function sqlVendedoresVisiveis(
  u: SessionUser,
  paramIndex: number,
): { sql: string; params: unknown[]; nextIndex: number } {
  if (isSuperAdmin(u)) {
    return { sql: '', params: [], nextIndex: paramIndex };
  }
  const params: unknown[] = [];
  const parts: string[] = [];

  if (u.empresa_id) {
    params.push(u.empresa_id);
    parts.push(`empresa_id = $${paramIndex + params.length - 1}`);
  }

  if (isGerenteLoja(u) && u.loja) {
    params.push(String(u.loja).toUpperCase());
    parts.push(`UPPER(COALESCE(loja,'381')) = UPPER($${paramIndex + params.length - 1})`);
  }

  if (!parts.length) {
    return { sql: ' AND 1=0', params: [], nextIndex: paramIndex };
  }

  return {
    sql: ` AND vendedor_id IN (SELECT id FROM public.vendedores WHERE ${parts.join(' AND ')})`,
    params,
    nextIndex: paramIndex + params.length,
  };
}

/** Escopo em colunas loja + empresa_id (estoque, oficina) */
export function sqlLojaEmpresaCols(
  u: SessionUser,
  paramIndex: number,
  opts: { colLoja?: string; colEmpresa?: string } = {},
): { sql: string; params: unknown[]; nextIndex: number } {
  if (isSuperAdmin(u)) {
    return { sql: '', params: [], nextIndex: paramIndex };
  }
  const colLoja = opts.colLoja || 'loja';
  const colEmpresa = opts.colEmpresa || 'empresa_id';
  const params: unknown[] = [];
  const parts: string[] = [];

  if (u.empresa_id) {
    params.push(u.empresa_id);
    parts.push(`(${colEmpresa} = $${paramIndex + params.length - 1} OR ${colEmpresa} IS NULL)`);
  }

  if (isGerenteLoja(u) && u.loja) {
    params.push(String(u.loja).toUpperCase());
    parts.push(
      `(UPPER(COALESCE(${colLoja},'')) = UPPER($${paramIndex + params.length - 1}) OR COALESCE(${colLoja},'') = '')`,
    );
  }

  if (!parts.length) {
    return { sql: ' AND 1=0', params: [], nextIndex: paramIndex };
  }
  return {
    sql: ` AND (${parts.join(' AND ')})`,
    params,
    nextIndex: paramIndex + params.length,
  };
}

export function sqlVendedoresDaEmpresa(
  u: SessionUser,
  paramIndex: number,
  columnExpr = 'vendedor_id',
): { sql: string; param: number | null; nextIndex: number } {
  if (isSuperAdmin(u)) {
    return { sql: '', param: null, nextIndex: paramIndex };
  }
  if (!u.empresa_id) {
    return { sql: ' AND 1=0', param: null, nextIndex: paramIndex };
  }
  return {
    sql: ` AND ${columnExpr} IN (SELECT id FROM public.vendedores WHERE empresa_id = $${paramIndex})`,
    param: u.empresa_id,
    nextIndex: paramIndex + 1,
  };
}

export function sqlUsuariosDaEmpresa(
  u: SessionUser,
  paramIndex: number,
  alias = 'u',
): { sql: string; param: number | null; nextIndex: number } {
  if (isSuperAdmin(u)) {
    return { sql: '', param: null, nextIndex: paramIndex };
  }
  if (!u.empresa_id) {
    return { sql: ' AND 1=0', param: null, nextIndex: paramIndex };
  }
  return {
    sql: ` AND ${alias}.empresa_id = $${paramIndex}`,
    param: u.empresa_id,
    nextIndex: paramIndex + 1,
  };
}

/** Push params + return SQL for vendedor scope */
export function applyScopeVendedor(
  u: SessionUser,
  params: unknown[],
  columnExpr = 'vendedor_id',
): string {
  const sc = sqlVendedoresVisiveis(u, params.length + 1);
  params.push(...sc.params);
  if (columnExpr !== 'vendedor_id' && sc.sql) {
    return sc.sql.replace(/vendedor_id/g, columnExpr);
  }
  return sc.sql;
}

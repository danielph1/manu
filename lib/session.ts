import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { queryOne } from './db';
import { STATUS_LOGIN_OK } from './tenant';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface SessionUser {
  id: number;
  login: string;
  tipo: string;
  vendedor_id: number | null;
  loja: string | null;
  ativo: boolean;
  nome?: string;
  /** Isolamento SaaS — null só em legado/superadmin */
  empresa_id?: number | null;
  status?: string;
}

export function signSession(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export function verifySession(token: string): SessionUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

export function getBearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const [t, v] = h.split(' ');
  return t === 'Bearer' && v ? v : null;
}

/**
 * Valida token + usuário ainda ativo + status liberado + empresa ativa.
 * Impede acesso cruzado após demissão / cancelamento de contrato.
 */
export async function requireUser(req: NextRequest): Promise<SessionUser | null> {
  const token = getBearer(req);
  if (!token) return null;
  const u = verifySession(token);
  if (!u) return null;

  try {
    const row = await queryOne<{
      ativo: boolean;
      status: string | null;
      empresa_id: number | null;
      tipo: string | null;
      vendedor_id: number | null;
      nome: string | null;
      login: string;
      empresa_ativa: boolean | null;
    }>(
      `SELECT
         COALESCE(u.ativo, TRUE) AS ativo,
         COALESCE(u.status, 'ativo') AS status,
         u.empresa_id,
         u.tipo,
         u.vendedor_id,
         u.nome,
         u.login,
         COALESCE(e.ativo, TRUE) AS empresa_ativa
       FROM public.usuarios u
       LEFT JOIN public.empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`,
      [u.id],
    );

    if (!row) return null;
    if (!row.ativo) return null;
    if (!STATUS_LOGIN_OK.has(String(row.status || 'ativo').toLowerCase())) return null;
    // empresa cancelada → sem acesso (dados permanecem no banco)
    if (row.empresa_id != null && row.empresa_ativa === false) return null;

    // hidrata sessão com dados atuais do banco (tipo/loja podem ter mudado)
    u.ativo = true;
    u.status = String(row.status || 'ativo');
    u.empresa_id = row.empresa_id != null ? Number(row.empresa_id) : u.empresa_id ?? null;
    u.tipo = String(row.tipo || u.tipo || 'vendedor').toLowerCase();
    u.vendedor_id = row.vendedor_id != null ? Number(row.vendedor_id) : null;
    u.nome = row.nome || u.nome;
    u.login = row.login || u.login;
  } catch {
    // modo degradado: confia no JWT se coluna empresa ainda não existir
  }
  return u;
}

export const can = {
  verTudoNaLoja: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'gerente' || u.tipo === 'marketing',
  verMetricas: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'gerente' || u.tipo === 'superadmin',
  editarQualquerLead: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'gerente' || u.tipo === 'marketing' || u.tipo === 'superadmin',
  editarFichasBanco: (u: SessionUser) =>
    u.tipo === 'elfenai' || u.tipo === 'admin' || u.tipo === 'gerente',
  verDocumental: (u: SessionUser) =>
    ['admin', 'gerente', 'documentista', 'documento', 'vendedor', 'superadmin'].includes(u.tipo),
  editarDocumental: (u: SessionUser) =>
    ['admin', 'gerente', 'documentista', 'documento', 'superadmin'].includes(u.tipo),
  /** Todas as lojas DA EMPRESA (não de outras empresas) */
  verTodasLojas: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'marketing' || u.tipo === 'elfenai' || u.tipo === 'superadmin',
};

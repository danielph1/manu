import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { queryOne } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface SessionUser {
  id: number;
  login: string;
  tipo: string;
  vendedor_id: number | null;
  loja: string | null;
  ativo: boolean;
  nome?: string;
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

export async function requireUser(req: NextRequest): Promise<SessionUser | null> {
  const token = getBearer(req);
  if (!token) return null;
  const u = verifySession(token);
  if (!u) return null;
  try {
    const row = await queryOne<{ ativo: boolean }>(
      `SELECT COALESCE(ativo, TRUE) AS ativo FROM public.usuarios WHERE id = $1`,
      [u.id],
    );
    if (!row || !row.ativo) return null;
  } catch {
    // se o banco falhar, ainda confia no JWT (modo degradado)
  }
  return u;
}

export const can = {
  verTudoNaLoja: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'gerente' || u.tipo === 'marketing',
  verMetricas: (u: SessionUser) => u.tipo === 'admin' || u.tipo === 'gerente',
  editarQualquerLead: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'gerente' || u.tipo === 'marketing',
  editarFichasBanco: (u: SessionUser) =>
    u.tipo === 'elfenai' || u.tipo === 'admin' || u.tipo === 'gerente',
  verDocumental: (u: SessionUser) =>
    ['admin', 'gerente', 'documentista', 'documento', 'vendedor'].includes(u.tipo),
  editarDocumental: (u: SessionUser) =>
    ['admin', 'gerente', 'documentista', 'documento'].includes(u.tipo),
  verTodasLojas: (u: SessionUser) =>
    u.tipo === 'admin' || u.tipo === 'marketing' || u.tipo === 'elfenai',
};

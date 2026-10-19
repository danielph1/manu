import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { hashPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u || !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'apenas Aurox (superadmin)' }, { status: 403 });
  }
  const { id } = await params;
  try {
    const emp = await queryOne(`SELECT * FROM public.empresas WHERE id = $1`, [id]);
    if (!emp) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
    const lojas = (await query(`SELECT * FROM public.lojas WHERE empresa_id = $1 ORDER BY id`, [id])).rows;
    const usuarios = (
      await query(
        `SELECT id, nome, login, tipo, ativo, status, vendedor_id, created_at
         FROM public.usuarios WHERE empresa_id = $1 ORDER BY id`,
        [id],
      )
    ).rows;
    return NextResponse.json({ ...emp, lojas, usuarios });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** Ativar/desativar contrato, renomear, datas */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u || !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'apenas Aurox (superadmin)' }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const k of ['nome', 'ativo', 'plano', 'contrato_inicio', 'contrato_fim', 'slug']) {
      if (k in body) {
        vals.push(body[k]);
        fields.push(`${k} = $${vals.length}`);
      }
    }
    if (!fields.length) return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    vals.push(id);
    const row = await queryOne(
      `UPDATE public.empresas SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals,
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** Adiciona loja ou usuário à empresa */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u || !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'apenas Aurox (superadmin)' }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const acao = String(body.acao || '');

    if (acao === 'loja') {
      const codigo = String(body.codigo || '').trim().toUpperCase();
      if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 });
      const row = await queryOne(
        `INSERT INTO public.lojas (empresa_id, codigo, nome, ativo)
         VALUES ($1,$2,$3,TRUE) RETURNING *`,
        [id, codigo, String(body.nome || codigo)],
      );
      return NextResponse.json(row, { status: 201 });
    }

    if (acao === 'usuario') {
      const login = String(body.login || '').trim().toLowerCase();
      const senha = String(body.senha || '').trim();
      const nome = String(body.nome || login).trim();
      const tipo = String(body.tipo || 'admin').toLowerCase();
      if (!login || !senha) return NextResponse.json({ error: 'login e senha obrigatórios' }, { status: 400 });
      const dup = await queryOne(`SELECT id FROM public.usuarios WHERE LOWER(TRIM(login)) = $1`, [login]);
      if (dup) return NextResponse.json({ error: 'login já existe' }, { status: 409 });
      const row = await queryOne(
        `INSERT INTO public.usuarios (nome, login, senha_hash, tipo, ativo, status, empresa_id)
         VALUES ($1,$2,$3,$4,TRUE,'ativo',$5)
         RETURNING id, nome, login, tipo, empresa_id, ativo, status`,
        [nome, login, hashPassword(senha), tipo, id],
      );
      return NextResponse.json(row, { status: 201 });
    }

    return NextResponse.json({ error: 'acao inválida (loja|usuario)' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

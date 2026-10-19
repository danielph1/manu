import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { hashPassword } from '@/lib/password';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';

function slugify(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'apenas Aurox (superadmin)' }, { status: 403 });
  }
  try {
    const { rows } = await query(
      `SELECT e.*,
         (SELECT count(*)::int FROM public.lojas l WHERE l.empresa_id = e.id) AS qtd_lojas,
         (SELECT count(*)::int FROM public.usuarios u WHERE u.empresa_id = e.id AND COALESCE(u.ativo,TRUE)) AS qtd_usuarios
       FROM public.empresas e
       ORDER BY e.id`,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}

/**
 * Cria empresa + lojas + usuário admin inicial.
 * body: {
 *   nome, slug?,
 *   lojas: [{ codigo, nome? }],
 *   admin: { nome, login, senha, email? }
 * }
 */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'apenas Aurox (superadmin)' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const nome = String(body.nome || '').trim();
    if (!nome) return NextResponse.json({ error: 'nome da empresa obrigatório' }, { status: 400 });
    let slug = String(body.slug || slugify(nome)).trim() || slugify(nome);

    const exists = await queryOne(`SELECT id FROM public.empresas WHERE slug = $1`, [slug]);
    if (exists) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const emp = await queryOne(
      `INSERT INTO public.empresas (nome, slug, ativo, plano, contrato_inicio)
       VALUES ($1,$2,TRUE,'basico', CURRENT_DATE)
       RETURNING *`,
      [nome, slug],
    );
    if (!emp?.id) return NextResponse.json({ error: 'falha ao criar empresa' }, { status: 500 });

    const lojasIn = Array.isArray(body.lojas) ? body.lojas : [];
    const lojasCriadas: any[] = [];
    for (const L of lojasIn) {
      const codigo = String(L.codigo || L.nome || '').trim().toUpperCase();
      if (!codigo) continue;
      try {
        const row = await queryOne(
          `INSERT INTO public.lojas (empresa_id, codigo, nome, ativo)
           VALUES ($1,$2,$3,TRUE) RETURNING *`,
          [emp.id, codigo, String(L.nome || codigo)],
        );
        if (row) lojasCriadas.push(row);
      } catch (e: any) {
        // unique conflict — skip
      }
    }
    // se não mandou loja, cria uma padrão
    if (!lojasCriadas.length) {
      const row = await queryOne(
        `INSERT INTO public.lojas (empresa_id, codigo, nome, ativo)
         VALUES ($1,'001',$2,TRUE) RETURNING *`,
        [emp.id, `${nome} — Loja 1`],
      );
      if (row) lojasCriadas.push(row);
    }

    let adminUser: any = null;
    const adm = body.admin || {};
    const admLogin = String(adm.login || '').trim().toLowerCase();
    const admSenha = String(adm.senha || '').trim();
    const admNome = String(adm.nome || 'Administrador').trim();
    if (admLogin && admSenha) {
      const dup = await queryOne(
        `SELECT id FROM public.usuarios WHERE LOWER(TRIM(login)) = $1`,
        [admLogin],
      );
      if (dup) {
        return NextResponse.json(
          {
            empresa: emp,
            lojas: lojasCriadas,
            aviso: 'Empresa criada, mas login do admin já existe — crie o usuário manualmente.',
          },
          { status: 201 },
        );
      }
      const hash = hashPassword(admSenha);
      adminUser = await queryOne(
        `INSERT INTO public.usuarios (nome, login, senha_hash, tipo, ativo, status, empresa_id)
         VALUES ($1,$2,$3,'admin',TRUE,'ativo',$4)
         RETURNING id, nome, login, tipo, empresa_id, ativo, status`,
        [admNome, admLogin, hash, emp.id],
      );
    }

    return NextResponse.json(
      { empresa: emp, lojas: lojasCriadas, admin: adminUser },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}

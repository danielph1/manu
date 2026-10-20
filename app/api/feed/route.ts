import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

async function ensure() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.feed_posts (
      id bigserial PRIMARY KEY,
      autor_id bigint NOT NULL,
      texto text,
      midia_url text,
      midia_tipo text,
      views int DEFAULT 0,
      likes int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      ativo boolean DEFAULT true
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS public.feed_likes (
      post_id bigint NOT NULL,
      usuario_id bigint NOT NULL,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (post_id, usuario_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS public.feed_comentarios (
      id bigserial PRIMARY KEY,
      post_id bigint NOT NULL,
      autor_id bigint NOT NULL,
      texto text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
  `);
}

/** Feed PÚBLICO — sem filtro de loja/empresa */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await ensure();
    const { rows } = await query(
      `SELECT
         p.id, p.texto, p.midia_url, p.midia_tipo,
         COALESCE(p.views,0) AS views,
         COALESCE(p.likes,0) AS likes,
         p.created_at,
         u.nome AS autor_nome,
         u.login AS autor_login,
         u.foto_url AS autor_foto,
         EXISTS (
           SELECT 1 FROM public.feed_likes fl
           WHERE fl.post_id = p.id AND fl.usuario_id = $1
         ) AS eu_curti,
         (SELECT COUNT(*)::int FROM public.feed_comentarios c WHERE c.post_id = p.id) AS comentarios
       FROM public.feed_posts p
       LEFT JOIN public.usuarios u ON u.id = p.autor_id
       WHERE COALESCE(p.ativo, TRUE) = TRUE
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [u.id],
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await ensure();
    const b = await req.json();
    const texto = String(b.texto || '').trim();
    const midia_url = b.midia_url ? String(b.midia_url) : null;
    const midia_tipo = b.midia_tipo ? String(b.midia_tipo) : null;
    if (!texto && !midia_url) {
      return NextResponse.json({ error: 'escreva algo ou anexe mídia' }, { status: 400 });
    }
    const row = await queryOne(
      `INSERT INTO public.feed_posts (autor_id, texto, midia_url, midia_tipo)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [u.id, texto || null, midia_url, midia_tipo],
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

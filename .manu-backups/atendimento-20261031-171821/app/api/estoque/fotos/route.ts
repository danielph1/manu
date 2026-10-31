import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.estoque_fotos (
      id bigserial PRIMARY KEY,
      carro_id bigint NOT NULL,
      path text NOT NULL,
      url text NOT NULL,
      ordem int DEFAULT 0,
      created_by bigint,
      created_at timestamptz DEFAULT now()
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS estoque_fotos_carro_idx ON public.estoque_fotos (carro_id, ordem, id)`,
  );
}

function canEditFotos(tipo: string) {
  const t = String(tipo || '').toLowerCase();
  return ['admin', 'gerente', 'marketing', 'superadmin'].includes(t);
}

/** Lista fotos de um carro — só metadados leves (url). UI carrega 1 a 1. */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const carroId = Number(new URL(req.url).searchParams.get('carro_id') || 0);
  if (!carroId) return NextResponse.json({ error: 'carro_id obrigatório' }, { status: 400 });
  try {
    await ensureTable();
    const { rows } = await query(
      `SELECT id, carro_id, url, ordem, created_at
       FROM public.estoque_fotos
       WHERE carro_id = $1
       ORDER BY ordem ASC, id ASC`,
      [carroId],
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** Upload (já comprimido no client). 1 arquivo por request. */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!canEditFotos(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    await ensureTable();
    const form = await req.formData();
    const carroId = Number(form.get('carro_id') || 0);
    const file = form.get('foto') as File | null;
    if (!carroId || !file) {
      return NextResponse.json({ error: 'carro_id e foto obrigatórios' }, { status: 400 });
    }

    // limite de segurança (~1.5 MB após compressão client)
    if (file.size > 1.5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'arquivo ainda grande demais — comprima no app' },
        { status: 400 },
      );
    }

    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS n FROM public.estoque_fotos WHERE carro_id = $1`,
      [carroId],
    );
    if (Number(cnt[0]?.n || 0) >= 20) {
      return NextResponse.json({ error: 'máximo 20 fotos por carro' }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `estoque/${carroId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'webp'}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || (ext === 'webp' ? 'image/webp' : 'image/jpeg');

    const { error } = await supabaseAdmin.storage.from('manu_arquivos').upload(path, buf, {
      contentType,
      upsert: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabaseAdmin.storage.from('manu_arquivos').getPublicUrl(path);
    const url = data.publicUrl;

    const { rows } = await query(
      `INSERT INTO public.estoque_fotos (carro_id, path, url, ordem, created_by)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(ordem)+1 FROM public.estoque_fotos WHERE carro_id = $1), 0), $4)
       RETURNING id, carro_id, url, ordem, created_at`,
      [carroId, path, url, u.id],
    );
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

/** Apaga uma foto */
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!canEditFotos(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    await ensureTable();
    const id = Number(new URL(req.url).searchParams.get('id') || 0);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const { rows } = await query(
      `SELECT id, path FROM public.estoque_fotos WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });

    const path = rows[0].path as string;
    try {
      await supabaseAdmin.storage.from('manu_arquivos').remove([path]);
    } catch {
      /* ok se já sumiu */
    }
    await query(`DELETE FROM public.estoque_fotos WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

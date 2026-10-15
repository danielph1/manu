import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { rows } = await query(
    `SELECT id, login, nome, tipo, loja,
            COALESCE(telefone,'') AS telefone,
            COALESCE(email,'') AS email,
            COALESCE(foto_url,'') AS foto_url
     FROM public.usuarios WHERE id = $1`,
    [u.id],
  );
  return NextResponse.json(rows[0] || {});
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const body = await req.json();
  const telefone = String(body.telefone || '').trim();
  const email = String(body.email || '').trim();
  const nome = body.nome != null ? String(body.nome).trim() : null;
  await query('UPDATE public.usuarios SET telefone = $1, email = $2, nome = COALESCE($3, nome) WHERE id = $4', [telefone, email, nome, u.id]);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('foto') as File | null;
  if (!file) return NextResponse.json({ error: 'sem arquivo' }, { status: 400 });
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `foto_perfil/${u.id}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from('manu_arquivos').upload(path, buf, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = supabaseAdmin.storage.from('manu_arquivos').getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  await query('UPDATE public.usuarios SET foto_url = $1 WHERE id = $2', [url, u.id]);
  return NextResponse.json({ foto_url: url });
}

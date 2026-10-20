import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

const NOTIF_KEYS = [
  'leads',
  'estoque',
  'oficina',
  'conquistas',
  'tarefas',
  'fichas',
  'faturamento',
  'vendas',
  'chat',
] as const;

const DEFAULTS: Record<string, boolean> = Object.fromEntries(NOTIF_KEYS.map((k) => [k, true]));

async function ensureCols() {
  try {
    await query(`ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS preferencias_notif jsonb DEFAULT '{}'::jsonb`);
    await query(`ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS idioma text DEFAULT 'pt'`);
  } catch {
    /* ok */
  }
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  await ensureCols();
  try {
    const row = await queryOne<{ preferencias_notif: any; idioma: string | null }>(
      `SELECT preferencias_notif, idioma FROM public.usuarios WHERE id = $1`,
      [u.id],
    );
    const raw = (row?.preferencias_notif && typeof row.preferencias_notif === 'object'
      ? row.preferencias_notif
      : {}) as Record<string, boolean>;
    const notif: Record<string, boolean> = { ...DEFAULTS };
    for (const k of NOTIF_KEYS) {
      if (typeof raw[k] === 'boolean') notif[k] = raw[k];
    }
    return NextResponse.json({
      notif,
      idioma: row?.idioma || 'pt',
      keys: NOTIF_KEYS,
    });
  } catch (e: any) {
    return NextResponse.json({ notif: DEFAULTS, idioma: 'pt', keys: NOTIF_KEYS });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  await ensureCols();
  try {
    const body = await req.json();
    if (body.notif && typeof body.notif === 'object') {
      const merged: Record<string, boolean> = { ...DEFAULTS };
      for (const k of NOTIF_KEYS) {
        if (typeof body.notif[k] === 'boolean') merged[k] = body.notif[k];
      }
      await query(`UPDATE public.usuarios SET preferencias_notif = $1::jsonb WHERE id = $2`, [
        JSON.stringify(merged),
        u.id,
      ]);
    }
    if (body.idioma != null) {
      const idioma = String(body.idioma).toLowerCase().slice(0, 5);
      const ok = ['pt', 'en', 'es', 'de'].includes(idioma);
      if (!ok) return NextResponse.json({ error: 'idioma inválido' }, { status: 400 });
      await query(`UPDATE public.usuarios SET idioma = $1 WHERE id = $2`, [idioma, u.id]);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

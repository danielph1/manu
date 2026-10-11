import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { ensureAnexos, salvarAnexo, listarAnexos } from '@/lib/anexos';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    await ensureAnexos('faturamento_anexos', 'faturamento_id');
    return NextResponse.json(await listarAnexos('faturamento_anexos', 'faturamento_id', Number(id)));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  if (!b.arquivo_b64) return NextResponse.json({ error: 'arquivo vazio' }, { status: 400 });
  try {
    await ensureAnexos('faturamento_anexos', 'faturamento_id');
    await salvarAnexo('faturamento_anexos', 'faturamento_id', Number(id), b.nome || 'anexo', b.mime || 'application/octet-stream', b.arquivo_b64);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

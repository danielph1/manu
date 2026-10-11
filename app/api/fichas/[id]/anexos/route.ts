import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';
import { ensureAnexos, salvarAnexo, listarAnexos } from '@/lib/anexos';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    await ensureAnexos('ficha_anexos', 'ficha_id');
    return NextResponse.json(await listarAnexos('ficha_anexos', 'ficha_id', Number(id)));
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
    await ensureAnexos('ficha_anexos', 'ficha_id');
    await salvarAnexo('ficha_anexos', 'ficha_id', Number(id), b.nome || 'anexo', b.mime || 'application/octet-stream', b.arquivo_b64);
    await notificar({
      titulo: 'Anexo na ficha',
      mensagem: `${u.nome || u.login} anexou ${b.nome || 'arquivo'} na ficha #${id}`,
      tipo: 'ficha',
      tipos: ['elfenai', 'elfenaí', 'admin', 'gerente'],
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

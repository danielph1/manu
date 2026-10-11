import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { htmlAutorizacao } from '@/lib/faturamento-html';
import { ensureAnexos, listarAnexos } from '@/lib/anexos';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const row = await queryOne(`SELECT * FROM public.faturamentos WHERE id = $1`, [id]);
    if (!row) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
    let anexosHtml = '';
    try {
      await ensureAnexos('faturamento_anexos', 'faturamento_id');
      const anexos = await listarAnexos('faturamento_anexos', 'faturamento_id', Number(id));
      if (anexos.length) {
        anexosHtml = '<div style="page-break-before:always"><h3>Anexos / comprovantes</h3>';
        for (const a of anexos) {
          if (String(a.mime||'').startsWith('image')) {
            anexosHtml += `<p><b>${a.nome_arquivo}</b></p><img src="data:${a.mime};base64,${a.arquivo_b64}" style="max-width:100%;max-height:900px"/>`;
          } else {
            anexosHtml += `<p><a href="data:${a.mime};base64,${a.arquivo_b64}" download="${a.nome_arquivo}">${a.nome_arquivo}</a></p>`;
          }
        }
        anexosHtml += '</div>';
      }
    } catch { /* sem anexos */ }
    const html = htmlAutorizacao(row).replace('</body>', anexosHtml + '</body>');
    const download = new URL(req.url).searchParams.get('download');
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...(download ? { 'Content-Disposition': `attachment; filename="faturamento-${(row as any).placa || id}.html"` } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

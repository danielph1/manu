import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';
import { notificar } from '@/lib/notify';
import { enviarWhatsAppDaEmpresa } from '@/lib/zapi-empresa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function idLead(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  const leadId = idLead(req.nextUrl.searchParams.get('lead_id'));
  if (!leadId) return NextResponse.json({ error: 'Selecione um lead para consultar o chat.' }, { status: 400 });
  try {
    const lead = await leadAcessivel(u, leadId);
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado nesta empresa ou sem permissão.' }, { status: 403 });
    const { rows } = await query(
      `SELECT m.id, m.mensagem, m.created_at, m.remetente_id, m.lead_id,
          CASE WHEN m.mensagem ILIKE 'Transferido de %' THEN 'Sistema'
            WHEN m.remetente_id IS NULL THEN COALESCE(NULLIF(TRIM(l.nome_lead), ''), 'Cliente')
            ELSE COALESCE(usr.nome,usr.login,'Equipe') END AS remetente_nome,
          CASE WHEN m.mensagem ILIKE 'Transferido de %' THEN 'sistema'
            WHEN m.remetente_id IS NULL THEN 'cliente' ELSE 'equipe' END AS remetente_tipo,
          m.arquivo_nome, m.arquivo_mime,
          CASE WHEN m.arquivo_bytes IS NOT NULL THEN encode(m.arquivo_bytes, 'base64') ELSE NULL END AS arquivo_b64
       FROM public.chat_geral_mensagens m
       LEFT JOIN public.usuarios usr ON usr.id=m.remetente_id
       JOIN public.leads l ON l.id=m.lead_id
       WHERE m.lead_id=$1 ORDER BY m.created_at ASC LIMIT 500`, [leadId],
    );
    let reacoes: Array<{ mensagem_id: number; emoji: string; n: number; eu: boolean }> = [];
    try {
      const r = await query<typeof reacoes[number]>(
        `SELECT mensagem_id, emoji, COUNT(*)::int AS n, BOOL_OR(usuario_id=$2) AS eu
           FROM public.chat_geral_reacoes WHERE mensagem_id=ANY($1::int[])
          GROUP BY mensagem_id, emoji`, [rows.map((m: any) => m.id), u.id],
      );
      reacoes = r.rows;
    } catch { /* reações opcionais */ }
    const porMensagem = new Map<number, typeof reacoes>();
    for (const r of reacoes) porMensagem.set(r.mensagem_id, [...(porMensagem.get(r.mensagem_id) || []), r]);
    return NextResponse.json(rows.map((m: any) => ({ ...m, reacoes: porMensagem.get(m.id) || [] })),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e: any) {
    console.error('[chat GET]', e?.code || '', e?.message || 'erro');
    return NextResponse.json({ error: e?.code === '42703'
      ? 'Colunas de anexos do chat ausentes. Execute a migration 202611030001 no Supabase.'
      : 'Erro ao consultar mensagens. Confira a tabela chat_geral_mensagens.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  try {
    const b = await req.json().catch(() => null);
    const leadId = idLead(b?.lead_id);
    if (!leadId) return NextResponse.json({ error: 'Selecione o lead antes de enviar a mensagem.' }, { status: 400 });
    const lead = await leadAcessivel(u, leadId);
    if (!lead) return NextResponse.json({ error: 'Sem acesso ao lead desta empresa.' }, { status: 403 });
    const msg = String(b.mensagem || '').trim();
    const b64 = b.arquivo_b64 ? String(b.arquivo_b64) : null;
    if (!msg && !b64) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    if (msg.length > 8000) return NextResponse.json({ error: 'Mensagem excede 8.000 caracteres.' }, { status: 400 });
    if (b64 && (b64.length > 5_500_000 || !/^[A-Za-z0-9+/=]+$/.test(b64))) {
      return NextResponse.json({ error: 'Arquivo maior que 4 MB ou inválido.' }, { status: 413 });
    }
    const mime = String(b.arquivo_mime || '').slice(0, 100) || null;
    const nome = String(b.arquivo_nome || '').slice(0, 150) || null;
    const texto = msg || (mime?.startsWith('audio') ? 'Áudio' : 'Mídia');
    const row = await queryOne<any>(
      `INSERT INTO public.chat_geral_mensagens
          (remetente_id, mensagem, arquivo_nome, arquivo_mime, arquivo_bytes, lead_id)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE decode($5::text, 'base64') END, $6)
       RETURNING id, mensagem, created_at, remetente_id, arquivo_nome, arquivo_mime`,
      [u.id, texto, nome, mime, b64, leadId],
    );
    // Envio externo é independente do registro interno. Nunca usa ZAPI_* global de outra empresa.
    const whatsapp = msg && lead.empresaId
      ? await enviarWhatsAppDaEmpresa(lead.empresaId, String(lead.telefone || ''), msg)
      : { ok: false, status: 'not_configured', message: 'Mensagem salva no MANU; envio externo indisponível.' };
    if (lead.empresaId) {
      notificar({ titulo: 'Nova mensagem no chat', mensagem: `${u.nome || u.login}: ${texto.slice(0, 80)}`,
        tipo: 'chat', broadcast: true, empresa_id: lead.empresaId, url: `/chat?lead=${leadId}` }).catch(() => {});
    }
    return NextResponse.json({ ...row, remetente_nome: u.nome || u.login, arquivo_b64: b64,
      reacoes: [], whatsapp, salvo_no_manu: true });
  } catch (e: any) {
    console.error('[chat POST]', e?.code || '', e?.message || 'erro');
    const migration = e?.code === '42703' || e?.code === '42P01';
    return NextResponse.json({ error: migration
      ? 'Estrutura do chat incompleta. Execute a migration 202611030001 e confira as tabelas.'
      : 'Não foi possível gravar a mensagem no MANU. Confira os logs do servidor e o banco.' }, { status: 500 });
  }
}

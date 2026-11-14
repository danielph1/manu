import { NextRequest, NextResponse } from 'next/server';
import { getPool, query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
const PERMITTED = new Set(['superadmin', 'admin', 'gerente', 'marketing']);

/**
 * Transfere dentro da mesma empresa, com checagem server-side + transacao.
 * - gerente transfere somente leads e destinatarios da propria loja;
 * - admin/marketing transferem entre lojas da propria empresa;
 * - superadmin pode atuar sobre qualquer empresa, mas o destino SEMPRE
 *   permanece na empresa original do lead.
 * "modo":"loja" escolhe destino na mesma loja, "empresa" em qualquer
 * loja da empresa. Escolher vendedor_id dispensa o sorteio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const role = String(user.tipo || '').toLowerCase();
  if (!PERMITTED.has(role)) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const { id: idParam } = await params;
  const leadId = Number(idParam);
  const body = await req.json().catch(() => ({}));
  const requestedId = body.vendedor_id == null ? 0 : Number(body.vendedor_id);
  if (!Number.isSafeInteger(leadId) || leadId < 1 || !Number.isSafeInteger(requestedId) || requestedId < 0) {
    return NextResponse.json({ error: 'Identificador invalido' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let transfer: { paraId: number; empresaId: number; deNome: string; paraNome: string } | null = null;
  try {
    await client.query('BEGIN');
    const { rows: [lead] } = await client.query<{
      vendedor_id: number | null; empresa_id: number | null; vendedor_empresa_id: number | null; loja: string | null; de_nome: string | null; comentario_interno:string|null; rotacionar:boolean|null;
    }>(`
      SELECT l.vendedor_id, l.empresa_id, v.empresa_id AS vendedor_empresa_id, v.loja, v.nome AS de_nome, l.comentario_interno, l.rotacionar
        FROM public.leads l
        LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
       WHERE l.id=$1 FOR UPDATE OF l`, [leadId]);

    if (!lead || lead.empresa_id == null || lead.vendedor_id == null || Number(lead.empresa_id)!==Number(lead.vendedor_empresa_id)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Lead sem vendedor/empresa. Encaminhe pela Triagem.' }, { status: 404 });
    }
    if ((String(lead.comentario_interno||'').trim() || lead.rotacionar===false) && !(role==='superadmin' && body.forcar_transferencia===true)) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Lead fixado por comentário interno. Somente superadmin pode transferir com confirmação explícita.'},{status:409});
    }
    const empresaId = Number(lead.empresa_id);
    if (role !== 'superadmin' && (!user.empresa_id || Number(user.empresa_id) !== empresaId)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Lead de outra empresa' }, { status: 403 });
    }
    if (role === 'gerente' && (!user.loja || String(user.loja).toUpperCase() !== String(lead.loja || '').toUpperCase())) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Gerente so pode transferir leads da sua loja' }, { status: 403 });
    }

    const somenteLoja = role === 'gerente' || String(body.modo || 'loja') !== 'empresa';
    const loja = role === 'gerente' ? String(user.loja) : String(lead.loja || '');
    const candidato = await client.query<{ id: number; nome: string; loja: string | null }>(`
      SELECT id, nome, loja FROM public.vendedores
       WHERE empresa_id=$1 AND COALESCE(ativo, FALSE)=TRUE
         AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.vendedor_id=public.vendedores.id
           AND u.empresa_id=public.vendedores.empresa_id AND LOWER(u.tipo)='vendedor'
           AND COALESCE(u.ativo,FALSE) AND LOWER(COALESCE(u.status,'ativo'))='ativo')
         AND id <> $2
         AND ($3::boolean=FALSE OR UPPER(COALESCE(loja,''))=UPPER($4))
         AND ($5::int=0 OR id=$5)
       ORDER BY random() LIMIT 1`,
      [empresaId, lead.vendedor_id, somenteLoja, loja, requestedId]);
    const para = candidato.rows[0];
    if (!para) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Nao ha vendedor elegivel na loja/empresa selecionada' }, { status: 422 });
    }

    await client.query(`UPDATE public.leads
      SET vendedor_id=$2, atribuido_em=now(), rotacionar=CASE WHEN COALESCE(TRIM(comentario_interno),'')<>'' THEN FALSE ELSE TRUE END WHERE id=$1`, [leadId, para.id]);
    await client.query(`INSERT INTO public.manu_atendimento_transferencias
      (empresa_id,lead_id,de_vendedor_id,para_vendedor_id,por_usuario_id,motivo)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [empresaId, leadId, lead.vendedor_id, para.id, user.id, String(body.motivo || 'manual').slice(0, 100)]);
    await client.query('COMMIT');
    transfer = { paraId: para.id, empresaId, deNome: String(lead.de_nome || 'Sem vendedor'), paraNome: para.nome };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('transferencia lead', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Falha ao transferir. Execute a migration de atendimento.' }, { status: 500 });
  } finally {
    client.release();
  }

  if (!transfer) return NextResponse.json({ error: 'Transferencia nao realizada' }, { status: 500 });
  const texto = `Transferido de ${transfer.deNome} para ${transfer.paraNome} · ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  try {
    await query(`INSERT INTO public.chat_geral_mensagens (remetente_id,mensagem,lead_id) VALUES ($1,$2,$3)`,
      [user.id, texto, leadId]);
  } catch { /* logs principal no historico transacional */ }
  try {
    const dest = await queryOne<{ id: number }>(
      `SELECT id FROM public.usuarios WHERE vendedor_id=$1 AND empresa_id=$2 AND COALESCE(ativo,TRUE)=TRUE LIMIT 1`,
      [transfer.paraId, transfer.empresaId]);
    if (dest) await query(`INSERT INTO public.notificacoes (usuario_id,tipo,titulo,mensagem)
      VALUES ($1,'lead','Lead transferido',$2)`, [dest.id, texto]);
  } catch { /* notificacao nao bloqueia transferencia */ }
  return NextResponse.json({ ok: true, vendedor_id: transfer.paraId, para: transfer.paraNome, mensagem: texto });
}

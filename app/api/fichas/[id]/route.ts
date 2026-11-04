import { NextRequest, NextResponse } from 'next/server';
import { getPool, query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/session';
import { notificar } from '@/lib/notify';
import { fichaAcessivel } from '@/lib/ficha-access';

export const runtime = 'nodejs';

type BancoRecebido = {
  id?: number | string;
  client_key?: string;
  banco?: string;
  status?: string;
  valor_financiado?: number | string | null;
  parcela_48?: number | string | null;
  parcela_60?: number | string | null;
  valor_entrada?: number | string | null;
  observacao?: string | null;
};

const CAMPOS_FICHA = [
  'status_geral','banco_contratado','valor_liberado','valor_financiado','valor_entrada',
  'entrada_total','entrada_paga','valor_pendente','gerou_boleto','boleto_valor','boleto_meses',
  'boleto_total','valor_veiculo','fin_parcelas','fin_valor_parcela','observacao_elfenai','etapa_obs',
  'pendente_documentacao','contrato_em_analise','pendente_assinatura','contrato_pago','contrato_recusado',
] as const;
const CAMPOS_NUMERICOS = new Set<string>([
  'valor_liberado','valor_financiado','valor_entrada','entrada_total','entrada_paga','valor_pendente',
  'boleto_valor','boleto_meses','boleto_total','valor_veiculo','fin_parcelas','fin_valor_parcela',
]);
const CAMPOS_BOOLEANOS = new Set<string>([
  'gerou_boleto','pendente_documentacao','contrato_em_analise','pendente_assinatura','contrato_pago','contrato_recusado',
]);

function dinheiro(valor: unknown) {
  if (valor === '' || valor == null) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) throw new Error('Valor numérico inválido na ficha');
  return n;
}
function normalizarStatus(v: unknown) {
  const s = String(v || 'pendente').trim().toLowerCase();
  if (s.startsWith('aprov')) return 'aprovada';
  if (s.startsWith('neg') || s.startsWith('recus') || s.startsWith('reprov')) return 'negada';
  if (['pendente','concluido','concluído','comprado'].includes(s)) return s;
  throw new Error('Status geral da ficha inválido');
}
function normalizarStatusBanco(v: unknown) {
  const s = String(v || 'pendente').trim().toLowerCase();
  if (s.startsWith('aprov')) return 'aprovado';
  if (s.startsWith('neg') || s.startsWith('recus') || s.startsWith('reprov')) return 'negado';
  if (s === 'pendente') return 'pendente';
  throw new Error('Status do banco inválido');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const ficha = await queryOne(`SELECT f.* FROM public.fichas_credito f WHERE f.id = $1`, [id]);
    if (!ficha) return NextResponse.json({ error: 'ficha não encontrada' }, { status: 404 });
    if (!(await fichaAcessivel(u, ficha))) return NextResponse.json({ error: 'Ficha fora da sua empresa ou loja' }, { status: 403 });
    const lead = ficha.lead_id ? await queryOne(`SELECT * FROM public.leads WHERE id = $1`, [ficha.lead_id]) : null;
    const { rows: bancos } = await query(`SELECT * FROM public.ficha_bancos WHERE ficha_id = $1 ORDER BY id`, [id]);
    const responsavel = ficha.vendedor_id ? await queryOne<{empresa_id:number|null;loja:string|null}>(
      `SELECT empresa_id, loja FROM public.vendedores WHERE id=$1`, [ficha.vendedor_id]) : null;
    return NextResponse.json({ ...ficha, status_geral: ficha.status_geral || 'pendente', lead, bancos,
      empresa_id: responsavel?.empresa_id || lead?.empresa_id || null, loja: responsavel?.loja || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao abrir ficha' }, { status: 500 });
  }
}

/** Grava ficha, etapas e todos os bancos NUMA transação. Não perde alterações em falha parcial. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.editarFichasBanco(u)) return NextResponse.json({ error: 'Seu cargo não permite editar fichas bancárias' }, { status: 403 });
  const { id } = await params;
  const fichaId = Number(id);
  if (!Number.isSafeInteger(fichaId) || fichaId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const ficha = await queryOne<{lead_id:number|null;vendedor_id:number|null}>(
    `SELECT lead_id, vendedor_id FROM public.fichas_credito WHERE id=$1`, [fichaId]);
  if (!ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 });
  if (!(await fichaAcessivel(u, ficha))) return NextResponse.json({ error: 'Ficha fora da sua empresa ou loja' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo da ficha inválido' }, { status: 400 });
  if ('bancos' in body && (!Array.isArray(body.bancos) || body.bancos.length > 30))
    return NextResponse.json({ error: 'Lista de bancos inválida (máximo 30)' }, { status: 400 });

  const db = await getPool().connect();
  let resumoVendedor: string | null = null;
  try {
    await db.query('BEGIN');
    const atualRes = await db.query(`SELECT * FROM public.fichas_credito WHERE id=$1 FOR UPDATE`, [fichaId]);
    const atual = atualRes.rows[0];
    if (!atual) throw new Error('Ficha não encontrada');

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const campo of CAMPOS_FICHA) {
      if (!(campo in body)) continue;
      let v: unknown = body[campo];
      if (campo === 'status_geral') v = normalizarStatus(v);
      else if (CAMPOS_NUMERICOS.has(campo)) v = dinheiro(v);
      else if (CAMPOS_BOOLEANOS.has(campo)) v = v === true;
      else if (typeof v === 'string') v = v.trim().slice(0, 5000);
      vals.push(v);
      sets.push(`${campo}=$${vals.length}`);
    }
    if (sets.length) {
      vals.push(fichaId);
      await db.query(`UPDATE public.fichas_credito SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    }

    // NULL = decisão ainda não tomada; FALSE = recusa explícita. Não usar FALSE como default.
    if ('status_geral' in body && ficha.lead_id) {
      const status = normalizarStatus(body.status_geral);
      // Não reclassifica decisões históricas só por autosalvar uma observação.
      const anterior = String(atual.status_geral || 'pendente').toLowerCase();
      if (anterior !== status && ['pendente','aprovada','negada'].includes(status)) {
        const aprovacao = status === 'pendente' ? null : status === 'aprovada';
        await db.query(`UPDATE public.leads SET aprovado=$1 WHERE id=$2`, [aprovacao, ficha.lead_id]);
      }
    }
    if (body.contrato_recusado === true) {
      await db.query(`UPDATE public.fichas_credito SET status_geral='negada' WHERE id=$1`, [fichaId]);
      if (ficha.lead_id) await db.query(`UPDATE public.leads SET aprovado=FALSE WHERE id=$1`, [ficha.lead_id]);
    }

    if ('bancos' in body) {
      const existente = await db.query(`SELECT id FROM public.ficha_bancos WHERE ficha_id=$1 FOR UPDATE`, [fichaId]);
      const permitidos = new Set(existente.rows.map((x: any) => Number(x.id)));
      const manter: number[] = [];
      for (const b of body.bancos as BancoRecebido[]) {
        const banco = String(b.banco || '').trim().slice(0, 140);
        if (!banco) continue; // cartão recém-adicionado mas ainda não preenchido
        const st = normalizarStatusBanco(b.status || 'pendente');
        const obs = String(b.observacao || '').slice(0, 2000);
        const valores = [banco, st, dinheiro(b.valor_financiado), dinheiro(b.parcela_48),
          dinheiro(b.parcela_60), dinheiro(b.valor_entrada), obs || null];
        const itemId = b.id == null || b.id === '' ? null : Number(b.id);
        const key = b.client_key && /^[a-zA-Z0-9:_-]{6,100}$/.test(b.client_key) ? b.client_key : null;
        let salvo: number;
        if (itemId) {
          if (!permitidos.has(itemId)) throw new Error('Banco não pertence a esta ficha');
          const r = await db.query(`UPDATE public.ficha_bancos SET banco=$1,status=$2,valor_financiado=$3,
            parcela_48=$4,parcela_60=$5,valor_entrada=$6,observacao=$7
            WHERE id=$8 AND ficha_id=$9 RETURNING id`, [...valores, itemId, fichaId]);
          salvo = Number(r.rows[0].id);
        } else if (key) {
          const r = await db.query(`INSERT INTO public.ficha_bancos
            (ficha_id,banco,status,valor_financiado,parcela_48,parcela_60,valor_entrada,observacao,client_key)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (ficha_id,client_key) WHERE client_key IS NOT NULL DO UPDATE SET
            banco=EXCLUDED.banco,status=EXCLUDED.status,valor_financiado=EXCLUDED.valor_financiado,
            parcela_48=EXCLUDED.parcela_48,parcela_60=EXCLUDED.parcela_60,
            valor_entrada=EXCLUDED.valor_entrada,observacao=EXCLUDED.observacao RETURNING id`,
            [fichaId, ...valores, key]);
          salvo = Number(r.rows[0].id);
        } else {
          const r = await db.query(`INSERT INTO public.ficha_bancos
            (ficha_id,banco,status,valor_financiado,parcela_48,parcela_60,valor_entrada,observacao)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [fichaId,...valores]);
          salvo = Number(r.rows[0].id);
        }
        manter.push(salvo);
      }
      // Um banco removido da interface realmente deixa de fazer parte da ficha.
      if (manter.length) await db.query(`DELETE FROM public.ficha_bancos WHERE ficha_id=$1 AND NOT(id=ANY($2::bigint[]))`, [fichaId, manter]);
      else await db.query(`DELETE FROM public.ficha_bancos WHERE ficha_id=$1`, [fichaId]);
    }

    if (body.notificar_vendedor === true) {
      const linhas = await db.query(`SELECT banco,status,observacao FROM public.ficha_bancos WHERE ficha_id=$1 ORDER BY id`, [fichaId]);
      const obs = String(body.observacao_elfenai ?? atual.observacao_elfenai ?? '').trim();
      const obsBancos = linhas.rows.filter((b: any) => b.observacao).map((b: any) => `${b.banco}: ${b.observacao}`);
      resumoVendedor = [
        `Ficha #${fichaId} atualizada.`,
        obs,
        ...obsBancos,
        body.pendente_documentacao ? 'Documentação pendente.' : '',
      ].filter(Boolean).join(' ').slice(0, 550);
    }
    await db.query('COMMIT');
  } catch (e: any) {
    await db.query('ROLLBACK').catch(() => {});
    return NextResponse.json({ error: e?.message || 'Erro ao salvar a ficha' }, { status: 500 });
  } finally { db.release(); }

  if (resumoVendedor && ficha.vendedor_id) {
    try {
      const destino = await queryOne<{id:number;empresa_id:number|null}>(
        `SELECT id,empresa_id FROM public.usuarios WHERE vendedor_id=$1 AND COALESCE(ativo,TRUE)=TRUE LIMIT 1`, [ficha.vendedor_id]);
      if (destino) await notificar({ titulo:'Resposta da ficha bancária', mensagem:resumoVendedor,
        tipo:'ficha', usuario_ids:[destino.id], empresa_id:destino.empresa_id || undefined, url:'/fichas' });
    } catch { /* falha de push não desfaz alterações já confirmadas */ }
  }
  return NextResponse.json({ ok:true, salvo:true });
}

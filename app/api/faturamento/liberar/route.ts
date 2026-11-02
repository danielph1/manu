import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';
import { empresaPermitida } from '@/lib/faturamento-empresa';

export const runtime = 'nodejs';

function limpa(p: string) {
  return String(p || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'documentista', 'elfenai', 'elfenaí', 'superadmin', 'marketing'].includes(
    String(u.tipo || '').toLowerCase(),
  )) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    const empresaId = u.tipo==='superadmin' ? Number(b.empresa_id) : Number(u.empresa_id);
    if(!empresaPermitida(u,empresaId))return NextResponse.json({error:'empresa não autorizada'},{status:403});
    const placa = limpa(b.placa);
    if (!placa) return NextResponse.json({ error: 'placa obrigatória' }, { status: 400 });

    const where = `REPLACE(REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ',''),'.','') = $1 AND empresa_id = $2`;

    let carro: any = null;
    try {
      carro = await queryOne(
        `SELECT marca, modelo, carro, ano, ano_modelo, placa, cor FROM public.estoque_carros WHERE ${where} LIMIT 1`,
        [placa,empresaId],
      );
    } catch { /* ok */ }
    let ofi: any = null;
    try {
      ofi = await queryOne(
        `SELECT marca, modelo, ano_modelo, placa, cor FROM public.oficina_carros WHERE ${where} LIMIT 1`,
        [placa,empresaId],
      );
    } catch { /* ok */ }

    let fat: any = null;
    try {
      fat = await queryOne(
        `SELECT * FROM public.faturamentos WHERE ${where} ORDER BY id DESC LIMIT 1`,
        [placa,empresaId],
      );
    } catch { /* ok */ }

    const marca = String(carro?.marca || ofi?.marca || fat?.marca || b.marca || '').trim();
    const modelo = String(
      carro?.modelo || carro?.carro || ofi?.modelo || fat?.modelo || fat?.carro || b.modelo || '',
    ).trim();
    const ano = String(
      carro?.ano || carro?.ano_modelo || ofi?.ano_modelo || fat?.ano_modelo || fat?.ano || b.ano || '',
    ).trim();
    const cor = String(carro?.cor || ofi?.cor || fat?.cor || b.cor || '').trim();
    if(!fat)return NextResponse.json({error:'Sem faturamento autorizado desta empresa para a placa'},{status:404});
    const nome = String(fat?.nome || fat?.nome_cliente || '').trim();
    const leadId = fat?.lead_id || null;
    const fichaId = fat?.ficha_id || null;

    // marca liberado no faturamento
    if (fat?.id) {
      try {
        await query(
          `UPDATE public.faturamentos SET
             liberado = TRUE,
             status = COALESCE(NULLIF(status,''), 'emitido'),
             marca = COALESCE(NULLIF(marca,''), $2),
             modelo = COALESCE(NULLIF(modelo,''), $3),
             ano_modelo = COALESCE(NULLIF(ano_modelo,''), $4)
           WHERE id = $1 AND empresa_id=$5`,
          [fat.id, marca || null, modelo || null, ano || null, empresaId],
        );
      } catch {
        try {
          await query(
            `UPDATE public.faturamentos SET liberado = TRUE, status = 'emitido' WHERE id = $1 AND empresa_id=$2`,
            [fat.id,empresaId],
          );
        } catch { /* ok */ }
      }
    }

    // estoque: não apaga — fica inativo (histórico / planos futuros) e tira anúncio
    try {
      await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS status_estoque text DEFAULT 'ativo'`);
      await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false`);
    } catch { /* ok */ }
    try {
      await query(
        `UPDATE public.estoque_carros SET
           status_estoque = 'inativo',
           anunciado = false,
           anunciado_em = NULL
         WHERE ${where}`,
        [placa,empresaId],
      );
    } catch {
      // Não apaga o veículo se a atualização falhar: preservar estoque e histórico.
    }
    // Oficina: manter registro/histórico; não excluir por efeito colateral do faturamento.

    if (leadId) {
      try {
        await query(
          `UPDATE public.leads SET venda_concluida = TRUE, data_venda = COALESCE(data_venda, now()) WHERE id = $1 AND vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id=$2)`,
          [leadId,empresaId],
        );
      } catch { /* ok */ }
    }
    if (fichaId) {
      try {
        await query(`UPDATE public.fichas_credito SET comprou = TRUE WHERE id = $1`, [fichaId]);
      } catch { /* ok */ }
    }

    // cria/atualiza processo de transferência com dados do veículo
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.processos_transferencia (
          id bigserial PRIMARY KEY,
          ficha_id bigint,
          lead_id bigint,
          placa text,
          nome_lead text,
          marca text,
          modelo text,
          ano text,
          cor text,
          status text DEFAULT 'em_andamento',
          gravame boolean DEFAULT false,
          reconheceu_firma boolean DEFAULT false,
          documento_pronto boolean DEFAULT false,
          observacao text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        )
      `);
    } catch { /* ok */ }
    for (const col of ['marca', 'modelo', 'ano', 'cor', 'empresa_id']) {
      try {
        await query(`ALTER TABLE public.processos_transferencia ADD COLUMN IF NOT EXISTS ${col} ${col==='empresa_id'?'integer':'text'}`);
      } catch { /* ok */ }
    }

    const existing=await queryOne<any>(
      `SELECT id FROM public.processos_transferencia WHERE empresa_id=$4 AND
       (($1::bigint IS NOT NULL AND ficha_id=$1) OR ($2::bigint IS NOT NULL AND lead_id=$2)
        OR (COALESCE(placa,'')<>'' AND REPLACE(REPLACE(UPPER(placa),'-',''),' ','')=$3))
       ORDER BY id DESC LIMIT 1`,[fichaId,leadId,placa,empresaId],
    ).catch(()=>null);
    if(existing?.id){
      await query(`UPDATE public.processos_transferencia SET placa=COALESCE(NULLIF(placa,''),$2),
        nome_lead=COALESCE(NULLIF(nome_lead,''),$3),marca=COALESCE(NULLIF(marca,''),$4),
        modelo=COALESCE(NULLIF(modelo,''),$5),ano=COALESCE(NULLIF(ano,''),$6),
        cor=COALESCE(NULLIF(cor,''),$7),updated_at=now() WHERE id=$1 AND empresa_id=$8`,
        [existing.id,fat.placa,nome,marca,modelo,ano,cor,empresaId]);
    }else{
      await query(`INSERT INTO public.processos_transferencia
        (ficha_id,lead_id,placa,nome_lead,marca,modelo,ano,cor,status,observacao,empresa_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'em_andamento','auto: liberado no faturamento',$9)`,
        [fichaId,leadId,fat.placa,nome,marca,modelo,ano,cor,empresaId]);
    }

    const txt = `${marca} ${modelo} ${ano} ${b.placa || placa} vendido`
      .replace(/\s+/g, ' ')
      .trim();
    await notificar({ titulo: 'Carro vendido', mensagem: txt, tipo: 'venda', broadcast: true, empresa_id: empresaId });
    return NextResponse.json({ ok: true, mensagem: txt, marca, modelo, ano, placa: b.placa || placa });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao liberar' }, { status: 500 });
  }
}

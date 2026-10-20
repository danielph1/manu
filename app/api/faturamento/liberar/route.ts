import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

function limpa(p: string) {
  return String(p || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'documentista', 'elfenai', 'elfenaí', 'superadmin'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    const placa = limpa(b.placa);
    if (!placa) return NextResponse.json({ error: 'placa obrigatória' }, { status: 400 });

    const where = `REPLACE(REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ',''),'.','') = $1`;
    let carro: any = null;
    try {
      carro = await queryOne(
        `SELECT marca, modelo, carro, ano, ano_modelo, placa FROM public.estoque_carros WHERE ${where} LIMIT 1`,
        [placa],
      );
    } catch { /* ok */ }
    let ofi: any = null;
    try {
      ofi = await queryOne(
        `SELECT marca, modelo, ano_modelo, placa FROM public.oficina_carros WHERE ${where} LIMIT 1`,
        [placa],
      );
    } catch { /* ok */ }

    let fat: any = null;
    try {
      fat = await queryOne(
        `SELECT id, ficha_id, lead_id, nome, placa, marca, modelo, ano_modelo, vendedor_nome
         FROM public.faturamentos
         WHERE ${where}
         ORDER BY id DESC LIMIT 1`,
        [placa],
      );
    } catch { /* ok */ }

    const c = carro || ofi || fat || b;

    try { await query(`DELETE FROM public.estoque_carros WHERE ${where}`, [placa]); } catch { /* ok */ }
    try { await query(`DELETE FROM public.oficina_carros WHERE ${where}`, [placa]); } catch { /* ok */ }

    const leadId = b.lead_id || fat?.lead_id || null;
    const fichaId = b.ficha_id || fat?.ficha_id || null;
    const nome = b.nome || fat?.nome || '';

    if (leadId) {
      try {
        await query(
          `UPDATE public.leads SET venda_concluida = TRUE, data_venda = COALESCE(data_venda, now()) WHERE id = $1`,
          [leadId],
        );
      } catch { /* ok */ }
    }
    if (fichaId) {
      try {
        await query(`UPDATE public.fichas_credito SET comprou = TRUE WHERE id = $1`, [fichaId]);
      } catch { /* ok */ }
    }

    try {
      await query(
        `UPDATE public.faturamentos SET liberado = TRUE, status = 'emitido'
         WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1`,
        [placa],
      );
    } catch { /* ok */ }

    // Cria processo de transferência (sempre)
    try {
      const existe = await queryOne(
        `SELECT id FROM public.processos_transferencia
         WHERE ($1::bigint IS NOT NULL AND ficha_id = $1)
            OR UPPER(REPLACE(REPLACE(COALESCE(placa,''),'-',''),' ','')) = $2
         LIMIT 1`,
        [fichaId, placa],
      );
      if (!existe) {
        await query(
          `INSERT INTO public.processos_transferencia
             (ficha_id, lead_id, placa, nome_lead, status, observacao)
           VALUES ($1,$2,$3,$4,'em_andamento',$5)`,
          [
            fichaId,
            leadId,
            b.placa || fat?.placa || placa,
            nome,
            'liberado no faturamento',
          ],
        );
      }
    } catch (e) {
      console.error('processo insert', e);
      // tenta mínimo
      try {
        await query(
          `INSERT INTO public.processos_transferencia (placa, nome_lead, status)
           VALUES ($1,$2,'em_andamento')`,
          [b.placa || placa, nome],
        );
      } catch { /* ok */ }
    }

    const txt = `${c.marca || fat?.marca || ''} ${c.modelo || c.carro || fat?.modelo || ''} ${c.ano_modelo || c.ano || fat?.ano_modelo || ''} ${b.placa || placa} vendido`
      .replace(/\s+/g, ' ')
      .trim();

    await notificar({ titulo: 'Carro vendido', mensagem: txt, tipo: 'venda', broadcast: true });
    return NextResponse.json({ ok: true, mensagem: txt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao liberar' }, { status: 500 });
  }
}

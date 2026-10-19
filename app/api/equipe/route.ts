import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    let vends: any[] = [];
    const lojaFilter = u.tipo === 'gerente' && u.loja;
    const empFilter = !!(u.empresa_id && u.tipo !== 'superadmin');
    const paramsBase: unknown[] = [];
    let extra = ` WHERE LOWER(COALESCE(v.nome,'')) <> 'matheus'`;
    if (empFilter) {
      paramsBase.push(u.empresa_id);
      extra += ` AND v.empresa_id = $${paramsBase.length}`;
    }
    if (lojaFilter) {
      paramsBase.push(u.loja);
      extra += ` AND UPPER(COALESCE(v.loja,'381')) = UPPER($${paramsBase.length})`;
    }
    try {
      const r = await query(
        `SELECT v.id, v.nome, v.loja, COALESCE(u.foto_url,'') AS foto_url
         FROM public.vendedores v
         LEFT JOIN public.usuarios u ON u.vendedor_id = v.id
         ${extra}
         ORDER BY LOWER(v.nome)`,
        paramsBase,
      );
      vends = r.rows;
    } catch {
      try {
        const r = await query(
          `SELECT v.id, v.nome, v.loja, COALESCE(u.foto_url,'') AS foto_url
           FROM public.vendedores v LEFT JOIN public.usuarios u ON u.vendedor_id = v.id
           WHERE LOWER(COALESCE(v.nome,'')) <> 'matheus' ORDER BY LOWER(v.nome)`,
        );
        vends = r.rows;
      } catch { /* ok */ }
    }

    if (!vends.length) return NextResponse.json([]);

    // métricas do mês (ranking)
    let leads: any[] = [];
    for (const sql of [
      `SELECT vendedor_id, COALESCE(respondeu,FALSE) AS respondeu, COALESCE(gerou_ficha,FALSE) AS gerou_ficha, COALESCE(aprovado,FALSE) AS aprovado, COALESCE(venda_concluida,FALSE) AS venda FROM public.leads WHERE COALESCE(data_lead, created_at)::date >= date_trunc('month', CURRENT_DATE)`,
      `SELECT vendedor_id, COALESCE(respondeu,FALSE) AS respondeu, COALESCE(gerou_ficha,FALSE) AS gerou_ficha, FALSE AS aprovado, COALESCE(venda_concluida,FALSE) AS venda FROM public.leads`,
    ]) {
      try {
        leads = (await query(sql)).rows;
        break;
      } catch { /* next */ }
    }

    const by = new Map<number, any>();
    for (const l of leads) {
      const id = Number(l.vendedor_id);
      if (!id) continue;
      if (!by.has(id)) by.set(id, { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendas: 0 });
      const a = by.get(id);
      a.leads++;
      if (l.respondeu) a.responderam++;
      if (l.gerou_ficha) a.fichas++;
      if (l.aprovado) a.aprovados++;
      if (l.venda) a.vendas++;
    }

    // + do dia: leads que CAÍRAM pra ele hoje (transferência recebida OU primeira atribuição)
    const recebeuHoje = new Map<number, number>();
    const passouHoje = new Map<number, number>();
    const recebeuMes = new Map<number, number>();
    const passouMes = new Map<number, number>();

    try {
      const { rows: tr } = await query(
        `SELECT para_vendedor_id, de_vendedor_id, created_at::date AS d
         FROM public.lead_transferencias
         WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      );
      const hoje = new Date().toISOString().slice(0, 10);
      for (const t of tr || []) {
        const para = Number(t.para_vendedor_id);
        const de = Number(t.de_vendedor_id);
        const isHoje = String(t.d).slice(0, 10) === hoje;
        if (para) {
          recebeuMes.set(para, (recebeuMes.get(para) || 0) + 1);
          if (isHoje) recebeuHoje.set(para, (recebeuHoje.get(para) || 0) + 1);
        }
        if (de) {
          passouMes.set(de, (passouMes.get(de) || 0) + 1);
          if (isHoje) passouHoje.set(de, (passouHoje.get(de) || 0) + 1);
        }
      }
    } catch { /* tabela pode não existir ainda */ }

    // também conta primeira atribuição do dia (sem transferência) via atribuido_em
    try {
      const { rows: atr } = await query(
        `SELECT vendedor_id, COUNT(*)::int AS n
         FROM public.leads
         WHERE COALESCE(atribuido_em, data_lead, created_at)::date = CURRENT_DATE
           AND vendedor_id IS NOT NULL
         GROUP BY vendedor_id`,
      );
      for (const a of atr || []) {
        const id = Number(a.vendedor_id);
        // se já contou transferência, não dobra — usa o maior entre transfer e atribuição
        const atual = recebeuHoje.get(id) || 0;
        if (Number(a.n) > atual) recebeuHoje.set(id, Number(a.n));
      }
    } catch { /* ok */ }

    const seen = new Set<string>();
    const out: any[] = [];
    for (const v of vends) {
      const key = String(v.nome || '').trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const id = Number(v.id);
      const a = by.get(id) || { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendas: 0 };
      const pontos = a.leads + a.responderam * 0.5 + a.fichas * 0.5 + a.aprovados + a.vendas * 2;
      out.push({
        ...v,
        ...a,
        pontos,
        plus_hoje: recebeuHoje.get(id) || 0,
        minus_hoje: passouHoje.get(id) || 0,
        plus_mes: recebeuMes.get(id) || 0,
        minus_mes: passouMes.get(id) || 0,
      });
    }
    out.sort((a, b) => b.pontos - a.pontos || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

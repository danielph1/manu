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
    const tries = [
      `SELECT v.id, v.nome, v.loja, COALESCE(u.foto_url,'') AS foto_url FROM public.vendedores v LEFT JOIN public.usuarios u ON u.vendedor_id = v.id WHERE LOWER(COALESCE(v.nome,'')) <> 'matheus' ${lojaFilter ? 'AND UPPER(COALESCE(loja,\'381\')) = UPPER($1)' : ''} ORDER BY LOWER(v.nome)`,
      `SELECT v.id, v.nome, v.loja, COALESCE(u.foto_url,'') AS foto_url FROM public.vendedores v LEFT JOIN public.usuarios u ON u.vendedor_id = v.id WHERE LOWER(COALESCE(v.nome,'')) <> 'matheus' ORDER BY LOWER(v.nome)`,
      `SELECT v.id, v.nome, v.loja, COALESCE(u.foto_url,'') AS foto_url FROM public.vendedores v LEFT JOIN public.usuarios u ON u.vendedor_id = v.id ORDER BY v.id`,
    ];
    for (const sql of tries) {
      try {
        const params = sql.includes('$1') && lojaFilter ? [u.loja] : [];
        const r = await query(sql, params);
        if (r.rows.length) { vends = r.rows; break; }
        vends = r.rows;
      } catch { /* next */ }
    }
    if (!vends.length) {
      return NextResponse.json([]);
    }

    let leads: any[] = [];
    const leadTries = [
      `SELECT vendedor_id, COALESCE(respondeu,FALSE) AS respondeu, COALESCE(gerou_ficha,FALSE) AS gerou_ficha, COALESCE(aprovado,FALSE) AS aprovado, COALESCE(venda_concluida,FALSE) AS venda FROM public.leads WHERE data_lead >= date_trunc('month', CURRENT_DATE)`,
      `SELECT vendedor_id, COALESCE(respondeu,FALSE) AS respondeu, COALESCE(gerou_ficha,FALSE) AS gerou_ficha, FALSE AS aprovado, COALESCE(venda_concluida,FALSE) AS venda FROM public.leads`,
    ];
    for (const sql of leadTries) {
      try {
        const r = await query(sql);
        leads = r.rows;
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
    const seen = new Set<string>();
    const out: any[] = [];
    for (const v of vends) {
      const key = String(v.nome || '').trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const a = by.get(Number(v.id)) || { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendas: 0 };
      const pontos = a.leads + a.responderam * 0.5 + a.fichas * 0.5 + a.aprovados + a.vendas * 2;
      out.push({ ...v, ...a, pontos });
    }
    out.sort((a, b) => b.pontos - a.pontos || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

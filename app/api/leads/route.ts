import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

function inicioPeriodo(periodo: string): { di: string | null; df: string | null } {
  const now = new Date();
  if (periodo === 'hoje') return { di: now.toISOString().slice(0, 10), df: null };
  if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { di: d.toISOString().slice(0, 10), df: null };
  }
  if (periodo === 'mes' || periodo === 'este_mes') {
    return { di: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), df: null };
  }
  if (periodo === 'mes_passado') {
    return {
      di: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10),
      df: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    };
  }
  return { di: null, df: null };
}

async function rotacionar() {
  try {
    const vencidos = await query(
      `SELECT id, vendedor_id FROM public.leads
       WHERE vendedor_id IS NOT NULL
         AND COALESCE(rotacionar, FALSE) = TRUE
         AND COALESCE(atribuido_em, data_lead, created_at) < now() - interval '10 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM public.chat_geral_mensagens m
           WHERE m.lead_id = leads.id AND m.mensagem LIKE '[interno]%'
         )`,
    );
    for (const l of vencidos.rows) {
      const outro = await queryOne(
        `SELECT id FROM public.vendedores
         WHERE id <> $1 AND LOWER(COALESCE(nome,'')) <> 'matheus'
         ORDER BY random() LIMIT 1`,
        [l.vendedor_id],
      );
      if (outro) {
        await query(`UPDATE public.leads SET vendedor_id = $1, atribuido_em = now() WHERE id = $2`, [outro.id, l.id]);
      }
    }
  } catch { /* colunas podem nao existir ainda */ }
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  await rotacionar();

  try {
    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get('filtro') || 'todos';
    const periodo = searchParams.get('periodo') || 'mes';
    const busca = (searchParams.get('busca') || '').trim();
    const vendedorIdParam = searchParams.get('vendedor_id');
    const lojaParam = searchParams.get('loja');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 500);

    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace('?', `$${params.length}`));
    };

    // RBAC
    if (u.tipo === 'vendedor' && u.vendedor_id) {
      add('l.vendedor_id = ?', u.vendedor_id);
    } else if (u.tipo === 'gerente' && u.loja) {
      add(
        `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER(?))`,
        u.loja,
      );
    }
    if (lojaParam && ['admin', 'marketing'].includes(u.tipo)) {
      add(
        `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER(?))`,
        lojaParam,
      );
    }
    if (vendedorIdParam && ['admin', 'gerente', 'marketing'].includes(u.tipo)) {
      add('l.vendedor_id = ?', parseInt(vendedorIdParam, 10));
    }

    const { di, df } = inicioPeriodo(periodo);
    if (di) add('COALESCE(l.data_lead, l.created_at)::date >= ?::date', di);
    if (df) add('COALESCE(l.data_lead, l.created_at)::date < ?::date', df);

    if (filtro === 'responderam') where.push('COALESCE(l.respondeu, FALSE) = TRUE');
    else if (filtro === 'nao_responderam') where.push('COALESCE(l.respondeu, FALSE) = FALSE');
    else if (filtro === 'fichas') where.push('COALESCE(l.gerou_ficha, FALSE) = TRUE');
    else if (filtro === 'aprovados') where.push('COALESCE(l.aprovado, FALSE) = TRUE');
    else if (filtro === 'vendidos') {
      where.push('(COALESCE(l.venda_concluida, FALSE) = TRUE OR l.data_venda IS NOT NULL)');
    } else if (filtro === 'negados') {
      where.push('COALESCE(l.gerou_ficha, FALSE) = TRUE AND COALESCE(l.aprovado, FALSE) = FALSE');
    }

    if (busca) {
      params.push(`%${busca}%`);
      const p = `$${params.length}`;
      where.push(
        `(l.nome_lead ILIKE ${p} OR l.nome_completo ILIKE ${p} OR l.telefone ILIKE ${p} OR l.cpf ILIKE ${p} OR COALESCE(l.observacao,'') ILIKE ${p})`,
      );
    }

    params.push(limit);
    const lim = `$${params.length}`;

    const sql = `
      SELECT
        l.*,
        v.nome AS vendedor_nome,
        v.loja AS vendedor_loja,
        (SELECT f.status_geral FROM public.fichas_credito f WHERE f.lead_id = l.id ORDER BY f.id DESC LIMIT 1) AS status_ficha
      FROM public.leads l
      LEFT JOIN public.vendedores v ON v.id = l.vendedor_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.data_lead DESC NULLS LAST, l.id DESC
      LIMIT ${lim}
    `;

    const { rows } = await query(sql, params);
    return NextResponse.json(rows);
  } catch (e: any) {
    console.error('leads GET', e);
    return NextResponse.json({ error: e?.message || 'erro leads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    const body = await req.json();
    const nome = String(body.nome_lead || body.nome || '').trim();
    if (!nome) {
      return NextResponse.json({ error: 'nome_lead obrigatório' }, { status: 400 });
    }

    let vendedorId = body.vendedor_id != null ? Number(body.vendedor_id) : u.vendedor_id;
    if (u.tipo === 'vendedor') vendedorId = u.vendedor_id;

    const row = await queryOne(
      `
      INSERT INTO public.leads (
        data_lead, vendedor_id, nome_lead, telefone, cpf,
        nome_completo, observacao, respondeu, gerou_ficha, aprovado,
        produto_interesse, origem_id
      )
      VALUES (
        COALESCE($1::date, CURRENT_DATE),
        $2, $3, $4, $5, $6, $7,
        COALESCE($8, FALSE), COALESCE($9, FALSE), COALESCE($10, FALSE),
        $11, $12
      )
      RETURNING *
      `,
      [
        body.data_lead || null,
        vendedorId,
        nome,
        body.telefone || null,
        body.cpf || null,
        body.nome_completo || nome,
        body.observacao || null,
        body.respondeu ?? false,
        body.gerou_ficha ?? false,
        body.aprovado ?? false,
        body.produto_interesse || null,
        body.origem_id || null,
      ],
    );

    await notificar({
        titulo: 'Novo lead',
        mensagem: String(nome || 'lead'),
        tipo: 'lead',
        tipos: ['admin', 'gerente'],
      });
      return NextResponse.json(row);
  } catch (e: any) {
    console.error('leads POST', e);
    return NextResponse.json({ error: e?.message || 'erro ao criar lead' }, { status: 500 });
  }
}

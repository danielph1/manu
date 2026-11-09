import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, getPool } from '@/lib/db';
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

// Atribuição automática ocorre exclusivamente em /api/leads/auto-passar,
// com cron autenticado, bloqueio transacional e isolamento por empresa.

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  // Rotacao somente pelo endpoint cron autenticado /api/leads/auto-passar.

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

    // Isolamento por empresa (SaaS) — nunca vaza lead de outra empresa
    if (u.tipo !== 'superadmin') {
      if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
      add('l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = ?)', u.empresa_id);
    }

    // RBAC dentro da empresa
    if (u.tipo === 'vendedor' && !u.vendedor_id) return NextResponse.json({ error: 'Vendedor não vinculado à sessão' }, { status: 403 });
    if (u.tipo === 'vendedor' && u.vendedor_id) {
      add('l.vendedor_id = ?', u.vendedor_id);
    } else if (u.tipo === 'gerente' && u.loja) {
      // gerente: somente a loja dele
      if (u.empresa_id) {
        params.push(u.loja);
        params.push(u.empresa_id);
        where.push(
          `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length - 1}) AND empresa_id = $${params.length})`,
        );
      } else {
        add(
          `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER(?))`,
          u.loja,
        );
      }
    }
    if (lojaParam && ['admin', 'marketing', 'superadmin'].includes(u.tipo)) {
      add(
        `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER(?))`,
        lojaParam,
      );
    }
    if (vendedorIdParam && ['admin', 'gerente', 'marketing', 'superadmin'].includes(u.tipo)) {
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
      where.push(`EXISTS (SELECT 1 FROM public.fichas_credito fn WHERE fn.lead_id=l.id
        AND (LOWER(COALESCE(fn.status_geral,'')) LIKE 'negad%'
          OR LOWER(COALESCE(fn.status_geral,'')) LIKE 'recus%'
          OR LOWER(COALESCE(fn.status_geral,'')) LIKE 'reprov%'))`);
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

/** Cadastro consistente: vincula empresa ao vendedor e cria ficha na mesma transação. */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dados do lead inválidos' }, { status: 400 });
  const nome = String(body.nome_lead || body.nome || '').trim();
  if (!nome) return NextResponse.json({ error: 'Informe o nome do lead' }, { status: 400 });

  const vendedorId = u.tipo === 'vendedor' ? Number(u.vendedor_id) : Number(body.vendedor_id || u.vendedor_id);
  if (!Number.isSafeInteger(vendedorId) || vendedorId <= 0)
    return NextResponse.json({ error: 'Selecione o vendedor responsável. O lead precisa pertencer a uma empresa.' }, { status: 400 });

  try {
    const vendedor = await queryOne<{ id: number; empresa_id: number | null; loja: string | null }>(
      `SELECT id, empresa_id, loja FROM public.vendedores WHERE id = $1 AND COALESCE(ativo,TRUE)=TRUE`, [vendedorId],
    );
    if (!vendedor?.empresa_id) return NextResponse.json({ error: 'Vendedor não encontrado ou sem empresa vinculada' }, { status: 400 });
    const empresaId = Number(vendedor.empresa_id);
    if (u.tipo !== 'superadmin' && (!u.empresa_id || Number(u.empresa_id) !== empresaId))
      return NextResponse.json({ error: 'O vendedor não pertence à sua empresa' }, { status: 403 });
    if (u.tipo === 'gerente' && String(u.loja || '').toUpperCase() !== String(vendedor.loja || '').toUpperCase())
      return NextResponse.json({ error: 'O vendedor não pertence à sua loja' }, { status: 403 });
    if (body.empresa_id != null && Number(body.empresa_id) !== empresaId)
      return NextResponse.json({ error: 'Empresa e vendedor selecionados não correspondem' }, { status: 400 });

    // Colunas fixas e parametrizadas: nunca usar nomes de colunas enviados pelo navegador.
    const campos = [
      'data_lead', 'vendedor_id', 'empresa_id', 'nome_lead', 'telefone', 'cpf',
      'nome_completo', 'observacao', 'respondeu', 'gerou_ficha', 'aprovado',
      'produto_interesse', 'origem_id',
      'em_loja', 'cliente_na_loja', 'venda_concluida',
      'data_nascimento', 'habilitado', 'carro_selecionado', 'marca_carro', 'cor_carro', 'ano_carro',
      'placa_carro', 'valor_carro', 'valor_entrada', 'nome_pai', 'nome_mae',
      'rg', 'data_expedicao', 'orgao_expeditor', 'email', 'endereco', 'bairro',
      'cidade', 'estado', 'cep', 'empresa', 'cnpj', 'endereco_empresa',
      'bairro_empresa', 'cidade_empresa', 'estado_empresa', 'cep_empresa', 'tempo_carreira',
      'salario', 'banco_correntista',
    ] as const;
    const datas = new Set(['data_lead', 'data_nascimento', 'data_expedicao']);
    const numeros = new Set(['valor_carro', 'valor_entrada', 'salario', 'origem_id']);
    const booleanos = new Set(['respondeu', 'gerou_ficha', 'aprovado', 'em_loja', 'cliente_na_loja', 'venda_concluida', 'habilitado']);
    const ficha = body.gerou_ficha === true;
    const valores: unknown[] = campos.map((campo) => {
      if (campo === 'vendedor_id') return vendedorId;
      if (campo === 'empresa_id') return empresaId;
      if (campo === 'nome_lead') return nome;
      if (campo === 'nome_completo') return body.nome_completo || nome;
      if (campo === 'gerou_ficha') return ficha;
      // Status sem decisão: NULL, jamais FALSE por padrão.
      if (campo === 'aprovado') return body.aprovado === true ? true : null;
      if (campo === 'data_lead') return body.data_lead || new Date().toISOString().slice(0, 10);
      if (campo === 'cliente_na_loja') return Boolean(body.cliente_na_loja ?? body.em_loja);
      const raw = body[campo];
      if (booleanos.has(campo)) return Boolean(raw);
      if (raw === '' || raw === undefined || raw === null) return null;
      if (datas.has(campo)) {
        const valor = String(raw).slice(0,10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error(`Data inválida: ${campo}`);
        return valor;
      }
      if (numeros.has(campo)) {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido: ${campo}`);
        return n;
      }
      return raw;
    });

    const db = await getPool().connect();
    try {
      await db.query('BEGIN');
      const inserido = await db.query(
        `INSERT INTO public.leads (${campos.join(', ')}) VALUES (${campos.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`, valores,
      );
      const lead = inserido.rows[0];
      if (ficha) {
        await db.query(
          `INSERT INTO public.fichas_credito (lead_id, vendedor_id, criado_por_id, valor_entrada, valor_veiculo, status_geral)
           VALUES ($1,$2,$3,$4,$5,'pendente')`,
          [lead.id, vendedorId, u.id, Number(body.valor_entrada || 0), Number(body.valor_carro || 0)],
        );
      }
      await db.query('COMMIT');
      try {
        await notificar({ titulo: 'Novo lead', mensagem: nome, tipo: 'lead',
          tipos: ['superadmin', 'admin', 'gerente'], empresa_id: empresaId });
      } catch { /* uma falha de notificação não desfaz a venda */ }
      return NextResponse.json(lead, { status: 201 });
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { db.release(); }
  } catch (e: any) {
    console.error('[leads POST]', e);
    return NextResponse.json({ error: e?.message || 'Não foi possível criar o lead e a ficha' }, { status: 500 });
  }
}

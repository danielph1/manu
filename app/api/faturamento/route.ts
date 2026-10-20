import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const busca = (searchParams.get('busca') || '').trim();
    const params: unknown[] = [];
    const where: string[] = ['1=1'];

    // isolamento empresa / loja
    if (!isSuperAdmin(u) && u.empresa_id) {
      params.push(u.empresa_id);
      where.push(`(
        f.empresa_id = $${params.length}
        OR f.criado_por_id IN (SELECT id FROM public.usuarios WHERE empresa_id = $${params.length})
        OR UPPER(COALESCE(f.loja,'')) IN (
          SELECT UPPER(codigo) FROM public.lojas WHERE empresa_id = $${params.length}
        )
      )`);
    }
    if (u.tipo === 'vendedor') {
      params.push(u.id);
      where.push(`f.criado_por_id = $${params.length}`);
    } else if ((isGerenteLoja(u) || u.tipo === 'gerente') && u.loja) {
      params.push(String(u.loja).toUpperCase());
      where.push(`UPPER(COALESCE(f.loja,'381')) = UPPER($${params.length})`);
    }

    if (busca) {
      params.push(`%${busca}%`);
      const p = `$${params.length}`;
      where.push(
        `(f.nome ILIKE ${p} OR f.placa ILIKE ${p} OR f.cpf_cnpj ILIKE ${p} OR COALESCE(f.vendedor_nome,'') ILIKE ${p})`,
      );
    }

    // Não lista todos de uma vez se admin — só com busca ou últimos 50
    params.push(busca ? 100 : 50);
    const { rows } = await query(
      `
      SELECT
        f.id, f.nome, f.cpf_cnpj, f.placa, f.marca, f.modelo, f.ano_modelo,
        f.entrada_total, f.status, f.vendedor_nome, f.criado_por_id,
        f.created_at, f.loja
      FROM public.faturamentos f
      WHERE ${where.join(' AND ')}
      ORDER BY f.created_at DESC NULLS LAST
      LIMIT $${params.length}
      `,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    const b = await req.json();
    if (!b.nome || !b.placa) {
      return NextResponse.json({ error: 'nome e placa obrigatórios' }, { status: 400 });
    }

    const row = await queryOne(
      `
      INSERT INTO public.faturamentos (
        lead_id, ficha_id, criado_por_id, loja,
        nome, cpf_cnpj, endereco, bairro, cidade, cep, email, telefone,
        marca, modelo, ano_modelo, placa, cor, kilometragem,
        entrada_dinheiro, entrada_debito, entrada_credito,
        entrada_transferencia, entrada_boleto, entrada_total,
        fin_banco, fin_parcelas, fin_valor_parcela,
        observacoes, vendedor_nome, status
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,
        $25,$26,$27,
        $28,$29, COALESCE($30,'emitido')
      )
      RETURNING id
      `,
      [
        b.lead_id || null,
        b.ficha_id || null,
        u.id,
        u.loja || '381',
        b.nome,
        b.cpf_cnpj || null,
        b.endereco || null,
        b.bairro || null,
        b.cidade || null,
        b.cep || null,
        b.email || null,
        b.telefone || null,
        b.marca || null,
        b.modelo || null,
        b.ano_modelo || null,
        b.placa,
        b.cor || b.cor_carro || b.cor_veiculo || null,
        b.kilometragem || null,
        Number(b.entrada_dinheiro || 0),
        Number(b.entrada_debito || 0),
        Number(b.entrada_credito || 0),
        Number(b.entrada_transferencia || 0),
        Number(b.entrada_boleto || 0),
        Number(b.entrada_total || 0),
        b.fin_banco || null,
        b.fin_parcelas || null,
        b.fin_valor_parcela || null,
        b.observacoes || null,
        b.vendedor_nome || u.nome || u.login,
        b.status || 'emitido',
      ],
    );
    try {
      const dest: number[] = [];
      if (b.vendedor_id) dest.push(Number(b.vendedor_id));
      else if (b.lead_id) {
        const r = await query(
          `SELECT u.id FROM public.leads l
           JOIN public.usuarios u ON u.vendedor_id = l.vendedor_id
           WHERE l.id = $1`,
          [b.lead_id],
        );
        if (r.rows[0]?.id) dest.push(Number(r.rows[0].id));
      }
      await notificar({
        titulo: 'Faturamento pronto',
        mensagem: `${b.nome} · ${b.placa} — complete e imprima`,
        tipo: 'faturamento',
        usuario_ids: dest,
        tipos: dest.length ? ['admin', 'gerente'] : ['admin', 'gerente'],
      });
    } catch { /* aviso nao bloqueia */ }
    /* vai para o documental só quando liberar o carro */
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const atual = await queryOne(`SELECT * FROM public.faturamentos WHERE id = $1`, [b.id]);
  if (!atual) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });

  const pode = ['admin', 'gerente', 'documentista', 'elfenai', 'elfenaí'].includes(u.tipo)
    || (u.tipo === 'vendedor' && atual.criado_por_id === u.id);
  if (!pode) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const campos = ['nome','cpf_cnpj','telefone','email','endereco','bairro','cidade','cep',
    'marca','modelo','ano_modelo','placa','cor','kilometragem','vendedor_nome',
    'entrada_dinheiro','entrada_debito','entrada_credito','entrada_transferencia','entrada_boleto','entrada_total',
    'fin_banco','fin_parcelas','fin_valor_parcela','observacoes','status',
    'troca_marca','troca_modelo','troca_ano_modelo','troca_placa','troca_cor','troca_km'];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of campos) {
    if (k in b) { params.push(b[k] || null); sets.push(`${k} = $${params.length}`); }
  }
  if (sets.length) {
    params.push(b.id);
    await query(`UPDATE public.faturamentos SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }

  const novo = await queryOne(`SELECT * FROM public.faturamentos WHERE id = $1`, [b.id]);
  if (novo?.status === 'emitido' && novo?.troca_placa && !atual.troca_entrou_estoque) {
    try {
      await query(
        `INSERT INTO public.estoque_carros (marca, carro, modelo, ano, placa, cor, status, patio)
         VALUES ($1,$2,$3,$4,$5,$6,'Disponível','—')`,
        [novo.troca_marca, `${novo.troca_marca || ''} ${novo.troca_modelo || ''}`.trim(), novo.troca_modelo, novo.troca_ano_modelo, novo.troca_placa, novo.troca_cor],
      );
      await query(`UPDATE public.faturamentos SET troca_entrou_estoque = TRUE WHERE id = $1`, [b.id]);
      const { notificar } = await import('@/lib/notify');
      await notificar({
        titulo: 'Carro no estoque',
        mensagem: `${novo.troca_marca || ''} ${novo.troca_modelo || ''} ${novo.troca_ano_modelo || ''} ${novo.troca_placa} entrou (troca)`.replace(/\s+/g, ' ').trim(),
        tipo: 'estoque',
        broadcast: true,
      });
    } catch { /* ok */ }
  }
  return NextResponse.json({ ok: true });
}

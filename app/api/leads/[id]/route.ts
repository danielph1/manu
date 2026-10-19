import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser, can } from '@/lib/session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*, vendedor:vendedores!leads_vendedor_id_fkey(id,nome,loja)')
    .eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ ...data, vendedor_nome: data?.vendedor?.nome ?? null, aprovado: data?.aprovou_credito });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  if (u.tipo === 'vendedor') {
    const { data: lead } = await supabaseAdmin.from('leads').select('vendedor_id').eq('id', id).single();
    if (!lead || lead.vendedor_id !== u.vendedor_id) {
      return NextResponse.json({ error: 'sem permissao' }, { status: 403 });
    }
  }

  const allowed = ['nome_lead','telefone','cpf','produto_interesse','observacao','comentario_interno','respondeu','gerou_ficha','data_hora_visita','venda_concluida','data_venda','nome_completo','data_nascimento','habilitado','data_lead','em_loja','cliente_na_loja','carro_selecionado','marca_carro','ano_carro','placa_carro','cor_carro','valor_carro','valor_entrada','score','rg','data_expedicao','orgao_expeditor','nome_pai','nome_mae','email','endereco','bairro','cidade','estado','cep','empresa','cnpj','endereco_empresa','bairro_empresa','cidade_empresa','estado_empresa','cep_empresa','tempo_carreira','salario','banco_correntista'];
  const payload: any = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];
  if ('score' in payload && payload.score !== null && payload.score !== '') {
    const n = Number(payload.score);
    payload.score = Number.isFinite(n) ? n : null;
  }

  // comentário interno segura o lead — para de rotacionar
  if ('comentario_interno' in body) {
    const ci = String(body.comentario_interno || '').trim();
    payload.comentario_interno = ci;
    payload.rotacionar = ci.length === 0;
  }

  const { data, error } = await supabaseAdmin.from('leads').update(payload).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.gerou_ficha === true) {
    const { data: exists } = await supabaseAdmin.from('fichas_credito').select('id').eq('lead_id', id).maybeSingle();
    if (!exists) {
      const ins: any = {
        lead_id: Number(id),
        vendedor_id: data.vendedor_id,
        criado_por_id: u.id,
        valor_entrada: data.valor_entrada || 0,
        valor_veiculo: data.valor_carro || 0,
      };
      if (data.score != null) ins.score = data.score;
      await supabaseAdmin.from('fichas_credito').insert(ins);
    }
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 });
  if (!can.editarQualquerLead(u)) return NextResponse.json({ error: 'apenas gerente/admin' }, { status: 403 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from('leads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

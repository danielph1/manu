import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/session';
import { notificar } from '@/lib/notify';
import { fichaAcessivel } from '@/lib/ficha-access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const ficha = await queryOne(
      `SELECT f.* FROM public.fichas_credito f WHERE f.id = $1`,
      [id],
    );
    if (!ficha) return NextResponse.json({ error: 'ficha não encontrada' }, { status: 404 });
    if (!(await fichaAcessivel(u, ficha))) return NextResponse.json({ error: 'Ficha fora da sua empresa ou loja' }, { status: 403 });

    let lead: any = null;
    if (ficha.lead_id) {
      try {
        lead = await queryOne(`SELECT * FROM public.leads WHERE id = $1`, [ficha.lead_id]);
      } catch { lead = null; }
    }
    let bancos: any[] = [];
    try {
      const r = await query(`SELECT * FROM public.ficha_bancos WHERE ficha_id = $1 ORDER BY id`, [id]);
      bancos = r.rows;
    } catch { bancos = []; }

    const responsavel = ficha.vendedor_id ? await queryOne<{empresa_id:number|null;loja:string|null}>(
      `SELECT empresa_id, loja FROM public.vendedores WHERE id=$1`, [ficha.vendedor_id]) : null;
    // Contexto confiável para o superadmin gerar faturamento na empresa/loja corretas.
    return NextResponse.json({ ...ficha, lead, bancos,
      empresa_id: responsavel?.empresa_id || lead?.empresa_id || null,
      loja: responsavel?.loja || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao abrir ficha' }, { status: 500 });
  }
}

async function ensureFichaCols() {
  const cols = [
    ['pendente_documentacao', 'boolean DEFAULT false'],
    ['contrato_em_analise', 'boolean DEFAULT false'],
    ['pendente_assinatura', 'boolean DEFAULT false'],
    ['contrato_pago', 'boolean DEFAULT false'],
    ['contrato_recusado', 'boolean DEFAULT false'],
    ['valor_liberado', 'numeric'],
    ['entrada_paga', 'numeric'],
    ['valor_pendente', 'numeric'],
    ['observacao_elfenai', 'text'],
    ['etapa_obs', 'text'],
  ];
  for (const [c, typ] of cols) {
    try {
      await query(`ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS ${c} ${typ}`);
    } catch { /* ok */ }
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.editarFichasBanco(u)) return NextResponse.json({ error: 'Seu cargo não permite editar fichas bancárias' }, { status: 403 });
  const { id } = await params;
  const ficha = await queryOne<{ lead_id: number | null; vendedor_id: number | null }>(
    `SELECT lead_id, vendedor_id FROM public.fichas_credito WHERE id=$1`, [id]);
  if (!ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 });
  if (!(await fichaAcessivel(u, ficha))) return NextResponse.json({ error: 'Ficha fora da sua empresa ou loja' }, { status: 403 });
  const body = await req.json();
  try {
    // Conferir IDs de banco ANTES de alterar qualquer dado da ficha.
    if (Array.isArray(body.bancos)) {
      const existentes = await query(`SELECT id FROM public.ficha_bancos WHERE ficha_id=$1`, [id]);
      const idsPermitidos = new Set(existentes.rows.map((r: any) => Number(r.id)));
      if (body.bancos.some((b: any) => b.id && !idsPermitidos.has(Number(b.id))))
        return NextResponse.json({ error: 'Um dos bancos não pertence a esta ficha' }, { status: 403 });
    }
    await ensureFichaCols();
    const allowed = [
      'status_geral','banco_contratado','valor_liberado','valor_financiado','valor_entrada',
      'entrada_total','entrada_paga','valor_pendente','gerou_boleto','boleto_valor','boleto_meses',
      'boleto_total','valor_veiculo',
      'pendente_documentacao','contrato_em_analise','pendente_assinatura','contrato_pago','contrato_recusado',
    ];
    const sets: string[] = [];
    const params2: unknown[] = [];
    for (const k of allowed) {
      if (k in body) {
        params2.push(body[k]);
        sets.push(`${k} = $${params2.length}`);
      }
    }
    if (sets.length) {
      params2.push(id);
      await query(
        `UPDATE public.fichas_credito SET ${sets.join(', ')} WHERE id = $${params2.length}`,
        params2,
      );
    }
    if (body.status_geral) {
      const sg = String(body.status_geral).toLowerCase();
      const aprov = sg.startsWith('aprov');
      const neg = sg.startsWith('neg') || sg.startsWith('recus');
      if (aprov || neg) {
        await query(
          `UPDATE public.leads SET aprovado = $1
           WHERE id = (SELECT lead_id FROM public.fichas_credito WHERE id = $2)`,
          [aprov, id],
        );
      }
    }
    // recusado na análise do contrato → marca lead como não aprovado
    if (body.contrato_recusado === true) {
      await query(
        `UPDATE public.leads SET aprovado = FALSE
         WHERE id = (SELECT lead_id FROM public.fichas_credito WHERE id = $1)`,
        [id],
      );
    }
    if (Array.isArray(body.bancos)) {
      for (const b of body.bancos) {
        const st = String(b.status || 'pendente').toLowerCase();
        const ok = st.startsWith('aprov') ? 'aprovado' : (st.startsWith('neg') || st.startsWith('recus')) ? 'negado' : 'pendente';
        if (b.id) {
          await query(
            `UPDATE public.ficha_bancos
             SET banco = $1, status = $2, valor_financiado = $3, parcela_48 = $4, parcela_60 = $5,
                 valor_entrada = $6, observacao = $7
             WHERE id = $8 AND ficha_id = $9`,
            [b.banco, ok, b.valor_financiado || 0, b.parcela_48 || 0, b.parcela_60 || 0, b.valor_entrada || 0, b.observacao || null, b.id, Number(id)],
          );
        } else {
          await query(
            `INSERT INTO public.ficha_bancos (ficha_id, banco, status, valor_financiado, parcela_48, parcela_60, valor_entrada, observacao)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [Number(id), b.banco || '—', ok, b.valor_financiado || 0, b.parcela_48 || 0, b.parcela_60 || 0, b.valor_entrada || 0, b.observacao || null],
          );
        }
      }
    }

    // notifica vendedor se pediu documentação
    if (body.pendente_documentacao === true) {
      try {
        const info = await queryOne(
          `SELECT f.lead_id, l.vendedor_id, COALESCE(l.nome_completo, l.nome_lead) AS nome
           FROM public.fichas_credito f
           LEFT JOIN public.leads l ON l.id = f.lead_id
           WHERE f.id = $1`,
          [id],
        );
        if (info?.vendedor_id) {
          const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [info.vendedor_id]);
          if (vu?.id) {
            await query(
              `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
               VALUES ($1,'ficha',$2,$3)`,
              [vu.id, 'Pendente documentação', `Ficha de ${info.nome || '#'+id}: banco pediu documentos.`],
            );
          }
        }
      } catch { /* ok */ }
    }

    await notificar({
      titulo: 'Ficha atualizada',
      mensagem: `Ficha #${id} alterada por ${u.nome || u.login}`,
      tipo: 'ficha',
      tipos: ['elfenai', 'elfenaí', 'admin', 'gerente'],
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

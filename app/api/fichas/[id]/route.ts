import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/session';
import { notificar } from '@/lib/notify';

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

    return NextResponse.json({ ...ficha, lead, bancos });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao abrir ficha' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.editarFichasBanco(u)) return NextResponse.json({ error: 'sem permissao' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  try {
    const allowed = ['status_geral','banco_contratado','valor_liberado','valor_financiado','valor_entrada','entrada_total','entrada_paga','valor_pendente','gerou_boleto','boleto_valor','boleto_meses','boleto_total','valor_veiculo'];
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
    if (Array.isArray(body.bancos)) {
      for (const b of body.bancos) {
        const st = String(b.status || 'pendente').toLowerCase();
        const ok = st.startsWith('aprov') ? 'aprovado' : (st.startsWith('neg') || st.startsWith('recus')) ? 'negado' : 'pendente';
        if (b.id) {
          await query(
            `UPDATE public.ficha_bancos
             SET banco = $1, status = $2, valor_financiado = $3, parcela_48 = $4, parcela_60 = $5,
                 valor_entrada = $6, observacao = $7
             WHERE id = $8`,
            [b.banco, ok, b.valor_financiado || 0, b.parcela_48 || 0, b.parcela_60 || 0, b.valor_entrada || 0, b.observacao || null, b.id],
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

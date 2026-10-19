import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Rotaciona leads sem comentário interno após 10 minutos.
 * Pode ser chamado por cron ou ao abrir triagem/painel.
 *
 * REGRA: se comentario_interno preenchido → NÃO passa.
 */

const MINUTOS = 10;

async function nomeVendedor(id: number | null | undefined): Promise<string> {
  if (!id) return 'sem vendedor';
  const v = await queryOne(`SELECT nome FROM public.vendedores WHERE id = $1`, [id]);
  return v?.nome || `#${id}`;
}

export async function POST(req: NextRequest) {
  // secret opcional
  const secret = req.headers.get('x-manu-cron') || req.nextUrl.searchParams.get('token') || '';
  const expected = process.env.CRON_SECRET || process.env.ENTRADA_SECRET || '';
  if (expected && secret && secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { rows: leads } = await query(
      `SELECT id, vendedor_id
       FROM public.leads
       WHERE COALESCE(rotacionar, TRUE) = TRUE
         AND COALESCE(TRIM(comentario_interno), '') = ''
         AND COALESCE(atribuido_em, created_at, data_lead, now()) < now() - interval '${MINUTOS} minutes'
         AND COALESCE(venda_concluida, FALSE) = FALSE
       ORDER BY id
       LIMIT 50`,
    );

    let transferidos = 0;
    for (const lead of leads || []) {
      const deId = lead.vendedor_id ? Number(lead.vendedor_id) : null;
      const outro = await queryOne(
        `SELECT id FROM public.vendedores
         WHERE id <> COALESCE($1, 0)
           AND LOWER(COALESCE(nome,'')) <> 'matheus'
         ORDER BY random() LIMIT 1`,
        [deId || 0],
      );
      if (!outro?.id) continue;

      const deNome = await nomeVendedor(deId);
      const paraNome = await nomeVendedor(outro.id);
      const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const texto = `Transferido de ${deNome} para ${paraNome} · ${hora}`;

      await query(
        `UPDATE public.leads
         SET vendedor_id = $1, atribuido_em = now(), rotacionar = TRUE
         WHERE id = $2`,
        [outro.id, lead.id],
      );

      try {
        await query(
          `INSERT INTO public.lead_transferencias (lead_id, de_vendedor_id, para_vendedor_id, transferido_por, motivo)
           VALUES ($1,$2,$3,NULL,'auto')`,
          [lead.id, deId, outro.id],
        );
      } catch { /* ok */ }

      try {
        await query(
          `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
           VALUES (NULL, $1, $2)`,
          [texto, lead.id],
        );
      } catch { /* ok */ }

      try {
        const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [outro.id]);
        if (vu?.id) {
          await query(
            `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
             VALUES ($1,'lead','Lead transferido',$2)`,
            [vu.id, texto],
          );
        }
      } catch { /* ok */ }

      transferidos++;
    }

    return NextResponse.json({ ok: true, transferidos, checados: (leads || []).length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

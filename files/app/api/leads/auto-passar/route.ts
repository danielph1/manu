import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getPool } from '@/lib/db';
import { emHorarioDescanso } from '@/lib/horario-descanso';

export const runtime = 'nodejs';
const MINUTOS = 10;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Apenas cron autorizado, NUNCA GET publico. Rota multiplas empresas sem mistura. */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET || '';
  const provided = req.headers.get('x-manu-cron') || '';
  if (!expected || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }
  if (emHorarioDescanso()) {
    return NextResponse.json({ ok: true, transferidos: 0, pausado: true });
  }
  const client = await getPool().connect();
  let transferidos = 0;
  try {
    // Uma transacao por lead e FOR UPDATE SKIP LOCKED impede duplas atribuicoes.
    const result = await client.query<{ id: number }>(`
      SELECT l.id FROM public.leads l
      JOIN public.vendedores v ON v.id=l.vendedor_id
      WHERE v.empresa_id IS NOT NULL AND COALESCE(l.rotacionar, TRUE)=TRUE
        AND COALESCE(l.respondeu,FALSE)=FALSE
        AND COALESCE(TRIM(l.comentario_interno),'')=''
        AND COALESCE(l.venda_concluida,FALSE)=FALSE
        AND COALESCE(l.atribuido_em,l.created_at,l.data_lead::timestamp)
           < now() - interval '10 minutes'
      ORDER BY l.id LIMIT 50`);

    for (const lead of result.rows) {
      await client.query('BEGIN');
      try {
        const locked = await client.query<{ id: number; vendedor_id: number; empresa_id: number; loja: string | null }>(`
          SELECT l.id, l.vendedor_id, v.empresa_id, v.loja
          FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
          WHERE l.id=$1 AND v.empresa_id IS NOT NULL
            AND COALESCE(l.respondeu,FALSE)=FALSE
            AND COALESCE(l.rotacionar,TRUE)=TRUE
            AND COALESCE(TRIM(l.comentario_interno),'')=''
            AND COALESCE(l.atribuido_em,l.created_at,l.data_lead::timestamp)
              < now() - interval '10 minutes'
          FOR UPDATE OF l SKIP LOCKED`, [lead.id]);
        const atual = locked.rows[0];
        if (!atual) { await client.query('ROLLBACK'); continue; }
        const candidate = await client.query<{ id: number }>(`
          SELECT id FROM public.vendedores
          WHERE empresa_id=$1 AND COALESCE(ativo,TRUE)=TRUE AND id<>$2
          ORDER BY CASE WHEN UPPER(COALESCE(loja,''))=UPPER(COALESCE($3,'')) THEN 0 ELSE 1 END,
                   random() LIMIT 1`, [atual.empresa_id, atual.vendedor_id, atual.loja]);
        const to = candidate.rows[0]?.id;
        if (!to) { await client.query('ROLLBACK'); continue; }
        await client.query('UPDATE public.leads SET vendedor_id=$2, atribuido_em=now() WHERE id=$1', [atual.id, to]);
        await client.query(`INSERT INTO public.manu_atendimento_transferencias
          (empresa_id,lead_id,de_vendedor_id,para_vendedor_id,por_usuario_id,motivo)
          VALUES ($1,$2,$3,$4,NULL,'sem_resposta')`, [atual.empresa_id, atual.id, atual.vendedor_id, to]);
        await client.query('COMMIT');
        transferidos++;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
    return NextResponse.json({ ok: true, transferidos });
  } catch (error) {
    console.error('auto-passar', error instanceof Error ? error.message : 'erro');
    return NextResponse.json({ error: 'Falha na rotacao; confira a migration de atendimento' }, { status: 500 });
  } finally { client.release(); }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST autenticado por CRON_SECRET' }, { status: 405 });
}

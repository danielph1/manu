import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser, can } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 });
  if (!can.editarDocumental(u)) return NextResponse.json({ error: 'sem permissao' }, { status: 403 });

  const { ficha_id, processo_id, field, value } = await req.json();
  const allowed = ['gravame', 'reconheceu_firma', 'documento_pronto'];
  if (!allowed.includes(field)) return NextResponse.json({ error: 'campo invalido' }, { status: 400 });

  try {
    if (processo_id) {
      await query(`UPDATE public.processos_transferencia SET ${field} = $1, atualizado_por_id = $2 WHERE id = $3`, [value, u.id, processo_id]);
    } else {
      const existente = await query(`SELECT id FROM public.processos_transferencia WHERE ficha_id = $1 LIMIT 1`, [ficha_id]);
      if (existente.rows.length) {
        await query(`UPDATE public.processos_transferencia SET ${field} = $1, atualizado_por_id = $2 WHERE id = $3`, [value, u.id, existente.rows[0].id]);
      } else {
        await query(
          `INSERT INTO public.processos_transferencia (ficha_id, ${field}, atualizado_por_id, status) VALUES ($1,$2,$3,'em_andamento')`,
          [ficha_id, value, u.id],
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

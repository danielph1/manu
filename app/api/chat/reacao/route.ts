import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const b = await req.json();
  const mensagemId=Number(b?.mensagem_id);
  if (!Number.isSafeInteger(mensagemId)||mensagemId<=0||typeof b.emoji!=='string'||b.emoji.length>20)
    return NextResponse.json({error:'dados inválidos'},{status:400});
  const origem=await queryOne<{lead_id:number|null}>(
    'SELECT lead_id FROM public.chat_geral_mensagens WHERE id=$1',[mensagemId]);
  if (!origem?.lead_id || !await leadAcessivel(u,Number(origem.lead_id)))
    return NextResponse.json({error:'Conversa fora do seu escopo'},{status:403});
  try {
    const ja = await queryOne(
      `SELECT id FROM public.chat_geral_reacoes WHERE mensagem_id = $1 AND usuario_id = $2 AND emoji = $3`,
      [b.mensagem_id, u.id, b.emoji],
    );
    if (ja) {
      await query(`DELETE FROM public.chat_geral_reacoes WHERE id = $1`, [ja.id]);
    } else {
      await query(
        `INSERT INTO public.chat_geral_reacoes (mensagem_id, usuario_id, emoji) VALUES ($1,$2,$3)`,
        [b.mensagem_id, u.id, b.emoji],
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

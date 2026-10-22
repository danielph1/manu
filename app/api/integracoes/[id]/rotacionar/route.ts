import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { gestorIntegracoes } from '@/lib/integracoes/auth';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{id:string}> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({error:'sem permissão'}, {status:403});
    const {id} = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({error:'id inválido'}, {status:400});
    const token = gerarToken();
    const webhook_url = urlWebhook(id,token);
    const row = await queryOne<{id:string}>(
      `UPDATE public.manu_integracoes SET token_hash=$2, atualizado_em=now()
       WHERE id=$1 AND ($3::boolean OR empresa_id=$4) RETURNING id`,
      [id, hashToken(token), actor.tipo==='superadmin', actor.empresa_id],
    );
    if (!row) return NextResponse.json({error:'não encontrada'}, {status:404});
    return NextResponse.json({webhook_url,aviso:'A URL anterior parou de funcionar; atualize-a no portal.'},
      {headers:{'Cache-Control':'no-store'}});
  } catch (err) {
    console.error('rotacionar',err instanceof Error?err.message:'erro');
    return NextResponse.json({error:'não foi possível trocar o token'}, {status:500});
  }
}

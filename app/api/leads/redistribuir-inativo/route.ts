import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const LOTE = 80;
const ativo = `COALESCE(u.ativo,FALSE)=TRUE AND LOWER(COALESCE(u.status,'ativo'))='ativo'`;

/** Somente acao deliberada. Nao invocar no login, na desativacao ou no cron. */
export async function POST(req: NextRequest) {
  const actor=await requireUser(req);
  if (!actor) return NextResponse.json({error:'Não autenticado'},{status:401});
  const role=String(actor.tipo||'').toLowerCase();
  if (!['gerente','admin','superadmin'].includes(role))
    return NextResponse.json({error:'Somente gerente ou administração redistribui leads inativos'},{status:403});
  const body=await req.json().catch(()=>null);
  const origem=Number(body?.vendedor_id);
  if (!Number.isSafeInteger(origem)||origem<=0)
    return NextResponse.json({error:'Vendedor de origem inválido'},{status:400});
  const client=await getPool().connect();
  let transferidos=0, restantes=0, empresaId=0;
  try {
    await client.query('BEGIN');
    // Bloqueio por vendedor: dois gerentes nao podem redistribuir simultaneamente sua carteira.
    const {rows:[source]}=await client.query<{id:number;empresa_id:number;loja:string|null;ativo:boolean}>(
      `SELECT id,empresa_id,loja,COALESCE(ativo,TRUE) AS ativo FROM public.vendedores WHERE id=$1 FOR UPDATE`,[origem]);
    if (!source?.empresa_id || (role!=='superadmin' && Number(actor.empresa_id)!==Number(source.empresa_id)) ||
       (role==='gerente'&&(!actor.loja || String(actor.loja).toUpperCase()!==String(source.loja||'').toUpperCase()))) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Vendedor fora da sua empresa ou loja'},{status:403});
    }
    empresaId=Number(source.empresa_id);
    // Nao considerar um usuario ativo como inativo apenas por um campo incorreto no frontend.
    const activeLogin=await client.query(`SELECT 1 FROM public.usuarios u
       WHERE u.vendedor_id=$1 AND u.empresa_id=$2 AND LOWER(u.tipo)='vendedor' AND ${ativo} LIMIT 1`,[origem,empresaId]);
    if (source.ativo && activeLogin.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'O vendedor ainda está ativo. Esta ação é somente para inativos.'},{status:409});
    }
    // Gerente fica na loja. Admin/Superadmin podem redistribuir entre lojas da MESMA empresa.
    const mesmaLoja=role==='gerente';
    const candidatos=await client.query<{id:number}>(`SELECT v.id FROM public.vendedores v
      WHERE v.empresa_id=$1 AND v.id<>$2 AND COALESCE(v.ativo,FALSE)=TRUE
        AND ($3::boolean=FALSE OR UPPER(COALESCE(v.loja,''))=UPPER($4))
        AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.vendedor_id=v.id
          AND u.empresa_id=v.empresa_id AND LOWER(u.tipo)='vendedor' AND ${ativo})
      ORDER BY v.id`,[empresaId,origem,mesmaLoja,actor.loja||'']);
    if (!candidatos.rows.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({error:'Não há outro vendedor ativo e habilitado no escopo permitido.'},{status:422});
    }
    const leads=await client.query<{id:number}>(`SELECT l.id FROM public.leads l
      WHERE l.empresa_id=$1 AND l.vendedor_id=$2 AND COALESCE(l.venda_concluida,FALSE)=FALSE
      ORDER BY l.id LIMIT ${LOTE} FOR UPDATE OF l SKIP LOCKED`,[empresaId,origem]);
    for(const lead of leads.rows){
      const dest=candidatos.rows[randomInt(candidatos.rows.length)].id;
      // Comentarios internos ficam preservados, inclusive o bloqueio de rotacao.
      await client.query(`UPDATE public.leads SET vendedor_id=$1,atribuido_em=NOW(),
        rotacionar=CASE WHEN COALESCE(TRIM(comentario_interno),'')<>'' THEN FALSE ELSE rotacionar END
        WHERE id=$2 AND empresa_id=$3 AND vendedor_id=$4`,[dest,lead.id,empresaId,origem]);
      await client.query(`INSERT INTO public.manu_atendimento_transferencias
        (empresa_id,lead_id,de_vendedor_id,para_vendedor_id,por_usuario_id,motivo)
        VALUES($1,$2,$3,$4,$5,'redistribuicao_vendedor_inativo')`,
        [empresaId,lead.id,origem,dest,actor.id]);
      transferidos++;
    }
    const rest=await client.query<{total:string}>(`SELECT COUNT(*)::text AS total FROM public.leads
      WHERE empresa_id=$1 AND vendedor_id=$2 AND COALESCE(venda_concluida,FALSE)=FALSE`,[empresaId,origem]);
    restantes=Number(rest.rows[0]?.total||0);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});
    console.error('[redistribuir inativo]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Não foi possível redistribuir os leads. Confira vínculos e histórico de transferências.'},{status:500});
  }finally{client.release();}
  if (transferidos>0) await notificar({titulo:'Leads redistribuídos',
    mensagem:`${actor.nome||actor.login} redistribuiu ${transferidos} lead(s) do vendedor inativo #${origem}.`,
    tipo:'lead',tipos:['admin','gerente'],empresa_id:empresaId}).catch(()=>{});
  return NextResponse.json({ok:true,transferidos,restantes,lote_maximo:LOTE},{headers:{'Cache-Control':'no-store'}});
}

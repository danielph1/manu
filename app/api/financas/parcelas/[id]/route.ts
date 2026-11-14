import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {financeAuth,dateOnly,positive,money} from '@/lib/financas/finance';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const b=await req.json().catch(()=>null);
 const auth=await financeAuth(req,b?.empresa_id);if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id);
 if(!id||!['baixar','reabrir','cancelar'].includes(String(b?.acao)))return NextResponse.json({error:'Parcela ou ação inválida'},{status:400});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const r=await client.query<any>(`SELECT p.id,p.status,p.valor,a.origem FROM public.manu_fin_parcelas p
    JOIN public.manu_fin_agendamentos a ON a.id=p.agendamento_id AND a.empresa_id=p.empresa_id
    WHERE p.id=$1 AND p.empresa_id=$2 FOR UPDATE OF p`,[id,auth.empresaId]);
  const row=r.rows[0];
  if(!row){await client.query('ROLLBACK');return NextResponse.json({error:'Parcela fora da empresa'},{status:404});}
  const aurox=row.origem==='aurox';
  if(aurox && auth.actor.tipo!=='superadmin'){
   await client.query('ROLLBACK');return NextResponse.json({error:'Aurox: somente a plataforma confirma recebimento da mensalidade'},{status:403});
  }
  if(aurox && b?.valor!==undefined){await client.query('ROLLBACK');return NextResponse.json({error:'Não é permitido alterar o valor da Aurox'},{status:403});}
  if(aurox)await client.query(`SELECT set_config('aurox.finance_privileged','true',true)`);
  if(b.acao==='baixar'){
   const valor=b?.valor!==undefined?money(b.valor):Number(row.valor||0);
   if(!valor||valor<=0)throw Error('Defina o valor contratual antes da baixa');
   const date=dateOnly(b?.pago_em);
   await client.query(`UPDATE public.manu_fin_parcelas SET status='pago',valor=$1,pago_em=$2,atualizado_em=now()
    WHERE id=$3 AND empresa_id=$4`,[valor,date,id,auth.empresaId]);
  }else {
   if(aurox && b.acao==='cancelar')throw Error('Cobranças Aurox não podem ser canceladas');
   await client.query(`UPDATE public.manu_fin_parcelas SET status=$1,pago_em=NULL,atualizado_em=now()
     WHERE id=$2 AND empresa_id=$3`,[b.acao==='cancelar'?'cancelado':'pendente',id,auth.empresaId]);
  }
  await client.query('COMMIT');return NextResponse.json({ok:true});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});
  return NextResponse.json({error:e instanceof Error?e.message:'Falha ao baixar parcela'},{status:400});
 }finally{client.release();}
}

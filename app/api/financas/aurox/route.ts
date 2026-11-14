import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {positive,money,materializar,lojaDaEmpresa} from '@/lib/financas/finance';
export const runtime='nodejs';
/** A definicao inicial do contrato exige superadmin e NAO permite mudar precos existentes. */
export async function POST(req:NextRequest){
 const actor=await requireUser(req);
 if(!actor)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(actor.tipo!=='superadmin')return NextResponse.json({error:'Apenas plataforma Aurox'},{status:403});
 const b=await req.json().catch(()=>null);const empresaId=positive(b?.empresa_id);
 try{
  const valor=money(b?.valor);const loja=String(b?.loja||'').trim().toUpperCase();
  if(!empresaId||!await lojaDaEmpresa(empresaId,loja))return NextResponse.json({error:'Empresa ou loja inválida'},{status:400});
  await materializar(empresaId);
  const c=await getPool().connect();try{
   await c.query('BEGIN');
   await c.query(`SELECT set_config('aurox.finance_privileged','true',true)`);
   const r=await c.query(`UPDATE public.manu_fin_agendamentos SET valor=$1,loja=$2,atualizado_em=now()
      WHERE empresa_id=$3 AND origem='aurox' AND valor IS NULL RETURNING id`,[valor,loja,empresaId]);
   if(!r.rowCount){await c.query('ROLLBACK');return NextResponse.json({error:'Valor do contrato Aurox já foi definido. Não pode ser alterado por este fluxo.'},{status:409});}
   await c.query(`UPDATE public.manu_fin_parcelas SET valor=$1 WHERE agendamento_id=$2 AND status='pendente'`,[valor,r.rows[0].id]);
   await c.query('COMMIT');return NextResponse.json({ok:true});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao definir contrato'},{status:400});}
}

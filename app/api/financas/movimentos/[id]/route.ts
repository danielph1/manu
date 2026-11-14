import {NextRequest,NextResponse} from 'next/server';
import {queryOne,query} from '@/lib/db';
import {financeAuth,positive,dateOnly,money,lojaDaEmpresa} from '@/lib/financas/finance';
export const runtime='nodejs';
async function item(id:number,empresaId:number){return queryOne<any>(`SELECT * FROM public.manu_movimentos_caixa WHERE id=$1 AND empresa_id=$2`,[id,empresaId]);}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const b=await req.json().catch(()=>null),auth=await financeAuth(req,b?.empresa_id);
 if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id);const mov=await item(id,auth.empresaId);
 if(!mov)return NextResponse.json({error:'Movimento inexistente na empresa'},{status:404});
 if(mov.origem_tipo && !['faturamento_entrada','faturamento_financiamento'].includes(mov.origem_tipo))
  return NextResponse.json({error:'Edite a baixa na parcela ou oficina de origem'},{status:403});
 try{
  const v=money(b?.valor),dia=dateOnly(b?.data_movimento);
  const loja=String(b?.loja||mov.loja||'').trim().toUpperCase();
  if(!await lojaDaEmpresa(auth.empresaId,loja))throw Error('Loja inválida');
  const desc=mov.origem_tipo?mov.descricao:String(b?.descricao||mov.descricao||'').slice(0,900);
  const categoria=mov.origem_tipo?mov.categoria:String(b?.categoria||mov.categoria||'').slice(0,80);
  await query(`UPDATE public.manu_movimentos_caixa SET valor=$1,data_movimento=$2,loja=$3,
    descricao=$4,categoria=$5,status='confirmado' WHERE id=$6 AND empresa_id=$7`,
    [v,dia,loja,desc,categoria,id,auth.empresaId]);
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao atualizar'},{status:400});}
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await financeAuth(req,req.nextUrl.searchParams.get('empresa_id'));
 if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id);const mov=await item(id,auth.empresaId);
 if(!mov)return NextResponse.json({error:'Movimento não encontrado'},{status:404});
 if(mov.origem_tipo && !['faturamento_entrada','faturamento_financiamento'].includes(mov.origem_tipo))
  return NextResponse.json({error:'Reverta a parcela ou oficina no local de origem'},{status:403});
 await query(`UPDATE public.manu_movimentos_caixa SET status='cancelado' WHERE id=$1 AND empresa_id=$2`,[id,auth.empresaId]);
 return NextResponse.json({ok:true,mensagem:'Recebimento estornado, preservado para auditoria'});
}

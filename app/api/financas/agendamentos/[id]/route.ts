import {NextRequest,NextResponse} from 'next/server';
import {query,queryOne,getPool} from '@/lib/db';
import {financeAuth,materializar,positive,money,dateOnly,lojaDaEmpresa} from '@/lib/financas/finance';
export const runtime='nodejs';
async function getRow(id:number){return queryOne<any>(`SELECT * FROM public.manu_fin_agendamentos WHERE id=$1`,[id]);}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const b=await req.json().catch(()=>null);const auth=await financeAuth(req,b?.empresa_id);
 if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id),row=await getRow(id);
 if(!row||Number(row.empresa_id)!==auth.empresaId)return NextResponse.json({error:'Agendamento de outra empresa'},{status:404});
 if(row.origem==='aurox')return NextResponse.json({error:'Mensalidade Aurox não pode ser alterada'},{status:403});
 try{
  const updates:Record<string,unknown>={};
  if('descricao' in b)updates.descricao=String(b.descricao||'').trim().slice(0,500);
  if('categoria' in b)updates.categoria=String(b.categoria||'').trim().slice(0,80);
  if('tipo' in b){if(!['entrada','saida'].includes(b.tipo))throw Error('Tipo inválido');updates.tipo=b.tipo;}
  if('forma' in b){if(!['boleto','pix','cartao','dinheiro','transferencia','outro'].includes(b.forma))throw Error('Forma inválida');updates.forma=b.forma;}
  if('valor' in b)updates.valor=money(b.valor);
  if('lead_id' in b){
   const lead=positive(b.lead_id)||null;
   if(lead){const exists=await queryOne(`SELECT id FROM public.leads WHERE id=$1 AND empresa_id=$2`,[lead,auth.empresaId]);
    if(!exists)throw Error('Cliente não pertence a empresa');}
   updates.lead_id=lead;
  }
  if('inicio' in b)updates.inicio=dateOnly(b.inicio);
  if('frequencia' in b){if(!['unica','mensal'].includes(b.frequencia))throw Error('Frequência inválida');updates.frequencia=b.frequencia;}
  if('repeticoes' in b){const v=b.repeticoes===null||b.repeticoes===''?null:positive(b.repeticoes);if(v!==null&&(v<1||v>240))throw Error('Número de parcelas inválido');updates.repeticoes=v;}
  if('loja' in b){const loja=String(b.loja||'').trim().toUpperCase();if(!await lojaDaEmpresa(auth.empresaId,loja))throw Error('Loja inválida');updates.loja=loja;}
  if(!Object.keys(updates).length)return NextResponse.json({error:'Nada a alterar'},{status:400});
  if(updates.descricao===''||updates.categoria==='')throw Error('Descrição/categoria obrigatórias');
  const finalTipo=String(updates.tipo??row.tipo),finalForma=String(updates.forma??row.forma);
  const finalLead=positive(updates.lead_id??row.lead_id);
  if(finalTipo==='entrada'&&finalForma==='boleto'){
    if(!finalLead)throw Error('Recebimento via boleto exige cliente selecionado');
    const boleto=await queryOne(`SELECT id FROM (
      SELECT f.id FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
      WHERE f.empresa_id=$1 AND COALESCE(f.lead_id,fc.lead_id)=$2 AND COALESCE(f.entrada_boleto,0)>0
      UNION ALL SELECT fc.id FROM public.fichas_credito fc JOIN public.leads l ON l.id=fc.lead_id
      WHERE l.empresa_id=$1 AND l.id=$2 AND (COALESCE(fc.gerou_boleto,FALSE) OR COALESCE(fc.boleto_total,0)>0)
     ) x LIMIT 1`,[auth.empresaId,finalLead]);
    if(!boleto)throw Error('Cliente sem boleto cadastrado');
  }
  const c=await getPool().connect();
  try{
   await c.query('BEGIN');
   const locked=await c.query(`SELECT id,origem FROM public.manu_fin_agendamentos WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,[id,auth.empresaId]);
   if(!locked.rowCount||locked.rows[0].origem!=='manual')throw Error('Operação não autorizada');
   const keys=Object.keys(updates),vals=Object.values(updates);
   await c.query(`UPDATE public.manu_fin_agendamentos SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},atualizado_em=now()
      WHERE id=$${keys.length+1} AND empresa_id=$${keys.length+2}`,[...vals,id,auth.empresaId]);
   // Regera SOMENTE contas ainda nao quitadas; preserva o historico das pagas.
   await c.query(`DELETE FROM public.manu_fin_parcelas WHERE agendamento_id=$1 AND status='pendente'`,[id]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  await materializar(auth.empresaId);
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro ao editar'},{status:400});}
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await financeAuth(req,req.nextUrl.searchParams.get('empresa_id'));if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id),row=await getRow(id);
 if(!row||Number(row.empresa_id)!==auth.empresaId)return NextResponse.json({error:'Registro não encontrado'},{status:404});
 if(row.origem==='aurox')return NextResponse.json({error:'Mensalidade Aurox não pode ser excluída'},{status:403});
 try{const c=await getPool().connect();try{
  await c.query('BEGIN');
  await c.query(`UPDATE public.manu_fin_agendamentos SET ativo=FALSE,atualizado_em=now() WHERE id=$1 AND empresa_id=$2 AND origem='manual'`,[id,auth.empresaId]);
  await c.query(`UPDATE public.manu_fin_parcelas SET status='cancelado',atualizado_em=now()
     WHERE agendamento_id=$1 AND empresa_id=$2 AND status='pendente'`,[id,auth.empresaId]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 return NextResponse.json({ok:true,mensagem:'Contas futuras canceladas. Pagamentos passados preservados na contabilidade.'});
 }catch{return NextResponse.json({error:'Falha ao cancelar'},{status:500});}
}

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { auditarAlteracao } from '@/lib/auditoria';
import { notificar } from '@/lib/notify';

export const runtime='nodejs';
const PERMITIDOS=new Set(['superadmin','admin','gerente','marketing','documentista','documento']);
const positive=(x:unknown)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0};

/** Liberação pelo ID do faturamento. Estoque e Transferências mudam na mesma transação. */
export async function POST(req:NextRequest){
 const u=await requireUser(req);
 if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!PERMITIDOS.has(String(u.tipo).toLowerCase()))return NextResponse.json({error:'Sem permissão para liberar faturamento'},{status:403});
 const b=await req.json().catch(()=>null);
 const id=positive(b?.id);
 const empresaId=u.tipo==='superadmin'?positive(b?.empresa_id):positive(u.empresa_id);
 if(!id||!empresaId)return NextResponse.json({error:'Selecione o faturamento e sua empresa'},{status:400});
 const db=await getPool().connect();
 let processoId=0;
 try{
  await db.query('BEGIN');
  const r=await db.query<Record<string,any>>(`SELECT * FROM public.faturamentos WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,[id,empresaId]);
  const fat=r.rows[0];
  if(!fat || (u.tipo==='gerente'&&(!u.loja||String(fat.loja||'').toUpperCase()!==String(u.loja).toUpperCase()))){
   await db.query('ROLLBACK');return NextResponse.json({error:'Faturamento fora da empresa ou loja'},{status:403});
  }
  const placa=String(fat.placa||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(!/^[A-Z0-9]{7}$/.test(placa)){
   await db.query('ROLLBACK');return NextResponse.json({error:'Informe a placa válida no documento antes de liberar'},{status:422});
  }
  let p=await db.query<{id:number}>(`SELECT id FROM public.processos_transferencia WHERE empresa_id=$1 AND faturamento_id=$2 LIMIT 1 FOR UPDATE`,[empresaId,id]);
  if(!p.rows.length){
   const ficha=positive(fat.ficha_id),lead=positive(fat.lead_id);
   // Adapta registros legados que foram gerados da mesma ficha ou lead; não relaciona por placa isolada.
   if(ficha||lead)p=await db.query<{id:number}>(`SELECT id FROM public.processos_transferencia
     WHERE empresa_id=$1 AND faturamento_id IS NULL
       AND (($2::bigint>0 AND ficha_id=$2) OR ($3::bigint>0 AND lead_id=$3))
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,[empresaId,ficha,lead]);
  }
  if(p.rows.length){
   processoId=Number(p.rows[0].id);
   await db.query(`UPDATE public.processos_transferencia
     SET faturamento_id=$1,placa=$2,nome_lead=COALESCE(NULLIF(nome_lead,''),$3),
      marca=COALESCE(NULLIF(marca,''),$4),modelo=COALESCE(NULLIF(modelo,''),$5),
      ano=COALESCE(NULLIF(ano,''),$6),cor=COALESCE(NULLIF(cor,''),$7),updated_at=now()
     WHERE id=$8 AND empresa_id=$9`,[id,placa,fat.nome||'',fat.marca||'',fat.modelo||'',fat.ano_modelo||'',fat.cor||'',processoId,empresaId]);
  }else{
   const novo=await db.query<{id:number}>(`INSERT INTO public.processos_transferencia
      (empresa_id,faturamento_id,ficha_id,lead_id,placa,nome_lead,marca,modelo,ano,cor,status,observacao)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'em_andamento','Liberado pelo faturamento') RETURNING id`,
     [empresaId,id,positive(fat.ficha_id)||null,positive(fat.lead_id)||null,placa,fat.nome||'',fat.marca||'',fat.modelo||'',fat.ano_modelo||'',fat.cor||'']);
   processoId=Number(novo.rows[0].id);
  }
  await db.query(`UPDATE public.faturamentos SET liberado=TRUE,status='liberado' WHERE id=$1 AND empresa_id=$2`,[id,empresaId]);
  // Baixa o veículo somente no estoque da MESMA empresa. Não remove histórico nem cancela a publicação externa.
  await db.query(`UPDATE public.estoque_carros SET status_estoque='inativo',anunciado=FALSE,anunciado_em=NULL
    WHERE empresa_id=$1 AND REGEXP_REPLACE(UPPER(COALESCE(placa,'')),'[^A-Z0-9]','','g')=$2`,[empresaId,placa]);
  if(positive(fat.lead_id))await db.query(`UPDATE public.leads SET venda_concluida=TRUE,
      data_venda=COALESCE(data_venda,now()) WHERE id=$1 AND empresa_id=$2`,[positive(fat.lead_id),empresaId]);
  if(positive(fat.ficha_id))await db.query(`UPDATE public.fichas_credito f SET comprou=TRUE
    WHERE f.id=$1 AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=f.lead_id AND l.empresa_id=$2)`,[positive(fat.ficha_id),empresaId]);
  await auditarAlteracao(db,{usuario:u,empresaId,recurso:'faturamento',recursoId:id,acao:'alterar',resumo:'Veículo liberado para Transferências',campos:['status']});
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[liberar transferência]',e instanceof Error?e.message:'erro');
   return NextResponse.json({error:'Não foi possível liberar o veículo. Confira migration e vínculos da empresa.'},{status:503});
 }finally{db.release();}
 await notificar({titulo:'Transferência iniciada',mensagem:'Um veículo foi liberado para a etapa documental.',tipo:'venda',empresa_id:empresaId,broadcast:true}).catch(()=>{});
 return NextResponse.json({ok:true,processo_id:processoId,
  mensagem:'Liberado para Transferências. Confira os anúncios externos: o Aurox ainda não os retira dos portais automaticamente.'},
  {headers:{'Cache-Control':'no-store'}});
}

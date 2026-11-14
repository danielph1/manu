import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {financeAuth,dateOnly,positive,money} from '@/lib/financas/finance';
export const runtime='nodejs';
/** Baixas parciais sao eventos financeiros; nunca substituem o valor original da parcela. */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const b=await req.json().catch(()=>null),auth=await financeAuth(req,b?.empresa_id);
 if(auth instanceof NextResponse)return auth;
 const id=positive((await params).id),acao=String(b?.acao||'');
 if(!id||!['receber','baixar','negociar','vencimento','estornar_pagamento','reabrir','cancelar'].includes(acao))
   return NextResponse.json({error:'Parcela ou ação inválida'},{status:400});
 const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const r=await db.query<any>(`SELECT p.id,p.valor,p.desconto,p.status,p.vencimento,a.origem
     FROM public.manu_fin_parcelas p JOIN public.manu_fin_agendamentos a
       ON a.id=p.agendamento_id AND a.empresa_id=p.empresa_id
     WHERE p.id=$1 AND p.empresa_id=$2 FOR UPDATE OF p`,[id,auth.empresaId]);
  const p=r.rows[0];
  if(!p){await db.query('ROLLBACK');return NextResponse.json({error:'Parcela fora da empresa'},{status:404});}
  const aurox=p.origem==='aurox';
  if(aurox && auth.actor.tipo!=='superadmin'){
    await db.query('ROLLBACK');return NextResponse.json({error:'Somente a plataforma pode quitar a mensalidade Aurox'},{status:403});
  }
  if(aurox && !['receber','baixar'].includes(acao))throw Error('Mensalidade Aurox não pode ser negociada, editada ou excluída');
  if(aurox && b?.desconto!==undefined)throw Error('Descontos Aurox são proibidos');
  if(aurox)await db.query(`SELECT set_config('aurox.finance_privileged','true',true)`);
  const total=(await db.query<{total:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS total
     FROM public.manu_fin_pagamentos_parcela WHERE parcela_id=$1 AND empresa_id=$2 AND estornado_em IS NULL`,[id,auth.empresaId])).rows[0];
  const ja=Number(total?.total||0);
  if(acao==='receber'||acao==='baixar'){
    if(p.status==='cancelado')throw Error('Parcela cancelada');
    if(p.valor==null)throw Error('Parcela ainda sem valor contratado');
    const descontoNovo=b?.desconto===undefined?Number(p.desconto||0):Number(b.desconto);
    if(!Number.isFinite(descontoNovo)||descontoNovo<0||descontoNovo>=Number(p.valor)||ja>Number(p.valor)-descontoNovo+0.009)
      throw Error('Desconto não permitido para este saldo');
    if(descontoNovo!==Number(p.desconto||0)){
      const motivo=String(b?.observacao||'').trim();
      if(descontoNovo>0&&motivo.length<3)throw Error('Descreva o motivo do acordo');
      await db.query(`UPDATE public.manu_fin_parcelas SET desconto=$1,motivo_desconto=$2,negociado_em=now(),atualizado_em=now()
        WHERE id=$3 AND empresa_id=$4`,[descontoNovo,motivo.slice(0,500),id,auth.empresaId]);
    }
    const devido=Number(p.valor)-descontoNovo-ja;
    const valor=b?.valor===undefined?devido:money(b.valor);
    if(!(Number(valor)>0)||Number(valor)>devido+0.009)throw Error(`Pagamento maior que o saldo devido: R$ ${Math.max(0,devido).toFixed(2)}`);
    const dia=dateOnly(b?.pago_em||b?.data_movimento);
    await db.query(`INSERT INTO public.manu_fin_pagamentos_parcela
      (parcela_id,empresa_id,valor,pago_em,observacao,criado_por) VALUES($1,$2,$3,$4,$5,$6)`,
      [id,auth.empresaId,valor,dia,String(b?.observacao||'').slice(0,500),auth.actor.id]);
  }else if(acao==='negociar'){
    if(p.status==='cancelado'||p.valor==null)throw Error('Parcela indisponível para negociação');
    const desconto=Number(b?.desconto);
    if(!Number.isFinite(desconto)||desconto<0||desconto>=Number(p.valor))throw Error('Desconto inválido');
    if(ja>Number(p.valor)-desconto+0.009)throw Error('Desconto ultrapassa o saldo ainda não recebido');
    const motivo=String(b?.observacao||'').trim();
    if(desconto>0&&motivo.length<3)throw Error('Descreva o motivo do desconto negociado');
    await db.query(`UPDATE public.manu_fin_parcelas SET desconto=$1,motivo_desconto=$2,negociado_em=now(),atualizado_em=now()
      WHERE id=$3 AND empresa_id=$4`,[desconto,motivo.slice(0,500),id,auth.empresaId]);
    await db.query('SELECT public.manu_fin_parcela_atualizar_status($1)',[id]);
  }else if(acao==='vencimento'){
    if(p.status==='cancelado')throw Error('Parcela cancelada');
    const dia=dateOnly(b?.vencimento);
    await db.query(`UPDATE public.manu_fin_parcelas SET vencimento=$1,atualizado_em=now()
       WHERE id=$2 AND empresa_id=$3`,[dia,id,auth.empresaId]);
  }else if(acao==='estornar_pagamento'){
    const pg=positive(b?.pagamento_id);if(!pg)throw Error('Pagamento inválido');
    const r=await db.query(`UPDATE public.manu_fin_pagamentos_parcela SET estornado_em=now(),estornado_por=$4
       WHERE id=$1 AND parcela_id=$2 AND empresa_id=$3 AND estornado_em IS NULL RETURNING id`,[pg,id,auth.empresaId,auth.actor.id]);
    if(!r.rowCount)throw Error('Pagamento já estornado ou fora da parcela');
  }else if(acao==='reabrir'){
    if(p.status!=='cancelado')throw Error('Somente parcelas canceladas podem ser reabertas');
    await db.query(`UPDATE public.manu_fin_parcelas SET status='pendente' WHERE id=$1 AND empresa_id=$2`,[id,auth.empresaId]);
    await db.query('SELECT public.manu_fin_parcela_atualizar_status($1)',[id]);
  }else{
    if(ja>0)throw Error('Estorne os pagamentos antes de cancelar esta parcela');
    await db.query(`UPDATE public.manu_fin_parcelas SET status='cancelado',atualizado_em=now()
      WHERE id=$1 AND empresa_id=$2`,[id,auth.empresaId]);
  }
  await db.query('COMMIT');return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});
   return NextResponse.json({error:e instanceof Error?e.message:'Falha na baixa'},{status:400});}
 finally{db.release();}
}

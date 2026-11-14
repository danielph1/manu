import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {financeAuth,money,dateOnly,positive} from '@/lib/financas/finance';
export const runtime='nodejs';
const COMPONENTES=['entrada','boleto','financiamento'] as const;
export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null);
 const auth=await financeAuth(req,b?.empresa_id);if(auth instanceof NextResponse)return auth;
 const id=positive(b?.faturamento_id),componente=String(b?.componente||'');
 const acao=String(b?.acao||'receber');
 if(!id||!COMPONENTES.includes(componente as any)||!['receber','negociar','valor_financiado','estornar'].includes(acao))
   return NextResponse.json({error:'Documento, componente ou ação inválida'},{status:400});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const r=await client.query<any>(`SELECT f.id,f.empresa_id,f.loja,f.entrada_total,f.entrada_boleto,f.placa,
       l.id AS lead_id,l.venda_concluida,l.data_venda,
       COALESCE(NULLIF(fc.valor_liberado,0),NULLIF(fc.valor_financiado,0)) AS financiado
    FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
    JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
    WHERE f.id=$1 AND f.empresa_id=$2 AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')
      AND (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL)
    FOR UPDATE OF l`,[id,auth.empresaId]);
  const f=r.rows[0];if(!f){await client.query('ROLLBACK');return NextResponse.json({error:'Fatura sem venda confirmada na mesma empresa'},{status:404});}
  // O calculo do faturamento distingue boleto da entrada. Somar os dois evita duplicidade.
  const origem=componente==='entrada'?Math.max(0,Number(f.entrada_total||0)-Number(f.entrada_boleto||0)):
    componente==='boleto'?Math.max(0,Number(f.entrada_boleto||0)):
    f.financiado==null?null:Number(f.financiado);
  const ajuste=await client.query<{valor_informado:number|null;desconto:number}>(`
    SELECT valor_informado,desconto FROM public.manu_fin_venda_ajustes
    WHERE empresa_id=$1 AND lead_id=$2 AND componente=$3`,[auth.empresaId,f.lead_id,componente]);
  const esperado=ajuste.rows[0]?.valor_informado==null?origem:Number(ajuste.rows[0].valor_informado);
  const descontoAtual=Number(ajuste.rows[0]?.desconto||0);
  if(acao==='valor_financiado'){
   if(componente!=='financiamento')throw Error('Só é permitido informar o valor liberado do financiamento');
   const valor=money(b?.valor);const obs=String(b?.observacao||'').trim();
   if(!obs||obs.length<5)throw Error('Informe a origem/comprovante do valor liberado (banco, contrato etc.)');
   const total=(await client.query<{valor:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS valor FROM public.manu_fin_pagamentos_venda
     WHERE empresa_id=$1 AND lead_id=$2 AND componente='financiamento' AND estornado_em IS NULL`,[auth.empresaId,f.lead_id])).rows[0];
   if(Number(total?.valor||0)>Number(valor)-descontoAtual+0.009)throw Error('Valor inferior ao já recebido e ao desconto');
   await client.query(`INSERT INTO public.manu_fin_venda_ajustes
      (empresa_id,lead_id,componente,valor_informado,motivo_desconto,atualizado_por)
      VALUES ($1,$2,'financiamento',$3,$4,$5)
      ON CONFLICT(empresa_id,lead_id,componente) DO UPDATE SET valor_informado=EXCLUDED.valor_informado,
      motivo_desconto=EXCLUDED.motivo_desconto,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now()`,
      [auth.empresaId,f.lead_id,valor,`Fonte do valor liberado: ${obs.slice(0,450)}`,auth.actor.id]);
  }else if(acao==='negociar'){
   if(esperado==null||esperado<=0)throw Error('Informe primeiro o valor documentado');
   const desconto=b?.desconto==null?0:Number(b.desconto);
   if(!Number.isFinite(desconto)||desconto<0||desconto>=esperado)throw Error('Desconto deve ser menor que a dívida original');
   const motivo=String(b?.observacao||'').trim();
   if(desconto>0&&motivo.length<3)throw Error('Descreva o acordo para conceder desconto');
   const r=await client.query<{valor:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS valor FROM public.manu_fin_pagamentos_venda
     WHERE empresa_id=$1 AND lead_id=$2 AND componente=$3 AND estornado_em IS NULL`,[auth.empresaId,f.lead_id,componente]);
   if(Number(r.rows[0]?.valor||0)>esperado-desconto+0.009)throw Error('Desconto ultrapassa o saldo ainda não recebido');
   await client.query(`INSERT INTO public.manu_fin_venda_ajustes(empresa_id,lead_id,componente,desconto,motivo_desconto,atualizado_por)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(empresa_id,lead_id,componente)
     DO UPDATE SET desconto=EXCLUDED.desconto,motivo_desconto=EXCLUDED.motivo_desconto,
       atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now()`,
     [auth.empresaId,f.lead_id,componente,desconto,motivo.slice(0,450),auth.actor.id]);
  }else if(acao==='receber'){
   if(esperado==null||esperado<=0)throw Error('Financiamento ainda sem valor liberado. Registre o valor antes de receber');
   const valor=money(b?.valor),dia=dateOnly(b?.data_movimento);
   const descontoNovo=b?.desconto===undefined?descontoAtual:Number(b.desconto);
   if(!Number.isFinite(descontoNovo)||descontoNovo<0||descontoNovo>=esperado)throw Error('Desconto inválido');
   const motivo=String(b?.observacao||'').trim();
   if(descontoNovo!==descontoAtual){
    if(descontoNovo>0&&motivo.length<3)throw Error('Informe o motivo do desconto negociado');
    await client.query(`INSERT INTO public.manu_fin_venda_ajustes(empresa_id,lead_id,componente,desconto,motivo_desconto,atualizado_por)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(empresa_id,lead_id,componente)
      DO UPDATE SET desconto=EXCLUDED.desconto,motivo_desconto=EXCLUDED.motivo_desconto,
       atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now()`,
      [auth.empresaId,f.lead_id,componente,descontoNovo,motivo.slice(0,450),auth.actor.id]);
   }
   const parcelas=(await client.query<{valor:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS valor FROM public.manu_fin_pagamentos_venda
      WHERE empresa_id=$1 AND lead_id=$2 AND componente=$3 AND estornado_em IS NULL`,[auth.empresaId,f.lead_id,componente])).rows[0];
   const antigo=(await client.query<{valor:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS valor FROM public.manu_movimentos_caixa
      WHERE empresa_id=$1 AND origem_tipo=$2 AND origem_id=$3 AND status='confirmado'`,
      [auth.empresaId,`faturamento_${componente}`,`lead:${f.lead_id}`])).rows[0];
   const ja=Number(parcelas?.valor||0)+Number(antigo?.valor||0);
   if(ja+Number(valor)>esperado-descontoNovo+0.009)throw Error(`Recebimento ultrapassa saldo: R$ ${Math.max(0,esperado-descontoNovo-ja).toFixed(2)}`);
   await client.query(`INSERT INTO public.manu_fin_pagamentos_venda
     (empresa_id,lead_id,faturamento_id,componente,valor,pago_em,observacao,criado_por)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[auth.empresaId,f.lead_id,id,componente,valor,dia,String(b?.observacao||'').slice(0,500),auth.actor.id]);
  }else{
   const pagamentoId=positive(b?.pagamento_id);
   if(!pagamentoId)throw Error('Pagamento inválido');
   const st=await client.query(`UPDATE public.manu_fin_pagamentos_venda
      SET estornado_em=now(),estornado_por=$5 WHERE id=$1 AND empresa_id=$2 AND lead_id=$3 AND componente=$4
       AND estornado_em IS NULL RETURNING id`,[pagamentoId,auth.empresaId,f.lead_id,componente,auth.actor.id]);
   if(!st.rowCount)throw Error('Pagamento não encontrado ou já estornado');
  }
  await client.query('COMMIT');return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});
   return NextResponse.json({error:e instanceof Error?e.message:'Falha ao alterar recebimento'},{status:400});}
 finally{client.release();}
}

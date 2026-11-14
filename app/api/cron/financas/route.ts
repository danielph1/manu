import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {getPool,query} from '@/lib/db';
import {materializar} from '@/lib/financas/finance';
import {notificar} from '@/lib/notify';
export const runtime='nodejs';export const dynamic='force-dynamic';
function auth(req:NextRequest){
 const secret=process.env.CRON_SECRET||'';
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
 return secret.length>0&&secret.length===token.length&&timingSafeEqual(Buffer.from(secret),Buffer.from(token));
}
/** Executar uma vez por dia na Vercel, com CRON_SECRET configurado.
 * Alertas idempotentes: uma notificacao para 3 dias antes, vencimento e atraso. */
export async function GET(req:NextRequest){
 if(!auth(req))return NextResponse.json({error:'Não autorizado'},{status:401});
 try{
  await materializar();
  const client=await getPool().connect();
  let alertas:any[]=[];
  try{
   await client.query('BEGIN');
   // Apenas as parcelas com valor ja configurado sao cobrancas validas para cliente.
   const result=await client.query(`INSERT INTO public.manu_fin_alertas(empresa_id,parcela_id,classe)
     SELECT p.empresa_id,p.id,
       CASE WHEN p.vencimento = (timezone('America/Sao_Paulo',now())::date + 3) THEN 'antes'
         WHEN p.vencimento = timezone('America/Sao_Paulo',now())::date THEN 'vence_hoje'
         ELSE 'atraso' END
     FROM public.manu_fin_parcelas p JOIN public.manu_fin_agendamentos a
       ON a.id=p.agendamento_id AND a.empresa_id=p.empresa_id
     WHERE a.ativo AND p.status='pendente' AND p.valor IS NOT NULL
      AND p.vencimento IN (
        (timezone('America/Sao_Paulo',now())::date + 3),timezone('America/Sao_Paulo',now())::date,
        (timezone('America/Sao_Paulo',now())::date - 1))
     ON CONFLICT (parcela_id,classe) DO NOTHING RETURNING parcela_id,empresa_id,classe`);
   alertas=result.rows;
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  let enviados=0;
  for(const a of alertas){
   const dados=(await query<any>(`SELECT p.vencimento,p.valor,a.descricao,a.origem
      FROM public.manu_fin_parcelas p JOIN public.manu_fin_agendamentos a ON a.id=p.agendamento_id
      WHERE p.id=$1 AND p.empresa_id=$2`,[a.parcela_id,a.empresa_id])).rows[0];
   if(!dados)continue;
   const admins=(await query<{id:number}>(`SELECT id FROM public.usuarios WHERE tipo='admin' AND empresa_id=$1
     AND COALESCE(ativo,TRUE)=TRUE`,[a.empresa_id])).rows.map(x=>x.id);
   const supers=(await query<{id:number}>(`SELECT id FROM public.usuarios WHERE tipo='superadmin'
     AND COALESCE(ativo,TRUE)=TRUE`)).rows.map(x=>x.id);
   const usuarios=dados.origem==='aurox'?[...admins,...supers]:admins;
   if(!usuarios.length)continue;
   await notificar({titulo:a.classe==='antes'?'Conta vence em 3 dias':a.classe==='vence_hoje'?'Vencimento hoje':'Conta vencida',
     mensagem:`${dados.descricao} · R$ ${Number(dados.valor).toFixed(2)} · ${String(dados.vencimento).slice(0,10)}`,
     tipo:'financeiro',empresa_id:a.empresa_id,usuario_ids:usuarios,url:'/financas'});
   enviados++;
  }
  // V3: lembretes de parcelas de vendas, separados do financeiro genérico.
  // A previsão nunca movimenta caixa; apenas a baixa de venda faz isso.
  const promessasAtraso=(await query<{promessa_id:number;empresa_id:number;classe:string}>(`
    INSERT INTO public.manu_fin_promessa_alertas(empresa_id,promessa_id,classe)
    SELECT p.empresa_id,p.id,
      CASE WHEN p.vencimento=timezone('America/Sao_Paulo',now())::date+3 THEN 'antes'
           WHEN p.vencimento=timezone('America/Sao_Paulo',now())::date THEN 'vence_hoje'
           ELSE 'atraso' END
    FROM public.manu_fin_venda_promessas p
    WHERE p.ativo AND p.vencimento IN (
      timezone('America/Sao_Paulo',now())::date+3,
      timezone('America/Sao_Paulo',now())::date,
      timezone('America/Sao_Paulo',now())::date-1)
      AND p.valor > COALESCE((SELECT SUM(pg.valor) FROM public.manu_fin_pagamentos_venda pg
         WHERE pg.promessa_id=p.id AND pg.empresa_id=p.empresa_id AND pg.estornado_em IS NULL),0)
    ON CONFLICT(promessa_id,classe) DO NOTHING
    RETURNING promessa_id,empresa_id,classe`)).rows;
  for(const p of promessasAtraso){
   const detalhe=(await query<any>(`SELECT pr.vencimento,pr.valor,pr.componente,
      l.nome_lead AS cliente,
      COALESCE((SELECT SUM(pg.valor) FROM public.manu_fin_pagamentos_venda pg
        WHERE pg.promessa_id=pr.id AND pg.empresa_id=pr.empresa_id AND pg.estornado_em IS NULL),0)::numeric AS recebido
      FROM public.manu_fin_venda_promessas pr JOIN public.leads l
        ON l.id=pr.lead_id AND l.empresa_id=pr.empresa_id
      WHERE pr.id=$1 AND pr.empresa_id=$2`,[p.promessa_id,p.empresa_id])).rows[0];
   if(!detalhe)continue;
   const pendente=Math.max(0,Number(detalhe.valor)-Number(detalhe.recebido));
   if(pendente<0.01)continue;
   const usuarios=(await query<{id:number}>(`SELECT id FROM public.usuarios
     WHERE COALESCE(ativo,TRUE)=TRUE AND
       ((tipo='admin' AND empresa_id=$1) OR tipo='superadmin')`,[p.empresa_id])).rows.map(x=>x.id);
   if(!usuarios.length)continue;
   await notificar({titulo:p.classe==='antes'?'Recebimento combinado vence em 3 dias':
     p.classe==='vence_hoje'?'Recebimento combinado para hoje':'Recebimento combinado vencido',
     mensagem:`${detalhe.cliente} · ${detalhe.componente} · R$ ${pendente.toFixed(2)} · ${String(detalhe.vencimento).slice(0,10)}`,
     tipo:'financeiro',empresa_id:p.empresa_id,usuario_ids:usuarios,url:'/financas'});
  }
  return NextResponse.json({ok:true,alertas_novos:alertas.length,envios_solicitados:enviados},
     {headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[financas cron]',e instanceof Error?e.message:'erro');
   return NextResponse.json({error:'Não foi possível gerar vencimentos e notificações'},{status:503});}
}

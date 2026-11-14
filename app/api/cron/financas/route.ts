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
  return NextResponse.json({ok:true,alertas_novos:alertas.length,envios_solicitados:enviados},
     {headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[financas cron]',e instanceof Error?e.message:'erro');
   return NextResponse.json({error:'Não foi possível gerar vencimentos e notificações'},{status:503});}
}

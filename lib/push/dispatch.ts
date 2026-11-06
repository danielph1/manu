import { query } from '@/lib/db';

// Chamado via cron HTTPS autenticado ou pelo worker agendador. Idempotência via
// reclamação transacional SKIP LOCKED. Never sends tokens or personal data to logs.
export async function dispatchAuroxPush(limit = 30) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject?.startsWith('mailto:')) throw new Error('Configure VAPID_PUBLIC/PRIVATE e VAPID_SUBJECT na Vercel.');
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(subject, pub, priv);
  const { rows: jobs } = await query<{
    id: number; usuario_id: number; titulo: string; mensagem: string; tipo: string; destino: string;
  }>(`WITH lote AS (
        SELECT o.id FROM public.aurox_push_outbox o
        WHERE (o.estado='pendente' AND o.proxima_tentativa<=now())
           OR (o.estado='processando' AND o.bloqueado_em<now()-interval '3 minutes')
        ORDER BY o.id LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      UPDATE public.aurox_push_outbox o SET estado='processando', bloqueado_em=now(),tentativas=tentativas+1
        FROM lote WHERE o.id=lote.id
      RETURNING o.id,o.usuario_id,o.titulo,o.mensagem,o.tipo,o.destino`, [Math.max(1,Math.min(limit,100))]);
  let entregues=0, ignorados=0, reprocessar=0;
  for (const job of jobs) {
    try {
      const { rows: userRows } = await query<{ativo:boolean;preferencias_notif:Record<string,boolean>|null}>(
        `SELECT COALESCE(u.ativo,true) AS ativo,u.preferencias_notif
           FROM public.usuarios u LEFT JOIN public.empresas e ON e.id=u.empresa_id
          WHERE u.id=$1 AND COALESCE(u.status,'ativo')='ativo'
            AND (u.empresa_id IS NULL OR COALESCE(e.ativo,true)=true)`,[job.usuario_id]);
      const u=userRows[0];
      const tipo=job.tipo.toLowerCase();
      const prefsKey=tipo.includes('lead')?'leads':tipo.includes('chat')?'chat':tipo.includes('tarefa')?'tarefas':
        tipo.includes('ficha')?'fichas':tipo.includes('fatur')?'faturamento':tipo.includes('venda')?'vendas':
        tipo.includes('estoque')?'estoque':tipo.includes('oficina')?'oficina':null;
      if (!u?.ativo || (prefsKey && u.preferencias_notif?.[prefsKey]===false)) {
        await query(`UPDATE public.aurox_push_outbox SET estado='ignorado',processado_em=now(),erro=NULL WHERE id=$1`,[job.id]);
        ignorados++;continue;
      }
      const {rows:subs}=await query<{id:number;endpoint:string;p256dh:string;auth:string}>(
        `SELECT id,endpoint,p256dh,auth FROM public.push_subscriptions WHERE usuario_id=$1 AND ativo=TRUE`,[job.usuario_id]);
      if (!subs.length) {await query(`UPDATE public.aurox_push_outbox SET estado='ignorado',processado_em=now(),erro='Sem dispositivo inscrito' WHERE id=$1`,[job.id]);ignorados++;continue;}
      let ok=0;let failed=0;
      for(const s of subs){
        try {
          await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},
            JSON.stringify({title:job.titulo||'Aurox',body:'Você recebeu uma nova notificação no Aurox.',url:job.destino||'/painel',tag:`aurox-${job.id}`}),
            {TTL:86400,urgency:'normal'});
          ok++;
        } catch(e:any) {
          if ([404,410].includes(Number(e?.statusCode))) {
            await query(`UPDATE public.push_subscriptions SET ativo=FALSE,updated_at=now() WHERE id=$1`,[s.id]);
          } else {failed++;console.error('[push] falha no provedor',Number(e?.statusCode)||'rede');}
        }
      }
      // Aceite pelo provedor não garante exibição; falhas remanescentes podem ser tentadas novamente.
      if (ok>0 || failed===0){
        await query(`UPDATE public.aurox_push_outbox SET estado='enviado',processado_em=now(),erro=NULL WHERE id=$1`,[job.id]);entregues++;
      }else{
        await query(`UPDATE public.aurox_push_outbox SET estado=CASE WHEN tentativas>=5 THEN 'erro' ELSE 'pendente' END,
            proxima_tentativa=now()+interval '2 minutes',erro='Falha temporária no serviço push' WHERE id=$1`,[job.id]);reprocessar++;
      }
    }catch(e){
      console.error('[push] job',job.id,e instanceof Error?e.message:'erro');
      await query(`UPDATE public.aurox_push_outbox SET estado=CASE WHEN tentativas>=5 THEN 'erro' ELSE 'pendente' END,
        proxima_tentativa=now()+interval '2 minutes',erro='Falha de processamento' WHERE id=$1`,[job.id]).catch(()=>{});
      reprocessar++;
    }
  }
  return {processados:jobs.length,entregues,ignorados,reprocessar};
}

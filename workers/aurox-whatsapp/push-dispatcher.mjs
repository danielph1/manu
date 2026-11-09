// Dispatcher opcional da fila Web Push. Executa com o Aurox-WhatsApp Windows aberto.
// Configure PUSH_DISPATCH_SECRET igual na Vercel e no .env do worker.
export function startPushDispatcher(base){
  const secret=String(process.env.PUSH_DISPATCH_SECRET||'');
  if(secret.length<32){console.info('[Aurox Push] desativado: configure PUSH_DISPATCH_SECRET (32+ chars).');return;}
  if(!/^https:\/\//.test(base)){console.warn('[Aurox Push] URL HTTPS do MANU inválida.');return;}
  let running=false;
  async function tick(){
    if(running)return;running=true;
    try{
      const res=await fetch(`${base}/api/cron/push`,{
        headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(20000),cache:'no-store',
      });
      if(!res.ok){console.warn(`[Aurox Push] despacho HTTP ${res.status}`);return;}
      const data=await res.json();
      if(Number(data.processados)>0)console.info(`[Aurox Push] ${data.processados} processados; ${data.entregues} aceitos`);
    }catch(e){console.warn('[Aurox Push] falha temporária de conexão',e?.message||'erro');}
    finally{running=false;}
  }
  setTimeout(()=>{void tick();},6000).unref();
  setInterval(()=>{void tick();},30000).unref();
  // Campanhas consentidas de Follow Up: fila independente do Push e da Triagem.
  // Retentativas de entregas incertas sao tratadas manualmente na API.
  let followupRunning=false;
  async function followupTick(){
    if(followupRunning)return;
    const followupSecret=String(process.env.FOLLOWUP_DISPATCH_SECRET||process.env.PUSH_DISPATCH_SECRET||'');
    if(followupSecret.length<32)return;
    followupRunning=true;
    try{
      const res=await fetch(`${base}/api/cron/follow-up`,{
        headers:{Authorization:`Bearer ${followupSecret}`},
        signal:AbortSignal.timeout(20000),cache:'no-store',
      });
      if(!res.ok){console.warn(`[Aurox Follow Up] despacho HTTP ${res.status}`);return;}
      const data=await res.json();
      if(Number(data.processados)>0)console.info(`[Aurox Follow Up] ${data.processados} processado(s); ${data.enviados||0} enviado(s)`);
    }catch(e){console.warn('[Aurox Follow Up] falha temporária:',e?.message||'erro');}
    finally{followupRunning=false;}
  }
  setTimeout(()=>{void followupTick();},7000).unref();
  setInterval(()=>{void followupTick();},30000).unref();
}

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
}

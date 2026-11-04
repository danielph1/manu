import http from 'node:http';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

const BASE = String(process.env.MANU_APP_URL || '').replace(/\/$/, '');
const SECRET = String(process.env.AUROX_WA_WORKER_SECRET || '');
const PORT = Number(process.env.PORT || 3456);
const ROOT = path.resolve(process.env.DATA_DIR || './.wa-data');
const MAX = Math.max(1,Math.min(100,Number(process.env.MAX_SESSIONS||10)));
if (SECRET.length < 32 || !/^https:\/\//.test(BASE)) {
  console.error('Configure MANU_APP_URL (HTTPS) e AUROX_WA_WORKER_SECRET com 32+ caracteres.');
  process.exit(1);
}
const SPOOL = path.join(ROOT, 'outbox');
const KEY = createHash('sha256').update(`aurox-wa-outbox:v1:${SECRET}`).digest();
const sessions = new Map();
let spoolRunning = false;
const digest = s=>createHash('sha256').update(String(s)).digest('hex');
const safeId = id => Number.isSafeInteger(Number(id)) && Number(id)>0 && Number(id)<1e9 ? Number(id) : null;
const url = (p) => `${BASE}/api/internal/aurox-whatsapp${p}`;

function verified(h) {
  const actual=String(h||'').replace(/^Bearer\s+/i,'');
  return Buffer.byteLength(actual)===Buffer.byteLength(SECRET)
    && timingSafeEqual(Buffer.from(actual),Buffer.from(SECRET));
}
function securePack(message) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',KEY,iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(message),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),bytes]);
}
function secureUnpack(bytes) {
  const iv=bytes.subarray(0,12),tag=bytes.subarray(12,28),content=bytes.subarray(28);
  const decipher=createDecipheriv('aes-256-gcm',KEY,iv);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(content),decipher.final()]).toString('utf8'));
}
async function postToManu(event) {
  const body=JSON.stringify(event),ts=String(Date.now());
  const sig=createHmac('sha256',SECRET).update(`${ts}.${body}`).digest('hex');
  const r=await fetch(url(''),{
    method:'POST',headers:{'Content-Type':'application/json','X-Aurox-Timestamp':ts,'X-Aurox-Signature':sig},
    body,signal:AbortSignal.timeout(15000),cache:'no-store',
  });
  const data=await r.json().catch(()=>({}));
  if (!r.ok) {const err=new Error(`MANU HTTP ${r.status}: ${data.error||'erro'}`);err.code=r.status;throw err;}
  return data;
}
async function statusEvent(s,status,phone='',error='') {
  if (s.halted) return;
  s.status=status;s.phone=phone||s.phone;s.error=error||'';
  try { await postToManu({type:'status',empresa_id:s.empresa_id,instancia_id:s.instancia_id,status,phone,error}); }
  catch(e) {
    console.warn(`[${s.empresa_id}] status não sincronizado: ${e.message}`);
    if(e.code===409 && status==='conectado') {
      s.status='erro';s.error='Número já conectado a outra empresa';
      try {await postToManu({type:'status',empresa_id:s.empresa_id,instancia_id:s.instancia_id,status:'erro',error:s.error});}catch{}
      s.halted=true;
      try {await s.client?.logout();}catch{}
      await s.client?.destroy().catch(()=>{});
      sessions.delete(s.empresa_id);
    }
  }
}
function placeholder(m) {
  if(typeof m.body==='string' && m.body.trim())return m.body.slice(0,4000);
  return {image:'[Imagem recebida]',video:'[Vídeo recebido]',audio:'[Áudio recebido]',ptt:'[Mensagem de voz]',document:'[Documento recebido]',sticker:'[Figurinha recebida]',location:'[Localização recebida]'}[m.type]||'[Mensagem recebida]';
}
async function storeEvent(ev) {
  const key=digest(`${ev.empresa_id}\0${ev.instancia_id}\0${ev.message_id}`);
  const target=path.join(SPOOL,key+'.bin');
  const tmp=path.join(SPOOL,`.${key}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp,securePack(ev),{mode:0o600});
  await fs.rename(tmp,target);
}
async function flushOutbox() {
  if(spoolRunning)return;
  spoolRunning=true;
  try {
    const files=(await fs.readdir(SPOOL)).filter(s=>/^[0-9a-f]{64}\.bin$/.test(s)).slice(0,400);
    for(const name of files) {
      const p=path.join(SPOOL,name);let ev;
      try { ev=secureUnpack(await fs.readFile(p)); }
      catch(e) {console.error('Evento da fila não pode ser descriptografado; verificar chave e volume.');continue;}
      try {
        const ack=await postToManu(ev);
        await fs.unlink(p).catch(()=>{});
        if (ack.new_contact && ack.welcome) {
          const s=sessions.get(ev.empresa_id);
          if(s?.status==='conectado' && !s.halted && s.instancia_id===ev.instancia_id) {
            try { await s.client.sendMessage(ev.chat_id,String(ack.welcome).slice(0,600)); }
            catch(e) {console.warn(`[${ev.empresa_id}] saudação falhou: ${e.message}`);}
          }
        }
      } catch(e) {
        if(e.code===403 || e.code===401) {
          // Desconectado/revogado: não manter mensagens pessoais na fila local.
          await fs.unlink(p).catch(()=>{});
          continue;
        }
        console.warn(`Reenvio de mensagem não concluído: ${e.message}`);
      }
    }
  }catch(e){console.warn('Falha ao processar fila:',e.message);}
  finally{spoolRunning=false;}
}
async function startSession(empresa_id,instancia_id) {
  if(!safeId(empresa_id)||!/^[0-9a-f-]{36}$/i.test(String(instancia_id||'')))throw new Error('Identificação inválida');
  const previous=sessions.get(empresa_id);
  if(previous) {
    if(previous.instancia_id!==instancia_id)throw new Error('Empresa já tem outra instância neste worker');
    if(['desconectado','erro'].includes(previous.status)) {
      previous.halted=true;
      await previous.client?.destroy().catch(()=>{});
      sessions.delete(empresa_id);
    } else return {ok:true,status:previous.status};
  }
  if(sessions.size>=MAX)throw new Error(`Limite de ${MAX} instâncias neste worker`);
  const s={empresa_id,instancia_id,status:'iniciando',qr:null,phone:null,error:'',halted:false,client:null};
  sessions.set(empresa_id,s);
  const auth = new LocalAuth({clientId:`aurox-company-${empresa_id}`,dataPath:path.join(ROOT,'auth')});
  const executablePath=process.env.PUPPETEER_EXECUTABLE_PATH||undefined;
  const client=new Client({authStrategy:auth,puppeteer:{headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}});
  s.client=client;
  client.on('qr',async qr=>{
    if(s.halted)return;
    try{s.qr=await qrcode.toDataURL(qr,{width:340,margin:1,errorCorrectionLevel:'M'});await statusEvent(s,'qr');}
    catch(e){console.error('Falha ao gerar QR:',e.message);}
  });
  client.on('authenticated',()=>{s.qr=null;void statusEvent(s,'autenticando');});
  client.on('ready',()=>{s.qr=null;void statusEvent(s,'conectado',String(client.info?.wid?.user||''));});
  client.on('auth_failure',e=>{s.qr=null;void statusEvent(s,'erro','',String(e||'Falha de autenticação'));});
  client.on('disconnected',reason=>{s.qr=null;void statusEvent(s,'desconectado','',String(reason||''));});
  client.on('message',async msg=>{
    try {
      if(s.halted||msg.fromMe||!/^\d{5,22}@(c\.us|lid)$/.test(String(msg.from||'')))return;
      const serialized=String(msg.id?._serialized||'');if(!serialized)return;
      let name='Contato WhatsApp';
      try {const c=await msg.getContact();name=String(c.pushname||c.name||name).slice(0,150);} catch{}
      const ev={type:'message',empresa_id,instancia_id,message_id:digest(serialized),chat_id:String(msg.from),
        phone:msg.from.endsWith('@c.us')?msg.from.split('@')[0]:null,name,
        body:placeholder(msg),message_type:String(msg.type||'chat')};
      await storeEvent(ev);
      void flushOutbox();
    }catch(e){console.error(`[${empresa_id}] falha ao colocar mensagem na fila:`,e.message);}
  });
  void client.initialize().catch(async e=>{
    console.error(`[${empresa_id}] falha ao iniciar WhatsApp:`,e.message);
    await statusEvent(s,'erro','',e.message);
    await client.destroy().catch(()=>{});
    sessions.delete(empresa_id);
  });
  return {ok:true,status:'iniciando'};
}
async function logoutSession(empresa_id) {
  const s=sessions.get(empresa_id);
  if(s) {
    s.halted=true;sessions.delete(empresa_id);
    try{await s.client.logout();}catch{}
    try{await s.client.destroy();}catch{}
  }
  const folder=path.join(ROOT,'auth',`session-aurox-company-${empresa_id}`);
  await fs.rm(folder,{force:true,recursive:true}).catch(()=>{});
  for(const name of (await fs.readdir(SPOOL).catch(()=>[]))) {
    if(!/^[a-f0-9]{64}\.bin$/.test(name))continue;
    const p=path.join(SPOOL,name);
    try {const ev=secureUnpack(await fs.readFile(p));if(ev.empresa_id===empresa_id)await fs.rm(p,{force:true});} catch{}
  }
  return {ok:true};
}
function sendJSON(res,status,body) {
  const str=JSON.stringify(body);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(str)});
  res.end(str);
}
function readBody(req) {return new Promise((resolve,reject)=>{
  let data='';req.on('data',c=>{data+=c;if(data.length>12000){reject(new Error('Corpo muito grande'));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(data||'{}'));}catch{reject(new Error('JSON inválido'));}});req.on('error',reject);
});}
const server=http.createServer(async(req,res)=>{
  if(!verified(req.headers.authorization)){sendJSON(res,401,{error:'Não autorizado'});return;}
  const u=new URL(req.url,'http://internal');
  const match=u.pathname.match(/^\/v1\/sessions\/(\d+)\/(status|start|logout|send)$/);
  if(!match){sendJSON(res,404,{error:'Não encontrado'});return;}
  const id=safeId(match[1]),action=match[2];
  if(!id){sendJSON(res,400,{error:'Empresa inválida'});return;}
  try {
    if(action==='status'&&req.method==='GET') {
      const s=sessions.get(id);
      sendJSON(res,200,s?{status:s.status,phone:s.phone,qr:s.status==='qr'?s.qr:null,error:s.error}:
        {status:'desconectado',phone:null,qr:null});return;
    }
    if(action==='start'&&req.method==='POST'){
      const b=await readBody(req);sendJSON(res,202,await startSession(id,b.instance_id));return;
    }
    if(action==='logout'&&req.method==='POST'){
      sendJSON(res,200,await logoutSession(id));return;
    }
    if(action==='send'&&req.method==='POST'){
      const b=await readBody(req),s=sessions.get(id);
      if(!s||s.status!=='conectado'||s.halted)throw new Error('WhatsApp da empresa desconectado');
      if(!/^\d{5,22}@(c\.us|lid)$/.test(String(b.chat_id||'')))throw new Error('Contato inválido');
      const message=String(b.message||'').trim();
      if(!message||message.length>4000)throw new Error('Mensagem inválida');
      const sent=await s.client.sendMessage(b.chat_id,message);
      sendJSON(res,200,{ok:true,message_id:digest(String(sent?.id?._serialized||Date.now()))});return;
    }
    sendJSON(res,405,{error:'Método não permitido'});
  }catch(e){sendJSON(res,409,{error:e.message});}
});
async function restore() {
  try {
    const r=await fetch(url('/bootstrap'),{headers:{Authorization:`Bearer ${SECRET}`},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error(`Bootstrap HTTP ${r.status}`);
    const {sessions:target=[]}=await r.json();
    for(const t of target.slice(0,MAX)){
      try{await startSession(Number(t.empresa_id),String(t.instancia_id));}catch(e){console.warn('Restore:',e.message);}
    }
  }catch(e){console.warn('Restaurar instâncias:',e.message);}
}
await fs.mkdir(SPOOL,{recursive:true,mode:0o700});
await fs.mkdir(path.join(ROOT,'auth'),{recursive:true,mode:0o700});
server.listen(PORT,'0.0.0.0',()=>console.log(`Aurox-WhatsApp worker: porta ${PORT}; armazenamento persistente ${ROOT}`));
setInterval(()=>{void flushOutbox();},8000).unref();
setInterval(()=>{void restore();},120000).unref();
void restore();

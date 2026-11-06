'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const base=path.resolve(__dirname,'..');
const src=p=>fs.readFileSync(path.join(base,p),'utf8');
function loadDispatch({tipo='chat',preferencia=true,subs=true}={}){
  let nextClaim=true;
  const queries=[], sent=[];
  const fakeQuery=async(sql,args=[])=>{
    queries.push({sql,args});
    if(sql.includes('WITH lote AS'))return {rows:nextClaim?[
      {id:5,usuario_id:42,titulo:'Nova mensagem',mensagem:'segredo do cliente',tipo,destino:'/chat'}
    ]:[]};
    if(sql.includes('SELECT COALESCE(u.ativo'))return {rows:[{ativo:true,preferencias_notif:{chat:preferencia,leads:preferencia}}]};
    if(sql.includes('FROM public.push_subscriptions WHERE usuario_id'))return {rows:subs?[{id:1,endpoint:'https://fcm.googleapis.com/fcm/send/xxx',p256dh:'abc',auth:'abc'}]:[]};
    return {rows:[]};
  };
  const webpush={setVapidDetails:()=>{},sendNotification:async(sub,payload)=>{sent.push(JSON.parse(payload))}};
  const exports={};
  const f=path.join(base,'lib/push/dispatch.ts');
  const js=ts.transpileModule(src('lib/push/dispatch.ts'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports};
  const env=process.env;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY='pubkey';process.env.VAPID_PRIVATE_KEY='privkey';process.env.VAPID_SUBJECT='mailto:support@example.com';
  vm.runInNewContext(js,{exports,module:mod,require:x=>{
    if(x==='@/lib/db')return {query:fakeQuery};
    if(x==='web-push')return {default:webpush};
    throw Error('import não esperado '+x);
  },console,process,Buffer,Number,String,Boolean,Date,Math,Promise,JSON}, {filename:f});
  return {send:()=>mod.exports.dispatchAuroxPush(20),queries,sent,cleanup:()=>{process.env=env}};
}
test('todos os avisos devem ter fila persistente e três fontes de eventos',()=>{
  const sql=src('supabase/migrations/202611060002_aurox_push_eventos.sql');
  assert.match(sql,/aurox_push_on_notificacoes/);
  assert.match(sql,/aurox_push_chat_cliente/);
  assert.match(sql,/aurox_push_triagem/);
  assert.match(sql,/aurox_push_novo_lead/);
  assert.match(src('lib/push/dispatch.ts'),/FOR UPDATE SKIP LOCKED/);
});
test('despacho envia mensagem genérica sem dados pessoais e registra aceite',async()=>{
  const f=loadDispatch();
  const r=await f.send();
  assert.equal(r.processados,1);
  assert.equal(r.entregues,1);
  assert.equal(f.sent[0].body,'Você recebeu uma nova notificação no Aurox.');
  assert.ok(!JSON.stringify(f.sent[0]).includes('segredo do cliente'));
  assert.equal(f.sent[0].url,'/chat');
  assert.ok(f.queries.some(q=>q.sql.includes("estado='enviado'")));
});
test('preferência desligada impede notificação externa',async()=>{
  const f=loadDispatch({preferencia:false});
  const r=await f.send();
  assert.equal(r.ignorados,1);assert.equal(f.sent.length,0);
});
test('sem dispositivo autorizado mantém histórico sem criar envio falso',async()=>{
  const f=loadDispatch({subs:false});
  const r=await f.send();assert.equal(r.ignorados,1);assert.equal(f.sent.length,0);
});
test('permissão só é solicitada por clique, com autenticação Bearer',()=>{
  assert.doesNotMatch(src('components/pwa-provider.tsx'),/requestPermission\(/);
  assert.match(src('lib/push/client.ts'),/Notification\.requestPermission\(\)/);
  assert.match(src('lib/push/client.ts'),/api\.post\('\/push\/subscribe'/);
  assert.match(src('lib/api.ts'),/config\.headers\.Authorization/);
  assert.match(src('app/api/push/subscribe/route.ts'),/requireUser\(req\)/);
});
test('service worker não cacheia páginas privadas',()=>{
  const sw=src('public/sw.js');
  assert.doesNotMatch(sw,/caches\.put/);
  assert.match(sw,/showNotification/);
  assert.match(sw,/notificationclick/);
});
test('rota de preferências existe e restringe acesso à empresa',()=>{
  const code=src('app/api/anuncios/preferencias/route.ts');
  assert.match(code,/export async function GET/);
  assert.match(code,/export async function PUT/);
  assert.match(code,/Number\(user\.empresa_id\)/);
});
test('trabalhador local pode executar dispatcher mesmo sem página aberta',()=>{
  assert.match(src('workers/aurox-whatsapp/index.mjs'),/startPushDispatcher\(BASE\)/);
  assert.match(src('workers/aurox-whatsapp/push-dispatcher.mjs'),/setInterval/);
  assert.match(src('app/api/cron/push/route.ts'),/timingSafeEqual/);
});

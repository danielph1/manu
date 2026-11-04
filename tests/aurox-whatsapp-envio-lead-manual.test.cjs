const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sendSrc = fs.readFileSync(path.join(root,'lib/aurox-whatsapp/send.ts'),'utf8');
const sendJs = ts.transpileModule(sendSrc,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

function scenario(o={}) {
  const calls=[];
  const db={
    async queryOne(sql,params){
      calls.push({kind:'one',sql,params});
      if(sql.includes('FROM public.aurox_wa_instancias i')) return o.active===false ? null : {instancia_id:'a-uuid',habilitada:true};
      if(sql.includes('FROM public.aurox_wa_contatos c')) return o.linked ? {id:9,chat_id:'5521999999999@c.us',lead_id:17,triagem_lead_id:null}:null;
      if(sql.includes('INSERT INTO public.aurox_wa_contatos')) return {id:40};
      throw new Error('queryOne not mocked');
    },
    async query(sql,params){
      calls.push({kind:'query',sql,params});
      if(sql.includes('FROM public.aurox_wa_contatos c')) return {rows:o.conflict ? [{id:10,lead_id:99,triagem_lead_id:null}] : []};
      return {rows:[],rowCount:1};
    }
  };
  const worker={async workerRequest(route,method,payload){
    calls.push({kind:'worker',route,method,payload});
    if(o.workerError)throw new Error(o.workerError);
    return {ok:true,chat_id:o.linked?'5521999999999@c.us':'5521988877766@c.us',message_id:'e'.repeat(64)};
  }};
  const sandbox={module:{exports:{}},exports:{},console,require(id){
    if(id==='@/lib/db')return db;
    if(id==='@/lib/zapi')return {phoneToZapi(s){let d=String(s||'').replace(/\D/g,'').replace(/^0+/,'');return d.length>=10&&d.length<=11?'55'+d:d;}};
    if(id==='./security')return worker;
    throw Error(id);
  }};
  sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(sendJs,sandbox);
  return {send:sandbox.module.exports.sendAuroxMessage,calls};
}

test('lead manual usa Aurox da empresa e normaliza telefone brasileiro',async()=>{
 const {send,calls}=scenario();
 const result=await send(2,17,'Olá pelo Aurox','(21) 98887-7766');
 assert.equal(result.ok,true);assert.equal(result.routed,true);
 const w=calls.find(c=>c.kind==='worker');
 assert.equal(w.route,'/v1/sessions/2/send');
 assert.equal(w.payload.phone,'5521988877766');
 assert.equal(w.payload.message,'Olá pelo Aurox');
 assert.ok(calls.some(c=>c.sql?.includes('INSERT INTO public.aurox_wa_contatos')));
 assert.ok(calls.some(c=>c.sql?.includes('INSERT INTO public.aurox_wa_mensagens')));
});
test('conversa ja vinculada usa chat_id existente sem resolver telefone',async()=>{
 const {send,calls}=scenario({linked:true});
 const r=await send(2,17,'Olá',null);
 assert.equal(r.ok,true);const w=calls.find(c=>c.kind==='worker');
 assert.equal(w.payload.chat_id,'5521999999999@c.us');assert.equal(w.payload.phone,undefined);
});
test('sem instância ativa mantém provedor legado como opção',async()=>{
 const {send,calls}=scenario({active:false});const r=await send(2,17,'Oi','21988887766');
 assert.equal(r.routed,false);assert.equal(calls.filter(c=>c.kind==='worker').length,0);
});
test('erro no Aurox nunca aciona fallback automático para Z-API',async()=>{
 const {send,calls}=scenario({workerError:'WhatsApp da empresa desconectado'});
 const r=await send(2,17,'Oi','21988887766');assert.equal(r.ok,false);assert.equal(r.routed,true);
 assert.match(r.message,/não enviada pelo Aurox-WhatsApp/i);
 assert.equal(calls.filter(c=>c.kind==='worker').length,1);
});
test('telefone de outro lead da mesma empresa não é redirecionado',async()=>{
 const {send,calls}=scenario({conflict:true});
 const r=await send(2,17,'Oi','21988887766');
 assert.equal(r.routed,true);assert.equal(r.ok,false);assert.equal(r.status,'contact_conflict');
 assert.equal(calls.filter(c=>c.kind==='worker').length,0);
});
test('sem telefone de destino, Aurox sinaliza problema sem tentar Z-API',async()=>{
 const {send,calls}=scenario();
 const r=await send(2,17,'Oi','');
 assert.equal(r.status,'invalid_phone');assert.equal(r.routed,true);
 assert.equal(calls.filter(c=>c.kind==='worker').length,0);
});
test('backend do chat repassa telefone do lead autenticado ao seletor',()=>{
 const route=fs.readFileSync(path.join(root,'app/api/chat/route.ts'),'utf8');
 assert.match(route,/sendAuroxMessage\(lead\.empresaId,\s*leadId,\s*msg,\s*lead\.telefone\)/);
 assert.match(route,/whatsapp = aurox\.routed \? aurox : await enviarWhatsAppDaEmpresa/);
});
test('worker resolve telefone com WhatsApp Web e informa chat_id no retorno',()=>{
 const code=fs.readFileSync(path.join(root,'workers/aurox-whatsapp/index.mjs'),'utf8');
 assert.match(code,/s\.client\.getNumberId\(phone\)/);
 assert.match(code,/sendJSON\(res,200,\{ok:true,chat_id:chatId,message_id:/);
 assert.match(code,/s\.client\.sendMessage\(chatId,message\)/);
});
test('observações internas são privadas e anexos usam worker com mídia explícita',()=>{
 const route=fs.readFileSync(path.join(root,'app/api/chat/route.ts'),'utf8');
 assert.match(route,/\^\\\[interno\\\]/);
 assert.match(route,/status:'internal_only'/);
 assert.match(route,/sendAuroxMessage\(lead\.empresaId,\s*leadId,\s*msg,\s*lead\.telefone,\s*\{/);
 const client=fs.readFileSync(path.join(root,'app/(dashboard)/chat/page.tsx'),'utf8');
 assert.match(client,/response\?\.data\?\.whatsapp\?\.ok === false/);
});

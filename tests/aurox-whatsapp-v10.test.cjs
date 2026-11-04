const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/aurox-whatsapp/ingest.ts'),'utf8');

function scenario({existingLead=false,duplicated=false,contactIsExisting=false}={}) {
  const queries=[];
  const client={release(){}, async query(sql,params=[]){
    const s=sql.trim(); queries.push({sql:s,params});
    if(s.startsWith('SELECT i.empresa_id'))return {rows:[{empresa_id:2,saudacao_ativa:false,saudacao:''}],rowCount:1};
    if(s.startsWith('INSERT INTO public.aurox_wa_contatos'))return {rows:[{id:11,triagem_id:contactIsExisting?42:null,lead_id:null}],rowCount:1};
    if(s.startsWith('INSERT INTO public.aurox_wa_mensagens'))return {rows:duplicated?[]:[{id:901}],rowCount:duplicated?0:1};
    if(s.startsWith('SELECT l.id FROM public.leads'))return {rows:existingLead?[{id:82}]:[],rowCount:existingLead?1:0};
    if(s.startsWith('SELECT status,lead_id FROM public.triagem'))return {rows:[{status:'aguardando',lead_id:null}],rowCount:1};
    if(s.startsWith('SELECT id FROM public.triagem'))return {rows:[],rowCount:0};
    if(s.startsWith('INSERT INTO public.triagem'))return {rows:[{id:42}],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={module:{exports:{}},exports:{},require(id){if(id==='@/lib/db')return {getPool(){return {async connect(){return client;}}}};throw Error(id);}};
  sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(code,sandbox);
  return {processIncoming:sandbox.module.exports.processIncoming,queries};
}
const ev={type:'message',empresa_id:2,instancia_id:'11111111-1111-4111-8111-111111111111',
  chat_id:'5521999999999@c.us',phone:'5521999999999',name:'Amigo antigo',
  body:'Oi de novo',message_id:'a'.repeat(64),message_type:'chat'};

test('conversa antiga no WhatsApp mas nova no MANU vira triagem',async()=>{
 const {processIncoming,queries}=scenario(); const r=await processIncoming(ev);
 assert.equal(r.new_contact,true);assert.equal(r.triagem_id,42);
 assert.ok(queries.some(x=>x.sql.includes('INSERT INTO public.triagem')));
});
test('lead ja cadastrado na mesma empresa nao duplica a triagem',async()=>{
 const {processIncoming,queries}=scenario({existingLead:true});const r=await processIncoming(ev);
 assert.equal(r.lead_id,82);assert.equal(r.new_contact,false);
 assert.equal(queries.some(x=>x.sql.includes('INSERT INTO public.triagem')),false);
});
test('mesmo message_id nao gera um segundo lead',async()=>{
 const {processIncoming,queries}=scenario({duplicated:true});const r=await processIncoming(ev);
 assert.equal(r.duplicate,true);
 assert.equal(queries.some(x=>x.sql.includes('INSERT INTO public.triagem')),false);
});
test('video nao gera lead',async()=>{
 const {processIncoming,queries}=scenario();const r=await processIncoming({...ev,message_type:'video'});
 assert.equal(r.ignored,true);assert.equal(queries.length,0);
});
test('imagem liga metadados de arquivo privado',async()=>{
 const {processIncoming,queries}=scenario();await processIncoming({...ev,message_type:'image',
  body:'[Foto recebida]',media_path:`2/${ev.instancia_id}/${ev.message_id}.jpg`,
  media_mime:'image/jpeg',media_size:51325});
 const row=queries.find(x=>x.sql.includes('INSERT INTO public.aurox_wa_mensagens'));
 assert.equal(row.params[5],`2/${ev.instancia_id}/${ev.message_id}.jpg`);
});

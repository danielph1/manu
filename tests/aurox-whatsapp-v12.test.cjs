const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function mockSend(){
  const calls=[];
  const src=ts.transpileModule(read('lib/aurox-whatsapp/send.ts'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={module:{exports:{}},console,require(id){
    if(id==='@/lib/db')return {
      async queryOne(sql){if(sql.includes('FROM public.aurox_wa_instancias'))return {instancia_id:'uuid',habilitada:true};
        if(sql.includes('FROM public.aurox_wa_contatos'))return {id:9,chat_id:'5521988887777@c.us',lead_id:44,triagem_lead_id:null};
        if(sql.includes('INSERT INTO public.aurox_wa_contatos'))return {id:9};throw Error(sql)},
      async query(sql,params){calls.push({type:'sql',sql,params});return {rows:[],rowCount:1}}
    };
    if(id==='@/lib/zapi')return {phoneToZapi:x=>x};
    if(id==='./security')return {async workerRequest(route,method,payload){calls.push({type:'worker',route,method,payload});return {ok:true,chat_id:'5521988887777@c.us',message_id:'f'.repeat(64)}}};
    throw Error(id);
  }};sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(src,sandbox);
  return {send:sandbox.module.exports.sendAuroxMessage,calls};
}

test('envio de audio leva dados binários ao worker, não a palavra Áudio',async()=>{
  const {send,calls}=mockSend();
  const audio={base64:Buffer.from('fake-audio-binary').toString('base64'),mime:'audio/webm;codecs=opus',filename:'audio.webm'};
  const result=await send(3,44,'',null,audio);
  assert.equal(result.ok,true);
  const w=calls.find(c=>c.type==='worker');
  assert.equal(w.payload.media.base64,audio.base64);
  assert.equal(w.payload.media.mime,audio.mime);
  assert.equal(w.payload.message,'');
  const audit=calls.find(c=>c.sql?.includes('INSERT INTO public.aurox_wa_mensagens'));
  assert.equal(audit.params[4],'audio');
});

test('foto sai como anexo real e legenda opcional',async()=>{
  const {send,calls}=mockSend();
  const image={base64:'aGVsbG8=',mime:'image/jpeg',filename:'foto.jpg'};
  await send(3,44,'Olha o carro',null,image);
  const w=calls.find(c=>c.type==='worker');
  assert.equal(w.payload.message,'Olha o carro');
  assert.equal(w.payload.media.filename,'foto.jpg');
});

test('mídias recebidas são ligadas ao chat com chave única sem ON CONFLICT parcial',()=>{
  const mig=read('supabase/migrations/202611040004_aurox_whatsapp_chat_midia.sql');
  const ingest=read('lib/aurox-whatsapp/ingest.ts');
  const triagem=read('app/api/triagem/route.ts');
  assert.match(mig,/CREATE UNIQUE INDEX IF NOT EXISTS chat_geral_aurox_msg_uq\s+ON public\.chat_geral_mensagens \(aurox_wa_mensagem_id\);/);
  assert.match(ingest,/INSERT INTO public\.chat_geral_mensagens\(remetente_id,lead_id,mensagem,aurox_wa_mensagem_id\)/);
  assert.doesNotMatch(ingest,/\[Aurox-WhatsApp\] \$\{body/);
  assert.match(triagem,/SELECT NULL,\$1,m\.corpo,m\.id/);
});

test('mídia privada verifica permissão do lead e token Bearer antes do link temporário',()=>{
  const route=read('app/api/chat/media/[id]/route.ts');
  const ui=read('app/(dashboard)/chat/page.tsx');
  assert.match(route,/requireUser\(req\)/);
  assert.match(route,/leadAcessivel\(actor,Number\(item\.lead_id\)\)/);
  assert.match(route,/wa\.empresa_id=COALESCE\(l\.empresa_id,v\.empresa_id\)/);
  assert.match(route,/createSignedUrl\(item\.media_path,600\)/);
  assert.match(ui,/api\.get\(`\/chat\/media\/\$\{mensagemId\}`\)/);
  assert.doesNotMatch(ui,/src=\{`\/api\/chat\/media/);
});

test('vídeos são bloqueados e não há Z-API como fallback para mídias',()=>{
  const route=read('app/api/chat/route.ts');
  const worker=read('workers/aurox-whatsapp/index.mjs');
  assert.match(route,/Vídeos não são suportados/);
  assert.match(worker,/new MessageMedia\(mime,base64,fileName,bytes.length\)/);
  assert.match(worker,/sendMessage\(chatId,media,options\)/);
  assert.match(route,/else if \(b64\) \{[\s\S]*?await sendAuroxMessage/);
  const mediaBranch=route.split('} else if (b64) {')[1].split('} else if (msg &&')[0];
  assert.doesNotMatch(mediaBranch,/enviarWhatsAppDaEmpresa/);
});

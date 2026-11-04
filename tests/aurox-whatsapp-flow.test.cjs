const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const Module=require('node:module');
const root=path.join(__dirname,'..');
const state={
  instances:new Map([[1,{instancia:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',saudacao_ativa:true,saudacao:'Bem-vindo à loja'}],[2,{instancia:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',saudacao_ativa:false,saudacao:''}]]),
  contacts:new Map(),messages:new Set(),triages:new Map(),nextContact:1,nextTriagem:1,
};
const db={
  async connect(){return {
    async query(sql,args=[]){
      const s=sql.replace(/\s+/g,' ').trim();
      if(/^(BEGIN|COMMIT|ROLLBACK)$/.test(s))return {rows:[],rowCount:0};
      if(s.startsWith('SELECT i.empresa_id')) {
        const o=state.instances.get(args[0]);
        return o&&o.instancia===args[1]?{rows:[o],rowCount:1}:{rows:[],rowCount:0};
      }
      if(s.startsWith('INSERT INTO public.aurox_wa_contatos')) {
        const k=`${args[0]}:${args[1]}`;let c=state.contacts.get(k);
        if(!c){c={id:state.nextContact++,empresa:args[0],chat:args[1],triagem_id:null,lead_id:null};state.contacts.set(k,c);}
        return {rows:[{id:c.id,triagem_id:c.triagem_id,lead_id:c.lead_id}],rowCount:1};
      }
      if(s.startsWith('INSERT INTO public.aurox_wa_mensagens')) {
        const k=`${args[0]}:${args[2]}`;
        if(state.messages.has(k))return {rows:[],rowCount:0};
        state.messages.add(k);return {rows:[{id:state.messages.size}],rowCount:1};
      }
      if(s.startsWith('SELECT l.id FROM public.leads'))return {rows:[],rowCount:0};
      if(s.startsWith('SELECT id FROM public.triagem'))return {rows:[],rowCount:0};
      if(s.startsWith('INSERT INTO public.triagem')) {
        const id=state.nextTriagem++;
        state.triages.set(id,{id,empresa:args[0],status:'aguardando',lead_id:null,body:args[3]});
        return {rows:[{id}],rowCount:1};
      }
      if(s.startsWith('UPDATE public.triagem SET mensagem'))return {rows:[],rowCount:1};
      if(s.startsWith('SELECT status,lead_id FROM public.triagem')) {
        const t=state.triages.get(args[0]);return t&&t.empresa===args[1]?{rows:[t],rowCount:1}:{rows:[],rowCount:0};
      }
      if(s.startsWith('UPDATE public.aurox_wa_contatos SET triagem_id')) {
        for(const c of state.contacts.values())if(c.id===args[2]&&c.empresa===args[3]){
          c.triagem_id=args[0];c.lead_id=args[1];return {rows:[],rowCount:1};
        }
        return {rows:[],rowCount:0};
      }
      if(s.startsWith('UPDATE public.aurox_wa_instancias SET ultima_mensagem'))return {rows:[],rowCount:1};
      if(s.startsWith('INSERT INTO public.chat_geral_mensagens'))return {rows:[],rowCount:1};
      throw Error('SQL não esperado no teste: '+s.slice(0,120));
    },
    release(){}
  }}
};
const filename=path.join(root,'lib/aurox-whatsapp/ingest.ts');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m=new Module(filename,module);m.filename=filename;
m.require=(name)=> name==='@/lib/db'?{getPool:()=>db}:require(name);
m._compile(compiled,filename);
const {processIncoming,isDirectChat,cleanPhone}=m.exports;
(async()=>{
assert.equal(isDirectChat('5511999999999@c.us'),true);
assert.equal(isDirectChat('1234@g.us'),false);
assert.equal(cleanPhone('+55 (11) 99999-9999'),'5511999999999');
const base={type:'message',empresa_id:1,instancia_id:state.instances.get(1).instancia,chat_id:'5511999999999@c.us',phone:'5511999999999',name:'Cliente de teste',body:'Quero ver um carro',message_id:'1'.repeat(64)};
const one=await processIncoming(base);
assert.equal(one.ok,true);assert.equal(one.new_contact,true);assert.equal(one.welcome,'Bem-vindo à loja');
const again=await processIncoming(base);
assert.equal(again.duplicate,true);
const follow=await processIncoming({...base,message_id:'2'.repeat(64),body:'Tem financiamento?'});
assert.equal(follow.new_contact,false);
assert.equal(state.triages.size,1);
const other=await processIncoming({...base,empresa_id:2,instancia_id:state.instances.get(2).instancia,message_id:'1'.repeat(64)});
assert.equal(other.new_contact,true);assert.equal(other.welcome,null);
assert.equal(state.triages.size,2);assert.notEqual(one.triagem_id,other.triagem_id);
const ignored=await processIncoming({...base,chat_id:'777@g.us'});
assert.equal(ignored.ignored,true);assert.equal(state.triages.size,2);
console.log('Aurox-WhatsApp: criação, deduplicação, conversa, isolamento A/B e filtro de grupos OK');
})().catch(e=>{console.error(e);process.exitCode=1});

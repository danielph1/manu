'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const route=path.join(__dirname,'../app/api/atendimento/route.ts');
const page=path.join(__dirname,'../app/(dashboard)/atendimento/page.tsx');

function loadAPI(){
  const consultas=[];
  const cols=['leads.atribuido_em','leads.created_at','leads.respondeu','leads.venda_concluida','leads.nome_lead','leads.telefone','leads.email','leads.produto_interesse','leads.observacao','vendedores.ativo','triagem.empresa_id','triagem.created_at','manu_atendimento_transferencias.criado_em'];
  const query=async(sql,args)=>{
    consultas.push({sql,args});
    if(sql.includes('information_schema.columns'))return {rows:cols.map(c=>({table_name:c.split('.')[0],column_name:c.split('.')[1]}))};
    if(sql.includes('COUNT(*)::int AS total_sem_resposta'))return {rows:[{total_sem_resposta:652,total_atrasados:591}]};
    if(sql.includes('COUNT(*)::int AS total FROM public.triagem'))return {rows:[{total:4}]};
    if(sql.includes('SELECT l.id'))return {rows:Array.from({length:Math.min(40,652-(args[2]||0))},(_,i)=>({id:args[2]+i+1,nome:'Teste',minutos_aguardando:200,vendedor_id:1}))};
    if(sql.includes('SELECT id, nome, telefone, email, interesse AS veiculo'))return {rows:[{id:101,nome:'Em triagem'}]};
    if(sql.includes('SELECT v.id, v.nome, v.loja'))return {rows:[{id:1,nome:'André',pendentes_atrasados:591,recebidos_hoje:2,perdidos_hoje:0,atendidos_registrados:0}]};
    throw Error('Consulta inesperada: '+sql.slice(0,120));
  };
  const requser=req=>req.user||null;
  const requireMock=id=>{
    if(id==='next/server')return {NextResponse:{json:(body,opts={})=>({body,status:opts.status||200})}};
    if(id==='@/lib/db')return {query,queryOne:async()=>({id:1})};
    if(id==='@/lib/session')return {requireUser:requser};
    throw Error('Import não esperado: '+id);
  };
  const transpiled=ts.transpileModule(fs.readFileSync(route,'utf8'),{fileName:route,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(transpiled,{exports:mod.exports,module:mod,require:requireMock,console,Date,Number,Set,String,Math,Array,Object,Promise}, {filename:'atendimento/route.js'});
  return {GET:mod.exports.GET,consultas};
}
const request=(filtro='todos',mais={})=>({user:{tipo:'admin',empresa_id:1},nextUrl:{searchParams:new URLSearchParams({empresa_id:'1',filtro,...mais})}});

test('KPIs computam valores reais (sem corte de 150)',async()=>{
  const {GET,consultas}=loadAPI();const r=await GET(request());
  assert.equal(r.status,200);assert.equal(r.body.total_sem_resposta,652);assert.equal(r.body.total_atrasados,591);assert.equal(r.body.total_fila,4);
  assert.equal(r.body.sem_resposta.length,40);assert.equal(r.body.total_pendentes,656);
  assert.ok(consultas.some(q=>q.sql.includes('LIMIT $2 OFFSET $3')));
});
test('Filtro de atraso inclui somente leads atrasados e pagina no servidor',async()=>{
  const {GET,consultas}=loadAPI();const r=await GET(request('atrasados',{pagina_leads:'3'}));
  assert.equal(r.status,200);assert.equal(r.body.filtro,'atrasados');
  assert.equal(r.body.fila.length,0);assert.equal(r.body.paginacao.pagina_leads,3);
  const q=consultas.find(q=>q.sql.includes('SELECT l.id'));assert.equal(q.args[2],80);
  assert.match(q.sql,/AND COALESCE\(l\.atribuido_em::timestamptz/);
});
test('Filtro triagem consulta fila, não lista dos vendedores',async()=>{
  const {GET,consultas}=loadAPI();const r=await GET(request('triagem'));
  assert.equal(r.status,200);assert.equal(r.body.fila.length,1);assert.equal(r.body.sem_resposta.length,0);
  assert.ok(!consultas.some(x=>x.sql.includes('SELECT l.id')));
});
test('Recusa filtro inválido, pagina inválida e perfil não autorizado',async()=>{
  const {GET}=loadAPI();assert.equal((await GET(request('desconhecido'))).status,400);
  assert.equal((await GET(request('todos',{pagina_leads:'-20'}))).status,400);
  const req=request();req.user.tipo='vendedor';assert.equal((await GET(req)).status,403);
});
test('Respeita empresa do usuário, mesmo se o parâmetro solicitar outra',async()=>{
  const {GET,consultas}=loadAPI();const r=await GET(request('todos',{empresa_id:'99'}));
  assert.equal(r.body.empresa_id,1);
  assert.ok(consultas.filter(x=>x.args?.[0]===1).length>0);
});
test('Os três indicadores são botões acessíveis com ação de filtro e paginação',()=>{
  const s=fs.readFileSync(page,'utf8');
  assert.equal((s.match(/<Summary icon=/g)||[]).length,3);
  assert.match(s,/aria-pressed=\{active\}/);
  assert.match(s,/function Paginacao/);
  assert.match(s,/setFiltro\(proximo\)/);
  assert.match(s,/aria-label="Filtros rápidos do atendimento"/);
});

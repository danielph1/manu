const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('ficha técnica ML: categorias diferentes geram campos obrigatórios diferentes (fetch simulado)',async()=>{
  const code=ts.transpileModule(read('lib/mercadolivre/atributos.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  const fetched=[];
  const fakeFetch=async (url)=>{
    fetched.push(url);
    return {ok:true,json:async()=>String(url).includes('MLB1763')?
      [{id:'MOTO_TYPE',name:'Tipo da moto',tags:{required:true},values:[{id:'1',name:'Scooter'}]},
       {id:'BRAND',name:'Marca',tags:{required:true}}]:
      [{id:'TRIM',name:'Versão',tags:{required:true}},
       {id:'KILOMETERS',name:'Quilometragem',tags:{required:true},value_type:'number'},
       {id:'FUEL_TYPE',name:'Combustível',tags:{required:true}},
       {id:'DOORS',name:'Portas',tags:{required:true}}]};
  };
  new Function('module','exports','fetch',code)(mod,mod.exports,fakeFetch);
  const api=mod.exports;
  assert.equal(api.categoriaVeiculo('moto'),'MLB1763');
  assert.equal(api.categoriaVeiculo('sedan'),'MLB1744');
  const m=await api.buscarAtributosML('token-teste','MLB1763');
  assert.equal(m.find(x=>x.id==='MOTO_TYPE').required,true);
  const c=await api.buscarAtributosML('token-teste','MLB1744');
  assert.equal(c.filter(x=>x.required).length,4);
  assert.equal(fetched.length,2);
  await assert.rejects(()=>api.buscarAtributosML('token-teste','MLB999'),/Categoria/);
});

test('preferências são resolvidas pelo estoque e empresa, sem aceitar empresa_id arbitrária',()=>{
  const s=read('app/api/anuncios/preferencias/route.ts');
  assert.match(s,/FROM public\.estoque_carros WHERE id=\$1/);
  assert.match(s,/Number\(user\.empresa_id\) !== Number\(carro\.empresa_id\)/);
  assert.match(s,/ON CONFLICT \(empresa_id\) DO UPDATE/);
});

test('nota interna fica no banco e bloqueia rotação atomicamente, sem chamar WhatsApp',()=>{
  const s=read('app/api/chat/route.ts');
  assert.match(s,/BEGIN/);
  assert.match(s,/FOR UPDATE/);
  assert.match(s,/rotacionar=FALSE/);
  assert.match(s,/status:'internal_only'/);
  assert.match(s,/papel==='vendedor'/);
  const r=read('app/api/leads/auto-passar/route.ts');
  assert.match(r,/COALESCE\(TRIM\(l\.comentario_interno\),''\)=''/);
  assert.match(r,/COALESCE\(l\.rotacionar,TRUE\)=TRUE/);
});

test('transferência manual respeita bloqueio; exceção exige superadmin e confirmação explícita',()=>{
  const s=read('app/api/leads/[id]/passar/route.ts');
  assert.match(s,/forcar_transferencia===true/);
  assert.match(s,/role==='superadmin'/);
  assert.match(s,/status:409/);
});

test('chat renderiza lista/conversa responsivas e notas internas separadas',()=>{
  const s=read('app/(dashboard)/chat/page.tsx');
  assert.match(s,/hidden md:flex/);
  assert.match(s,/Nota interna/);
  assert.match(s,/interno:true/);
  assert.match(s,/MidiaPrivadaAurox/);
});

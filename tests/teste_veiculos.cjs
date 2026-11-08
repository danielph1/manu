const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const source=fs.readFileSync(path.join(__dirname,'../payload/lib/aurox-veiculo-cadastro.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const context={exports:{}};vm.runInNewContext(compiled.outputText,context);
const {prepararVeiculo}=context.exports;
function valido(entrada){return prepararVeiculo({marca:'Volkswagen',modelo:'Polo',ano:2023,preco:63500,...entrada})}
const base=valido({});assert.equal(base.placa,null);assert.equal(base.detalhes.km,undefined);
assert.equal(valido({placa:'ABC1D23',km:'0'}).detalhes.km,0);
assert.equal(valido({caracteristicas:['Manual do proprietário','Manual do proprietário']}).detalhes.caracteristicas.length,1);
assert.throws(()=>valido({preco:-1}));assert.throws(()=>valido({ano:1880}));assert.throws(()=>valido({placa:'AAAA'}));
assert.throws(()=>valido({ano_modelo:'2021'}));
console.log('Validação de veículos: 8 cenários aprovados');

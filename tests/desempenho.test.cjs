const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const filename=path.join(__dirname,'../lib/desempenho/analise.ts');
const src=fs.readFileSync(filename,'utf8');
const {outputText}=ts.transpileModule(src,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const m={exports:{}};
new Function('module','exports',outputText)(m,m.exports);
const {analisarDesempenho}=m.exports;
const base={leads:0,respondidos:0,fichas:0,aprovados:0,vendas:0,maduros:0,
 vendas_maduros:0,respondidos_maduros:0,fichas_maduros:0,completude_total:0,transferidos:0};
const mk=(seller,origem,n,vendas)=>({vendedor_id:seller,vendedor:`Vendedor ${seller}`,loja:'A',origem,...base,
 leads:n,respondidos:Math.round(n*.7),fichas:Math.round(n*.4),aprovados:Math.round(n*.2),vendas,
 maduros:n,vendas_maduros:vendas,completude_total:n*75});
const vendedores=[1,2,3,4,5,6].map(id=>({id,nome:`Vendedor ${id}`,loja:'A'}));
test('sem dados: nenhum resultado inventado, taxa nula',()=>{
 const r=analisarDesempenho([],vendedores.slice(0,1));assert.equal(r.total.leads,0);
 assert.equal(r.funil.venda,null);assert.equal(r.vendedores[0].confianca,'limitada');
});
test('totais, etapas e completude consistentes',()=>{
 const r=analisarDesempenho([mk(1,'OLX',20,2),mk(2,'Site',20,4)],vendedores.slice(0,2));
 assert.equal(r.total.leads,40);assert.equal(r.total.vendas,6);
 assert.equal(r.funil.venda,.15);assert.equal(r.origens.length,2);
 assert.equal(r.vendedores.find(x=>x.id===1).qualidade_cadastral,75);
});
test('comparação exclui o próprio vendedor da base e ajusta a origem',()=>{
 const rows=[mk(1,'Canal A',35,1),mk(2,'Canal A',35,10),mk(3,'Canal B',35,10),mk(4,'Canal B',35,10)];
 const r=analisarDesempenho(rows,vendedores.slice(0,4));const a=r.vendedores.find(x=>x.id===1);
 assert.equal(a.confianca,'comparavel');assert.ok(a.esperado_mesma_origem>=9.9);
 assert.match(a.sinal,/abaixo de pares/);
 const b=r.vendedores.find(x=>x.id===3);
 assert.equal(b.por_origem.length,1); assert.ok(b.cobertura_comparacao>=1);
});
test('sem pares suficientes não identifica culpado',()=>{
 const r=analisarDesempenho([mk(1,'Único canal',30,0)],vendedores.slice(0,1));
 assert.equal(r.vendedores[0].confianca,'limitada'); assert.match(r.vendedores[0].sinal,/Sem amostra/);
 assert.match(r.origens[0].sinal,/Amostra insuficiente/);
});
test('fonte fraca requer volume e múltiplos vendedores',()=>{
 const rows=[mk(1,'Canal fraco',25,0),mk(2,'Canal fraco',25,1),mk(3,'Canal fraco',25,1),
  mk(4,'Canal forte',25,8),mk(5,'Canal forte',25,9),mk(6,'Canal forte',25,8)];
 const r=analisarDesempenho(rows,vendedores);assert.match(r.origens.find(x=>x.origem==='Canal fraco').sinal,/inferior/);
});
test('lead transferido aparece em alerta, sem indicar mérito exclusivo',()=>{
 const a=mk(1,'OLX',40,5);a.transferidos=4;
 const r=analisarDesempenho([a,mk(2,'OLX',40,4)],vendedores.slice(0,2));
 assert.ok(r.diagnosticos.some(d=>d.includes('transferência')));
});

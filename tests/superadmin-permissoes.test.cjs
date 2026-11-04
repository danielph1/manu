/** Teste local: npm run test:permissoes (sem conexão com o banco). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(base, f), 'utf8');
function loadTs(file) {
  const code = ts.transpileModule(read(file), {fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports,require:()=>({}),console,process:{env:{NODE_ENV:'development'}}});
  return exports;
}
const {can} = loadTs('lib/session.ts');
const {Role} = loadTs('lib/roles.ts');
const admin = {tipo:'admin',id:2,empresa_id:7,vendedor_id:23,loja:'001',ativo:true};
const superadmin = {...admin,tipo:'superadmin',empresa_id:null,vendedor_id:null};
let checks = 0;
for (const [name,fn] of Object.entries(can)) {
  if (typeof fn === 'function' && fn(admin)) {
    assert.equal(fn(superadmin),true,`superadmin deveria herdar ${name}`);
    checks++;
  }
}
for (const [name,fn] of Object.entries(Role)) {
  if (typeof fn === 'function' && fn(admin,23)) {
    assert.equal(fn(superadmin,23),true,`frontend deveria herdar ${name}`);
    checks++;
  }
}
assert.equal(can.editarFichasBanco(superadmin),true);
assert.equal(Role.editarFichaBanco(superadmin),true);
assert.equal(Role.editarLead(superadmin,777),true);
assert.match(read('app/api/leads/route.ts'),/empresa_id[\s\S]*getPool\(\)\.connect\(\)/);
assert.match(read('app/api/leads/route.ts'),/INSERT INTO public\.fichas_credito/);
assert.match(read('lib/lead-access.ts'),/export const podeAcessarLead = leadAcessivel/);
const feed = ['app/api/feed/route.ts','app/api/feed/[id]/route.ts','app/api/feed/[id]/comentarios/route.ts','app/api/feed/[id]/like/route.ts','app/api/feed/[id]/view/route.ts','app/api/feed/upload-ticket/route.ts'];
for (const f of feed) { assert.match(read(f),/superadmin/,`feed não protegido: ${f}`); checks++; }
console.log(`OK: ${checks+5} verificações de permissões, vínculos e restrição do feed.`);

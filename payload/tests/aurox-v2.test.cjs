const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
let packageRoot=path.resolve(__dirname,'..');
// Pode ser executado no pacote V2 (tests/ ou payload/tests/) OU depois de instalado no MANU.
if(!fs.existsSync(path.join(packageRoot,'aplicar_v2.py')) && fs.existsSync(path.join(packageRoot,'..','aplicar_v2.py')))packageRoot=path.resolve(packageRoot,'..');
const root=fs.existsSync(path.join(packageRoot,'payload','lib','auditoria.ts'))?path.join(packageRoot,'payload'):packageRoot;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('navegação inferior não reaparece com pequenos deslocamentos',()=>{
 const s=read('components/bottom-nav.tsx');assert.match(s,/accumulatedUp>92/);assert.match(s,/accumulatedDown>20/);
});
test('painel permite mover diretamente e em massa',()=>{
 const file=path.join(root,'app/(dashboard)/painel/page.tsx');const inst=path.join(packageRoot,'aplicar_v2.py');
 const s=fs.existsSync(file)?fs.readFileSync(file,'utf8'):fs.readFileSync(inst,'utf8');
 assert.match(s,/Enviar ao Follow Up/);assert.match(s,/moverLeadsParaFollowUp\(selecionados\)/);
});
test('vendedor movimenta apenas os leads da própria carteira e empresa',()=>{
 const s=read('app/api/follow-up/mover/route.ts');assert.match(s,/v\.empresa_id=\$2/);assert.match(s,/l\.vendedor_id=\$3/);assert.match(s,/rows.length!==ids.length/);assert.match(s,/ROLLBACK/);
});
test('histórico apenas para gerência, marketing e admins e escopo da empresa',()=>{
 const s=read('app/api/auditoria/route.ts');assert.match(s,/\['gerente','marketing','admin','superadmin'\]/);assert.match(s,/a\.empresa_id=\$\$\{params.length\}/);
});
test('auditoria protege conteúdo privado de cliente',()=>{
 const s=read('lib/auditoria.ts');assert.match(s,/CAMPOS_SEGUROS/);assert.doesNotMatch(s,/new Set\(\[[^\]]*cpf/);assert.match(s,/await db.query/);
});
test('cadastro de cargos exige dados pessoais completos',()=>{
 const s=read('lib/identidade-cargos.ts');for(const x of ['gerente','admin','marketing','documentista'])assert.match(s,new RegExp(`'${x}'`));
});
test('RLS e auditoria de edições de lead no PostgreSQL',()=>{
 const s=read('supabase/migrations/202611080002_auditoria_e_cadastro.sql');assert.match(s,/REVOKE ALL ON public\.aurox_auditoria_acessos/);assert.match(s,/CREATE TRIGGER aurox_audit_lead_update_trg/);
});
test('rota de login destaca recuperação de senha',()=>{
 const file=path.join(root,'app/login/page.tsx');const inst=path.join(packageRoot,'aplicar_v2.py');
 const s=fs.existsSync(file)?fs.readFileSync(file,'utf8'):fs.readFileSync(inst,'utf8');assert.match(s,/recuperar-senha/);
});

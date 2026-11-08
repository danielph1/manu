const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Follow Up: exige escopo por empresa e vendedor',()=>{
 const route=read('app/api/follow-up/route.ts');
 assert.match(route,/u\.tipo==='vendedor'/);assert.match(route,/l\.vendedor_id=\$\$\{/);
 assert.match(route,/empresa_id=\$1/);
 assert.match(route,/followup_optin/);
});
test('Campanhas: consentimento, conversa recente, limite e período de repetição',()=>{
 const route=read('app/api/follow-up/campanhas/route.ts');
 for(const value of ['followup_optin=TRUE','followup_optout_em IS NULL',"interval '24 hours'","interval '7 days'",'30-Number','confirmado']) assert.ok(route.includes(value),value);
 assert.match(route,/FOR UPDATE|pg_advisory_xact_lock/);
});
test('Dispatcher: envio não automático em erro incerto e horário definido',()=>{
 const route=read('app/api/cron/follow-up/route.ts');
 assert.ok(route.includes('America/Sao_Paulo'));
 assert.ok(route.includes("estado='erro'"));
 assert.ok(route.includes('sendAuroxMessage'));
 assert.ok(route.includes('followup_optout_em IS NULL'));
});
test('Equipe e indicadores: escopo de tenant e sem fallback permissivo',()=>{
 const eq=read('app/api/equipe/route.ts');
 assert.ok(eq.includes('v.empresa_id='));
 assert.ok(!eq.includes('SELECT v.id,v.nome,v.loja FROM public.vendedores v ORDER BY'));
 const stats=read('app/api/leads/stats/route.ts');
 assert.ok(stats.includes('v.empresa_id=$1'));
 assert.ok(stats.includes("q.get('loja')"));
 assert.ok(stats.includes("q.get('vendedor_id')"));
});
test('Transferências: só registros vinculados à empresa',()=>{
 const p=read('app/api/processos/route.ts');
 assert.ok(p.includes('p.empresa_id IS NOT NULL'));
 assert.ok(p.includes('fat2.empresa_id=p.empresa_id'));
 assert.ok(!p.includes('SELECT p.*,'));
});
test('Redefinição: token único com expiração e senha hash',()=>{
 const sql=read('supabase/migrations/202611080001_followup_recovery.sql');
 assert.ok(sql.includes('token_hash text NOT NULL UNIQUE'));
 const reset=read('app/api/auth/redefinir-senha/route.ts');
 assert.ok(reset.includes('hashPassword(senha)'));
 assert.ok(reset.includes('t.usado_em IS NULL'));
 assert.ok(reset.includes('t.expira_em>now()'));
});
test('Sidebar: navegação agrupada e Documental retirado',()=>{
 const nav=read('components/sidebar-nav.tsx');
 for(const label of ['Leads e atendimento','Comercial e resultados','Operação','Administração']) assert.ok(nav.includes(label));
 assert.ok(nav.includes('/follow-up'));
 assert.ok(!nav.includes("href:'/documental'"));
});

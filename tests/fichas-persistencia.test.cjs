/** Verificações estáticas do contrato de persistência (sem banco remoto). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const servidor = read('app/api/fichas/[id]/route.ts');
const tela = read('components/ficha-edit-dialog.tsx');
const lead = read('app/api/leads/route.ts');
const painel = read('app/(dashboard)/painel/page.tsx');
const migration = read('supabase/migrations/202611040002_fichas_persistencia.sql');
const testes = [
  ['salvamento transacional', /await db.query\('BEGIN'\)/.test(servidor) && /await db.query\('ROLLBACK'\)/.test(servidor)],
  ['atualiza ficha', /UPDATE public.fichas_credito SET/.test(servidor)],
  ['bancos com chave idempotente', /ON CONFLICT \(ficha_id,client_key\)/.test(servidor)],
  ['remove bancos excluídos', /DELETE FROM public.ficha_bancos WHERE ficha_id/.test(servidor)],
  ['observação e etapas persistidas', /observacao_elfenai.*etapa_obs/.test(servidor)],
  ['financiamento persistido', /fin_parcelas.*fin_valor_parcela/.test(servidor)],
  ['notifica vendedor', /usuario_ids:\[destino.id\]/.test(servidor)],
  ['auto-salvamento', /setTimeout\(\(\) => \{\s*persistirRascunho/.test(tela)],
  ['salva ao fechar', /async function fecharSalvando/.test(tela)],
  ['orientações do banco legíveis para vendedor', /Orientação do setor bancário/.test(tela)],
  ['novo lead pendente', /status_geral\)\s*VALUES/.test(lead)],
  ['recusa só com decisão da ficha', /status_ficha/.test(painel)],
  ['migration default pendente', /SET DEFAULT 'pendente'/.test(migration)],
  ['migration cliente único por banco', /uq_manu_ficha_banco_client_key/.test(migration)],
  ['migration inclui gerente_nome', /faturamentos ADD COLUMN IF NOT EXISTS gerente_nome/.test(migration)],
];
for(const [nome, ok] of testes){ assert.ok(ok, nome); console.log('✔', nome); }
console.log(`${testes.length} verificações estáticas aprovadas. Não substituem teste com Supabase.`);

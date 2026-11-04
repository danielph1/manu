-- Diagnóstico somente leitura (sem registros pessoais, senhas ou valores financeiros).
-- Execute no SQL Editor Supabase. Mostra inventário, colunas e restrições das fontes das Métricas.
-- 1: fontes presentes/ausentes
WITH esperadas(nome) AS (VALUES
 ('empresas'),('lojas'),('usuarios'),('vendedores'),('leads'),('triagem'),('origens_lead'),
 ('fichas_credito'),('ficha_bancos'),('faturamentos'),('estoque_carros'),('oficina_carros'),
 ('manu_integracoes'),('manu_integracao_eventos'),('manu_atendimento_transferencias'),
 ('manu_movimentos_caixa')
)
SELECT e.nome AS tabela, CASE WHEN t.table_name IS NULL THEN 'AUSENTE' ELSE 'PRESENTE' END AS situacao
FROM esperadas e LEFT JOIN information_schema.tables t
 ON t.table_schema='public' AND t.table_name=e.nome ORDER BY e.nome;

-- 2: todos os tipos de colunas necessários, inclusive finance/bancos/integrações.
SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
 AND table_name IN ('empresas','lojas','usuarios','vendedores','leads','triagem','origens_lead',
 'fichas_credito','ficha_bancos','faturamentos','estoque_carros','oficina_carros',
 'manu_integracoes','manu_integracao_eventos','manu_atendimento_transferencias','manu_movimentos_caixa')
ORDER BY table_name,ordinal_position;

-- 3: chaves estrangeiras/restrições (sem valores sensíveis).
SELECT c.relname AS tabela, con.conname AS restricao,
       pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=c.relnamespace
WHERE ns.nspname='public' AND c.relname IN ('leads','triagem','fichas_credito','ficha_bancos',
 'faturamentos','manu_movimentos_caixa','vendedores','empresas')
ORDER BY tabela,restricao;

-- 4: cobertura de informações de classificação, sem retornar dados de clientes.
SELECT table_name,
 MAX(CASE WHEN column_name='empresa_id' THEN 1 ELSE 0 END) AS tem_empresa_id,
 MAX(CASE WHEN column_name='loja' THEN 1 ELSE 0 END) AS tem_loja,
 MAX(CASE WHEN column_name='created_at' THEN 1 ELSE 0 END) AS tem_data_criacao,
 MAX(CASE WHEN column_name='data_venda' THEN 1 ELSE 0 END) AS tem_data_venda,
 MAX(CASE WHEN column_name='carroceria' THEN 1 ELSE 0 END) AS tem_carroceria
FROM information_schema.columns WHERE table_schema='public' AND table_name IN
 ('leads','triagem','fichas_credito','ficha_bancos','faturamentos','estoque_carros','manu_movimentos_caixa')
GROUP BY table_name ORDER BY table_name;

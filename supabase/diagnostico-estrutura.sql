-- Somente leitura; execute no Supabase e confira os TIPOS das colunas, sem exportar senhas/dados.
SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('empresas','usuarios','vendedores','triagem','leads','origens_lead')
ORDER BY table_name,ordinal_position;

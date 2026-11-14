-- MANU: novas atribuicoes SOMENTE a contas ativas com cargo vendedor, sempre mesma empresa.
-- Nao reatribui nenhum lead historico e nao remove dados. Testar em homologacao.
-- Requer as tabelas public.empresas, public.vendedores, public.usuarios e public.leads.
BEGIN;
CREATE OR REPLACE FUNCTION public.manu_validar_destino_lead() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.vendedor_id IS NOT DISTINCT FROM OLD.vendedor_id
       AND NEW.empresa_id IS NOT DISTINCT FROM OLD.empresa_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.empresa_id IS NULL OR NEW.vendedor_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.vendedores v
      JOIN public.usuarios u ON u.vendedor_id=v.id AND u.empresa_id=v.empresa_id
      JOIN public.empresas e ON e.id=v.empresa_id
      WHERE v.id=NEW.vendedor_id AND v.empresa_id=NEW.empresa_id
        AND COALESCE(v.ativo,FALSE)=TRUE AND COALESCE(e.ativo,FALSE)=TRUE
        AND LOWER(u.tipo)='vendedor' AND COALESCE(u.ativo,FALSE)=TRUE
        AND LOWER(COALESCE(u.status,'ativo'))='ativo'
    ) THEN
    RAISE EXCEPTION 'Lead deve pertencer a vendedor ativo da mesma empresa'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS manu_destino_vendedor_ativo ON public.leads;
CREATE TRIGGER manu_destino_vendedor_ativo
  BEFORE INSERT OR UPDATE OF vendedor_id,empresa_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.manu_validar_destino_lead();
COMMIT;

-- Diagnosticos de somente leitura. Antigos inconsistentes NAO sao alterados.
SELECT l.id,l.empresa_id,l.vendedor_id,v.empresa_id AS empresa_do_vendedor
FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
WHERE l.empresa_id IS NULL OR v.empresa_id IS NULL OR l.empresa_id IS DISTINCT FROM v.empresa_id
ORDER BY l.id LIMIT 50;
SELECT v.id,v.nome,v.empresa_id,v.loja,v.ativo,
 EXISTS(SELECT 1 FROM public.usuarios u WHERE u.vendedor_id=v.id AND u.empresa_id=v.empresa_id
   AND LOWER(u.tipo)='vendedor' AND COALESCE(u.ativo,FALSE) AND LOWER(COALESCE(u.status,'ativo'))='ativo') AS usuario_vendedor_ativo
FROM public.vendedores v ORDER BY v.id;

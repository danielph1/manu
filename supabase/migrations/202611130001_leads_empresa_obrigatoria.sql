-- MANU / AUROX · Reconciliação conservadora de leads sem empresa.
-- Execute em SQL Editor como administrador após criar backup do banco.
-- Não atribui leads a empresas por telefone, nome ou loja (não são identificadores confiáveis).
-- Usa SOMENTE o vendedor associado quando o vendedor possui empresa definida.

BEGIN;

-- Corrige os casos legados inequívocos: vendedor único, já vinculado à empresa.
UPDATE public.leads AS l
SET empresa_id = v.empresa_id
FROM public.vendedores AS v
WHERE l.empresa_id IS NULL
  AND l.vendedor_id = v.id
  AND v.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.triagem t
    WHERE t.lead_id = l.id
      AND t.empresa_id IS NOT NULL
      AND t.empresa_id <> v.empresa_id
  );

-- Torna obrigatória a empresa em todas as novas inserções/atualizações.
-- NOT VALID permite manter antigos registros ambíguos sem atribuí-los à empresa errada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'manu_leads_empresa_obrigatoria'
  ) THEN
    ALTER TABLE public.leads
    ADD CONSTRAINT manu_leads_empresa_obrigatoria
      CHECK (empresa_id IS NOT NULL AND empresa_id > 0) NOT VALID;
  END IF;
END $$;

-- Impede novos vínculos com vendedor de outra empresa.
CREATE OR REPLACE FUNCTION public.manu_validar_lead_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE vendedor_empresa bigint;
BEGIN
  IF NEW.empresa_id IS NULL OR NEW.empresa_id <= 0 THEN
    RAISE EXCEPTION 'Lead precisa estar associado a uma empresa válida'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.vendedor_id IS NOT NULL THEN
    SELECT empresa_id INTO vendedor_empresa
    FROM public.vendedores WHERE id = NEW.vendedor_id;
    IF vendedor_empresa IS NULL OR vendedor_empresa <> NEW.empresa_id THEN
      RAISE EXCEPTION 'Empresa e vendedor do lead não correspondem'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS manu_validar_lead_empresa_trigger ON public.leads;
CREATE TRIGGER manu_validar_lead_empresa_trigger
BEFORE INSERT OR UPDATE OF empresa_id, vendedor_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.manu_validar_lead_empresa();

COMMIT;

-- Diagnóstico final. Se total_sem_empresa = 0, valide o CHECK com:
-- ALTER TABLE public.leads VALIDATE CONSTRAINT manu_leads_empresa_obrigatoria;
SELECT COUNT(*) AS total_sem_empresa
FROM public.leads
WHERE empresa_id IS NULL;

-- Revisão manual SOMENTE para superadmin / SQL Editor se restarem órfãos:
SELECT l.id, l.vendedor_id, v.empresa_id AS empresa_do_vendedor
FROM public.leads l
LEFT JOIN public.vendedores v ON v.id = l.vendedor_id
WHERE l.empresa_id IS NULL
ORDER BY l.id;

-- Quando restarem registros sem vendedor/empresa, NÃO execute UPDATE global
-- atribuindo tudo à Nina ou a qualquer loja. Verifique a origem e o vínculo correto.

-- Isolamento multiempresa para metas (inclui metas criadas pelo superadmin Aurox).
-- Não atribui metas ambíguas a uma empresa sem confirmar os vínculos.
BEGIN;
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS empresa_id integer;
UPDATE public.metas m
   SET empresa_id = COALESCE(
       (SELECT c.empresa_id FROM public.usuarios c WHERE c.id=m.criado_por_id
           AND LOWER(c.tipo)<>'superadmin'
           AND (m.destinatario_id IS NULL OR EXISTS (
             SELECT 1 FROM public.usuarios d WHERE d.id=m.destinatario_id AND d.empresa_id=c.empresa_id))),
       (SELECT d.empresa_id FROM public.usuarios d
          JOIN public.usuarios c ON c.id=m.criado_por_id AND LOWER(c.tipo)='superadmin'
        WHERE d.id=m.destinatario_id)
   )
 WHERE m.empresa_id IS NULL;
CREATE INDEX IF NOT EXISTS metas_empresa_idx ON public.metas(empresa_id,created_at DESC);
COMMIT;

-- Aurox v16: preferências de localização e WhatsApp por empresa, sem compartilhamento entre clientes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manu_anuncios_preferencias (
  empresa_id integer PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  telefone_whatsapp varchar(20) NOT NULL DEFAULT '',
  estado_ml_id varchar(120) NOT NULL DEFAULT '',
  cidade_ml_id varchar(120) NOT NULL DEFAULT '',
  atualizado_por integer,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manu_anuncios_preferencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_anuncios_preferencias FROM anon, authenticated;
-- Corrige notas internas registradas antes da v16: também impedem a redistribuição.
DO $aurox$
BEGIN
  IF to_regclass('public.chat_geral_mensagens') IS NOT NULL THEN
    UPDATE public.leads l SET rotacionar=FALSE
    WHERE l.vendedor_id IS NOT NULL AND COALESCE(l.rotacionar,TRUE)=TRUE
      AND (COALESCE(TRIM(l.comentario_interno),'')<>'' OR EXISTS (
        SELECT 1 FROM public.chat_geral_mensagens m
        WHERE m.lead_id=l.id AND m.mensagem LIKE '[interno]%'
      ));
  ELSE
    UPDATE public.leads l SET rotacionar=FALSE
    WHERE l.vendedor_id IS NOT NULL AND COALESCE(l.rotacionar,TRUE)=TRUE
      AND COALESCE(TRIM(l.comentario_interno),'')<>'';
  END IF;
END;
$aurox$;
COMMIT;

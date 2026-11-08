-- AUROX V4 — Consentimentos evidenciados por empresa e completude de cadastro.
-- Requer migrações anteriores 202611080001 e 202611080002.
-- Teste em homologação com duas empresas antes de aplicar na produção.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;
CREATE TABLE IF NOT EXISTS public.aurox_followup_permissoes (
 id bigserial PRIMARY KEY,
 empresa_id integer NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
 lead_id integer NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
 finalidade text NOT NULL CHECK(finalidade IN ('promocoes','novidades','retorno_comercial')),
 canal text NOT NULL CHECK(canal IN ('whatsapp','presencial','ligacao','formulario','outro')),
 consentido_em timestamptz NOT NULL,
 evidencia text NOT NULL CHECK(length(evidencia) BETWEEN 15 AND 1000),
 registrado_por integer NOT NULL REFERENCES public.usuarios(id),
 registrado_em timestamptz NOT NULL DEFAULT now(),
 revogado_em timestamptz,
 revogado_por integer REFERENCES public.usuarios(id),
 CONSTRAINT aurox_followup_revogacao_consistente CHECK ((revogado_em IS NULL AND revogado_por IS NULL) OR (revogado_em IS NOT NULL AND revogado_por IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS aurox_fu_permissoes_empresa_lead ON public.aurox_followup_permissoes(empresa_id,lead_id,registrado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS aurox_fu_permissao_ativa_unica ON public.aurox_followup_permissoes(empresa_id,lead_id) WHERE revogado_em IS NULL;
ALTER TABLE public.aurox_followup_permissoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aurox_followup_permissoes FROM anon,authenticated;
COMMENT ON TABLE public.aurox_followup_permissoes IS 'Evidências de autorização de campanhas, vinculadas à empresa. Dados pessoais com acesso restrito e retenção sujeita a política LGPD.';
COMMIT;

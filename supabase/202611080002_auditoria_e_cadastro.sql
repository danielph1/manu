-- AUROX V2: auditoria de acesso/mudancas e identidade de cargos.
-- Prerequisito: migration 202611080001_followup_recovery.sql. Backup e homologacao antes de producao.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS data_nascimento date;
-- OBS: nao colocar CPF ou data de nascimento em logs nem respostas publicas.
CREATE TABLE IF NOT EXISTS public.aurox_auditoria_acessos (
 id bigserial PRIMARY KEY,
 empresa_id integer REFERENCES public.empresas(id) ON DELETE RESTRICT,
 usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 tipo_usuario text NOT NULL,
 evento text NOT NULL CHECK(evento IN ('login','pagina')),
 caminho text,
 ocorreu_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurox_audit_acessos_empresa_dt ON public.aurox_auditoria_acessos(empresa_id,ocorreu_em DESC);
CREATE INDEX IF NOT EXISTS aurox_audit_acessos_usuario_dt ON public.aurox_auditoria_acessos(usuario_id,ocorreu_em DESC);
CREATE TABLE IF NOT EXISTS public.aurox_auditoria_alteracoes (
 id bigserial PRIMARY KEY,
 empresa_id integer NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
 usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 tipo_usuario text NOT NULL,
 recurso text NOT NULL CHECK(length(recurso) BETWEEN 2 AND 65),
 recurso_id bigint,
 acao text NOT NULL CHECK(acao IN ('criar','alterar','mover','recusar','restaurar','consentimento','excluir','enviar','pausar')),
 resumo text NOT NULL,
 campos text[] NOT NULL DEFAULT '{}',
 detalhes jsonb NOT NULL DEFAULT '{}',
 ocorreu_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurox_audit_alteracoes_empresa_dt ON public.aurox_auditoria_alteracoes(empresa_id,ocorreu_em DESC);
CREATE INDEX IF NOT EXISTS aurox_audit_alteracoes_usuario_dt ON public.aurox_auditoria_alteracoes(usuario_id,ocorreu_em DESC);
ALTER TABLE public.aurox_auditoria_acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurox_auditoria_alteracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aurox_auditoria_acessos,public.aurox_auditoria_alteracoes FROM anon,authenticated;
-- Auditoria transacional de alteracoes no cadastro principal dos leads.
-- Somente updates da API que incluam um novo nonce e ator autenticado acionam este gatilho.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS aurox_ultimo_editor_id integer REFERENCES public.usuarios(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS aurox_audit_nonce uuid;
CREATE OR REPLACE FUNCTION public.aurox_audit_lead_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_empresa integer; v_tipo text; v_campos text[];
BEGIN
 IF NEW.aurox_audit_nonce IS NOT DISTINCT FROM OLD.aurox_audit_nonce THEN RETURN NEW; END IF;
 IF NEW.aurox_ultimo_editor_id IS NULL THEN RAISE EXCEPTION 'Alteracao de lead sem autor de auditoria'; END IF;
 v_empresa:=NEW.empresa_id;
 IF v_empresa IS NULL THEN SELECT v.empresa_id INTO v_empresa FROM public.vendedores v WHERE v.id=NEW.vendedor_id; END IF;
 IF v_empresa IS NULL THEN RAISE EXCEPTION 'Alteracao de lead sem empresa identificada'; END IF;
 SELECT LOWER(u.tipo) INTO v_tipo FROM public.usuarios u WHERE u.id=NEW.aurox_ultimo_editor_id AND COALESCE(u.ativo,TRUE);
 IF v_tipo IS NULL THEN RAISE EXCEPTION 'Autor de auditoria nao encontrado'; END IF;
 SELECT COALESCE(array_agg(k),ARRAY[]::text[]) INTO v_campos
   FROM jsonb_object_keys(to_jsonb(NEW)) AS k
   WHERE to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k
     AND k NOT IN ('aurox_ultimo_editor_id','aurox_audit_nonce','updated_at','created_at');
 IF array_length(v_campos,1) IS NOT NULL THEN
  INSERT INTO public.aurox_auditoria_alteracoes(empresa_id,usuario_id,tipo_usuario,recurso,recurso_id,acao,resumo,campos)
    VALUES(v_empresa,NEW.aurox_ultimo_editor_id,v_tipo,'leads',NEW.id,'alterar','Cadastro de lead atualizado',v_campos);
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='aurox_audit_lead_update_trg' AND tgrelid='public.leads'::regclass) THEN
  CREATE TRIGGER aurox_audit_lead_update_trg AFTER UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.aurox_audit_lead_update();
 END IF;
END $$;
COMMIT;

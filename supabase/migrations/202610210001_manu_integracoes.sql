-- MANU / central de integrações - migração aditiva, sem apagar dados existentes.
-- Executar no SQL Editor do Supabase depois de um backup.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.manu_integracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  nome varchar(100) NOT NULL,
  plataforma varchar(50) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  token_hash char(64) NOT NULL,
  mapeamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_evento_em timestamptz,
  CONSTRAINT manu_integracoes_plataforma_chk CHECK (plataforma ~ '^[a-z][a-z0-9-]{1,39}$'),
  CONSTRAINT manu_integracoes_nome_empresa_uq UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_manu_integracoes_empresa ON public.manu_integracoes(empresa_id);

-- Os eventos também funcionam como trilha de auditoria e fila de reprocessamento futuro.
CREATE TABLE IF NOT EXISTS public.manu_integracao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL REFERENCES public.manu_integracoes(id) ON DELETE RESTRICT,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  chave_externa varchar(128) NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'processado', 'erro')),
  nome text,
  telefone text,
  email text,
  interesse text,
  payload jsonb NOT NULL,
  triagem_id bigint,
  erro text,
  CONSTRAINT manu_eventos_dedup_uq UNIQUE (integracao_id, chave_externa)
);
CREATE INDEX IF NOT EXISTS idx_manu_integracao_eventos_empresa ON public.manu_integracao_eventos(empresa_id, recebido_em DESC);

-- Mantém a fila atual, adicionando isolamento à triagem para NOVOS registros.
ALTER TABLE public.triagem ADD COLUMN IF NOT EXISTS empresa_id integer;
CREATE INDEX IF NOT EXISTS idx_manu_triagem_empresa ON public.triagem(empresa_id, status, created_at);
-- Registros antigos empresa_id=NULL precisam de atribuição manual segura antes de serem usados num SaaS.

ALTER TABLE public.manu_integracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manu_integracao_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manu_integracoes, public.manu_integracao_eventos FROM anon, authenticated;
-- Apenas backend administrativo e Edge Function (service_role) acessam essas tabelas.

-- JSON path simples configurável por plataforma, sem executar código do usuário.
CREATE OR REPLACE FUNCTION public.manu_pick(p jsonb, caminho text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN caminho ~ '^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*){0,5}$'
              THEN NULLIF(left(p #>> string_to_array(caminho, '.'), 1500), '')
              ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.manu_pick(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manu_pick(jsonb,text) TO service_role;

-- Recepção transacional + idempotente. Chamada exclusivamente com credencial service_role
-- pela Edge Function e com token de webhook validado também no banco.
CREATE OR REPLACE FUNCTION public.manu_receber_webhook(
  p_integracao uuid, p_token text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  cfg public.manu_integracoes%ROWTYPE;
  mapa jsonb;
  chave text;
  nome text; fone text; mail text; interesse text; mensagem text; origem text;
  eid uuid; tid bigint;
BEGIN
  SELECT i.* INTO cfg FROM public.manu_integracoes i
   JOIN public.empresas e ON e.id=i.empresa_id
   WHERE i.id = p_integracao AND i.ativo = TRUE AND e.ativo = TRUE;
  IF NOT FOUND OR p_token IS NULL OR length(p_token) <> 64 OR
     cfg.token_hash <> encode(digest(p_token, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'webhook não autorizado' USING ERRCODE = '28000';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 130000 THEN
    RAISE EXCEPTION 'payload inválido' USING ERRCODE = '22023';
  END IF;
  mapa := cfg.mapeamento;
  nome := COALESCE(public.manu_pick(p_payload, mapa->>'nome'), p_payload->>'name', p_payload->>'nome', p_payload #>> '{lead,name}');
  fone := COALESCE(public.manu_pick(p_payload, mapa->>'telefone'), p_payload->>'phone', p_payload->>'telefone', p_payload #>> '{lead,phone}');
  mail := COALESCE(public.manu_pick(p_payload, mapa->>'email'), p_payload->>'email', p_payload #>> '{lead,email}');
  interesse := COALESCE(public.manu_pick(p_payload, mapa->>'interesse'), p_payload #>> '{adsInfo,subject}', p_payload->>'interesse', p_payload->>'listId', p_payload->>'linkAd');
  mensagem := COALESCE(public.manu_pick(p_payload, mapa->>'mensagem'), p_payload->>'message', p_payload->>'mensagem', 'Novo contato');
  IF nullif(trim(COALESCE(nome, '')), '') IS NULL AND
     nullif(trim(COALESCE(fone, '')), '') IS NULL AND
     nullif(trim(COALESCE(mail, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lead sem nome, telefone ou e-mail' USING ERRCODE = '22023';
  END IF;
  nome := left(COALESCE(nullif(trim(nome), ''), 'Sem nome'), 200);
  fone := left(COALESCE(fone, ''), 50);
  mail := left(COALESCE(mail, ''), 254);
  interesse := left(COALESCE(interesse, ''), 500);
  mensagem := left(mensagem, 2000);
  origem := left(cfg.plataforma, 50);

  chave := COALESCE(public.manu_pick(p_payload, mapa->>'id_externo'), p_payload->>'externalId', p_payload->>'eventId', p_payload->>'id');
  IF nullif(trim(chave), '') IS NULL THEN
    chave := encode(digest(p_payload::text, 'sha256'), 'hex');
  END IF;
  chave := left(chave, 128);

  INSERT INTO public.manu_integracao_eventos
    (integracao_id, empresa_id, chave_externa, nome, telefone, email, interesse, payload)
  VALUES (cfg.id, cfg.empresa_id, chave, nome, fone, mail, interesse, p_payload)
  ON CONFLICT (integracao_id, chave_externa) DO NOTHING RETURNING id INTO eid;

  IF eid IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true);
  END IF;
  -- Cria fila da MESMA empresa. Nunca escolhe vendedor aqui: decisão segura é feita na triagem.
  INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem, empresa_id)
  VALUES (nome, fone, mail, interesse, origem, mensagem, cfg.empresa_id)
  RETURNING id INTO tid;
  UPDATE public.manu_integracao_eventos
    SET status='processado', triagem_id=tid WHERE id=eid;
  UPDATE public.manu_integracoes SET ultimo_evento_em=now() WHERE id=cfg.id;
  RETURN jsonb_build_object('ok', true, 'duplicado', false, 'responseId', eid, 'triagem_id', tid);
END;
$$;
REVOKE ALL ON FUNCTION public.manu_receber_webhook(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manu_receber_webhook(uuid,text,jsonb) TO service_role;


-- Garante status padrão em triagem (se coluna existir sem default)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='triagem' AND column_name='status'
  ) THEN
    ALTER TABLE public.triagem ALTER COLUMN status SET DEFAULT 'aguardando';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Se status for obrigatório e NULL em linhas antigas, não mexe. Só novos inserts usam default.

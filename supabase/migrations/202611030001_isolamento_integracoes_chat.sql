-- MANU / Aurox 2026-11-03 - isolamento da mensageria e integracoes
-- IMPORTANTE: fazer backup antes. Não move leads nem conexões entre empresas automaticamente.
-- 1. Relaciona leads à empresa e recupera os vínculos que já são conhecidos por vendedor.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS empresa_id integer REFERENCES public.empresas(id);
UPDATE public.leads AS l SET empresa_id = v.empresa_id
  FROM public.vendedores AS v
 WHERE l.vendedor_id = v.id AND l.empresa_id IS NULL AND v.empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS manu_leads_empresa_idx ON public.leads (empresa_id, id DESC);

-- 2. Chat interno/arquivos. Não altera mensagens existentes.
CREATE TABLE IF NOT EXISTS public.chat_geral_mensagens (
  id bigserial PRIMARY KEY, remetente_id integer REFERENCES public.usuarios(id),
  lead_id integer REFERENCES public.leads(id), mensagem text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_geral_mensagens ADD COLUMN IF NOT EXISTS arquivo_nome text;
ALTER TABLE public.chat_geral_mensagens ADD COLUMN IF NOT EXISTS arquivo_mime text;
ALTER TABLE public.chat_geral_mensagens ADD COLUMN IF NOT EXISTS arquivo_bytes bytea;
CREATE INDEX IF NOT EXISTS chat_geral_lead_data_idx ON public.chat_geral_mensagens(lead_id, created_at);

-- 3. Idempotência da Z-API por conexão empresarial.
CREATE TABLE IF NOT EXISTS public.manu_zapi_eventos (
  id bigserial PRIMARY KEY,
  conexao_id uuid NOT NULL REFERENCES public.manu_conexoes_oauth(id) ON DELETE CASCADE,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  mensagem_id text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manu_zapi_conexao_mensagem_unq UNIQUE (conexao_id, mensagem_id)
);
CREATE INDEX IF NOT EXISTS manu_zapi_eventos_empresa_idx ON public.manu_zapi_eventos(empresa_id, criado_em DESC);
REVOKE ALL ON TABLE public.manu_zapi_eventos FROM anon, authenticated;


-- 3b. Evita criar o mesmo lead Meta duas vezes se o provedor repetir o evento.
CREATE TABLE IF NOT EXISTS public.manu_meta_eventos (
  id bigserial PRIMARY KEY, empresa_id integer NOT NULL REFERENCES public.empresas(id),
  origem text NOT NULL, external_id text NOT NULL,
  triagem_id bigint, criado_em timestamptz DEFAULT now(),
  CONSTRAINT manu_meta_empresa_evento_unq UNIQUE (empresa_id, origem, external_id)
);
REVOKE ALL ON TABLE public.manu_meta_eventos FROM anon, authenticated;

-- 4. Auditoria: contas externas vinculadas a mais de uma empresa.
-- NÃO escolhemos automaticamente uma 'dona': há que reconectar separadamente.
CREATE OR REPLACE VIEW public.manu_auditoria_contas_compartilhadas AS
SELECT provedor, external_id, COUNT(DISTINCT empresa_id) AS empresas,
       ARRAY_AGG(DISTINCT empresa_id ORDER BY empresa_id) AS empresas_ids
  FROM public.manu_conexoes_oauth
 WHERE status='conectado' AND external_id IS NOT NULL AND external_id<>''
   AND provedor IN ('meta_facebook','meta_instagram','whatsapp_cloud','whatsapp_qr','mercadolivre','olx')
 GROUP BY provedor, external_id HAVING COUNT(DISTINCT empresa_id)>1;
REVOKE ALL ON public.manu_auditoria_contas_compartilhadas FROM anon, authenticated;

-- 5. Impede NOVOS vínculos ativos cruzados, se não houver duplicidade anterior.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.manu_conexoes_oauth
    WHERE status='conectado' AND external_id IS NOT NULL AND external_id<>''
      AND provedor IN ('meta_facebook','meta_instagram','whatsapp_cloud','whatsapp_qr','mercadolivre','olx')
    GROUP BY provedor, external_id HAVING COUNT(*)>1
  ) THEN
    RAISE NOTICE 'ATENÇÃO: há contas externas conectadas mais de uma vez. Regularize os vínculos antes de criar o índice exclusivo.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS manu_oauth_instancia_exclusiva
      ON public.manu_conexoes_oauth(provedor, external_id)
      WHERE status='conectado' AND external_id IS NOT NULL AND external_id <> ''
        AND provedor IN ('meta_facebook','meta_instagram','whatsapp_cloud','whatsapp_qr','mercadolivre','olx');
  END IF;
END $$;

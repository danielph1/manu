-- AUROX / MANU: Financas com compromissos, parcelas, auditoria e mensalidade de plataforma.
-- PREREQUISITO: 202611040001_metricas_caixa.sql e 202611140001_atendimento_e_oficina.sql.
-- Execute uma unica vez em homologacao, com backup. NAO marca faturamentos como recebidos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manu_fin_agendamentos (
 id bigserial PRIMARY KEY,
 empresa_id integer NOT NULL REFERENCES public.empresas(id),
 loja varchar(40),
 tipo varchar(8) NOT NULL CHECK (tipo IN ('entrada','saida')),
 categoria varchar(80) NOT NULL,
 descricao text NOT NULL DEFAULT '',
 forma text NOT NULL DEFAULT 'outro' CHECK (forma IN ('boleto','pix','dinheiro','cartao','transferencia','outro')),
 lead_id integer REFERENCES public.leads(id),
 valor numeric(14,2),
 inicio date NOT NULL,
 frequencia varchar(10) NOT NULL DEFAULT 'unica' CHECK (frequencia IN ('unica','mensal')),
 repeticoes integer CHECK (repeticoes IS NULL OR (repeticoes >= 1 AND repeticoes <= 240)),
 origem varchar(10) NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','aurox')),
 ativo boolean NOT NULL DEFAULT TRUE,
 criado_por integer REFERENCES public.usuarios(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT manu_fin_valor_check CHECK ((origem='aurox' AND tipo='saida') OR (origem='manual' AND valor IS NOT NULL AND valor>0)),
 CONSTRAINT manu_fin_sem_recorrencia_unica CHECK (frequencia='mensal' OR repeticoes IS NULL OR repeticoes=1),
 CONSTRAINT manu_fin_aurox_formato CHECK (origem='manual' OR (frequencia='mensal' AND categoria='Assinatura Aurox' AND forma='boleto' AND lead_id IS NULL AND repeticoes IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS manu_fin_aurox_empresa_unica
 ON public.manu_fin_agendamentos(empresa_id) WHERE origem='aurox';
CREATE INDEX IF NOT EXISTS manu_fin_agenda_empresa ON public.manu_fin_agendamentos(empresa_id,ativo,inicio);

CREATE TABLE IF NOT EXISTS public.manu_fin_parcelas (
 id bigserial PRIMARY KEY,
 agendamento_id bigint NOT NULL REFERENCES public.manu_fin_agendamentos(id),
 empresa_id integer NOT NULL REFERENCES public.empresas(id),
 numero integer NOT NULL CHECK (numero>=1),
 vencimento date NOT NULL,
 valor numeric(14,2),
 status varchar(12) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
 pago_em date,
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agendamento_id,numero),
 CHECK (status<>'pago' OR (pago_em IS NOT NULL AND valor IS NOT NULL AND valor>0))
);
CREATE INDEX IF NOT EXISTS manu_fin_parcelas_empresa_venc ON public.manu_fin_parcelas(empresa_id,vencimento,status);

CREATE TABLE IF NOT EXISTS public.manu_fin_alertas (
 id bigserial PRIMARY KEY,
 empresa_id integer NOT NULL REFERENCES public.empresas(id),
 parcela_id bigint NOT NULL REFERENCES public.manu_fin_parcelas(id),
 classe varchar(15) NOT NULL CHECK (classe IN ('antes','vence_hoje','atraso')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(parcela_id,classe)
);
CREATE INDEX IF NOT EXISTS manu_fin_alertas_empresa ON public.manu_fin_alertas(empresa_id,criado_em DESC);

-- Associacoes de origem validadas no servidor, com idempotencia no caixa.
CREATE UNIQUE INDEX IF NOT EXISTS manu_fin_caixa_origem_unica
 ON public.manu_movimentos_caixa(empresa_id,origem_tipo,origem_id)
 WHERE origem_tipo IN ('financas_parcela','faturamento_entrada','faturamento_financiamento');

-- O banco nao deixa modificar/deletar uma cobranca Aurox ou suas parcelas.
-- Somente rotas internas privilegiadas, depois de validar cargo, habilitam uma transacao controlada.
CREATE OR REPLACE FUNCTION public.manu_fin_proteger_aurox() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE special boolean;
BEGIN
 special := COALESCE(current_setting('aurox.finance_privileged',true),'false')='true';
 IF TG_TABLE_NAME='manu_fin_agendamentos' THEN
   IF TG_OP='DELETE' AND OLD.origem='aurox' AND NOT special THEN
     RAISE EXCEPTION 'Mensalidade Aurox e imutavel';
   END IF;
   IF TG_OP='UPDATE' AND OLD.origem='aurox' AND NOT special THEN
     RAISE EXCEPTION 'Mensalidade Aurox e imutavel';
   END IF;
   IF TG_OP='INSERT' AND NEW.origem='aurox' AND NOT special THEN
     RAISE EXCEPTION 'Mensalidade Aurox so e criada pelo servico';
   END IF;
 ELSE
   IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (
      SELECT 1 FROM public.manu_fin_agendamentos a
      WHERE a.id=OLD.agendamento_id AND a.origem='aurox'
   ) AND NOT special THEN
     RAISE EXCEPTION 'Parcela da Aurox e imutavel';
   END IF;
   IF TG_OP='INSERT' AND EXISTS (
      SELECT 1 FROM public.manu_fin_agendamentos a
      WHERE a.id=NEW.agendamento_id AND a.origem='aurox'
   ) AND NOT special THEN
     RAISE EXCEPTION 'Parcela da Aurox so e criada pelo servico';
   END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS manu_fin_proteger_agendamento ON public.manu_fin_agendamentos;
CREATE TRIGGER manu_fin_proteger_agendamento BEFORE INSERT OR UPDATE OR DELETE
 ON public.manu_fin_agendamentos FOR EACH ROW EXECUTE FUNCTION public.manu_fin_proteger_aurox();
DROP TRIGGER IF EXISTS manu_fin_proteger_parcela ON public.manu_fin_parcelas;
CREATE TRIGGER manu_fin_proteger_parcela BEFORE INSERT OR UPDATE OR DELETE
 ON public.manu_fin_parcelas FOR EACH ROW EXECUTE FUNCTION public.manu_fin_proteger_aurox();

-- Uma parcela paga gera EXATAMENTE um movimento de caixa, regravacoes atualizam a mesma origem.
CREATE OR REPLACE FUNCTION public.manu_fin_parcela_caixa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE a record;
BEGIN
 SELECT empresa_id,loja,tipo,categoria,descricao,origem INTO a
 FROM public.manu_fin_agendamentos WHERE id=NEW.agendamento_id;
 IF a.empresa_id IS NULL OR a.empresa_id<>NEW.empresa_id THEN RAISE EXCEPTION 'Parcela fora da empresa'; END IF;
 IF NEW.status='pago' THEN
   IF a.loja IS NULL THEN RAISE EXCEPTION 'Escolha loja para baixar valor'; END IF;
   INSERT INTO public.manu_movimentos_caixa
    (empresa_id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id)
   VALUES (NEW.empresa_id,a.loja,a.tipo,'confirmado',a.categoria,a.descricao,NEW.valor,NEW.pago_em,'financas_parcela',NEW.id::text)
   ON CONFLICT (empresa_id,origem_tipo,origem_id) WHERE origem_tipo IN ('financas_parcela','faturamento_entrada','faturamento_financiamento')
   DO UPDATE SET loja=EXCLUDED.loja,tipo=EXCLUDED.tipo,status='confirmado',categoria=EXCLUDED.categoria,
     descricao=EXCLUDED.descricao,valor=EXCLUDED.valor,data_movimento=EXCLUDED.data_movimento;
 ELSE
   UPDATE public.manu_movimentos_caixa SET status='cancelado'
    WHERE empresa_id=NEW.empresa_id AND origem_tipo='financas_parcela' AND origem_id=NEW.id::text;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manu_fin_parcela_sync_caixa ON public.manu_fin_parcelas;
CREATE TRIGGER manu_fin_parcela_sync_caixa AFTER INSERT OR UPDATE OF status,pago_em,valor
 ON public.manu_fin_parcelas FOR EACH ROW EXECUTE FUNCTION public.manu_fin_parcela_caixa();

-- Impede inconsistencias mesmo se uma rota nao conferir o vinculo do cliente.
CREATE OR REPLACE FUNCTION public.manu_fin_validar_escopo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.loja IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lojas l
    WHERE l.empresa_id=NEW.empresa_id AND UPPER(l.codigo)=UPPER(NEW.loja)) THEN
  RAISE EXCEPTION 'Loja nao pertence a empresa'; END IF;
 IF NEW.lead_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads l
    WHERE l.id=NEW.lead_id AND l.empresa_id=NEW.empresa_id) THEN
  RAISE EXCEPTION 'Cliente/lead nao pertence a empresa'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manu_fin_validar_agendamento ON public.manu_fin_agendamentos;
CREATE TRIGGER manu_fin_validar_agendamento BEFORE INSERT OR UPDATE
 ON public.manu_fin_agendamentos FOR EACH ROW EXECUTE FUNCTION public.manu_fin_validar_escopo();

ALTER TABLE public.manu_fin_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manu_fin_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manu_fin_alertas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_fin_agendamentos,public.manu_fin_parcelas,public.manu_fin_alertas FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.manu_fin_proteger_aurox() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manu_fin_parcela_caixa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manu_fin_validar_escopo() FROM PUBLIC;
COMMIT;

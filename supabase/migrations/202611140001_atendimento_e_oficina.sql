-- AUROX MANU: eventos de contato, leitura do chat e despesas pagas da oficina.
-- Execute primeiro em HOMOLOGACAO; backup da base antes de aplicar em producao.
-- Este arquivo NAO reclassifica os atendimentos antigos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.manu_lead_atendimento_estado (
  lead_id bigint PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  ultimo_cliente_id bigint NOT NULL DEFAULT 0,
  ultimo_lido_id bigint NOT NULL DEFAULT 0,
  ultima_mensagem_enviada_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manu_atendimento_indices_validos CHECK (ultimo_cliente_id>=0 AND ultimo_lido_id>=0)
);
CREATE INDEX IF NOT EXISTS manu_lead_atendimento_empresa_idx
  ON public.manu_lead_atendimento_estado(empresa_id, atualizado_em DESC);
ALTER TABLE public.manu_lead_atendimento_estado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_lead_atendimento_estado FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.manu_lead_acoes_contato (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id integer REFERENCES public.usuarios(id),
  acao text NOT NULL CHECK (acao IN ('abrir_whatsapp','mensagem_enviada')),
  canal text NOT NULL DEFAULT 'whatsapp',
  id_externo text,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS manu_contato_saida_id_externo_unico
  ON public.manu_lead_acoes_contato(empresa_id,id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS manu_contato_acoes_empresa_idx
  ON public.manu_lead_acoes_contato(empresa_id, lead_id, registrado_em DESC);
ALTER TABLE public.manu_lead_acoes_contato ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_lead_acoes_contato FROM anon, authenticated;

-- Novo recebimento do cliente: passa a precisar de resposta, sem soltar o lead fixado.
-- Msgs antigas nao disparam o trigger. Transferencia automatica nao e mensagem de cliente.
CREATE OR REPLACE FUNCTION public.manu_atendimento_cliente_chegou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE empresa_do_lead integer;
BEGIN
  IF NEW.remetente_id IS NOT NULL OR NEW.mensagem ILIKE 'Transferido de %' THEN
    RETURN NEW;
  END IF;
  SELECT empresa_id INTO empresa_do_lead FROM public.leads WHERE id=NEW.lead_id;
  IF empresa_do_lead IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.manu_lead_atendimento_estado (lead_id,empresa_id,ultimo_cliente_id)
  VALUES (NEW.lead_id,empresa_do_lead,NEW.id)
  ON CONFLICT (lead_id) DO UPDATE
    SET ultimo_cliente_id=GREATEST(manu_lead_atendimento_estado.ultimo_cliente_id,EXCLUDED.ultimo_cliente_id),
        atualizado_em=now();
  UPDATE public.leads SET respondeu=false WHERE id=NEW.lead_id AND empresa_id=empresa_do_lead;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manu_atendimento_novo_cliente ON public.chat_geral_mensagens;
CREATE TRIGGER manu_atendimento_novo_cliente
  AFTER INSERT ON public.chat_geral_mensagens FOR EACH ROW
  EXECUTE FUNCTION public.manu_atendimento_cliente_chegou();
REVOKE ALL ON FUNCTION public.manu_atendimento_cliente_chegou() FROM PUBLIC;

-- Despesa paga da oficina: diferente de custo/orcamento previsto.
ALTER TABLE public.oficina_carros ADD COLUMN IF NOT EXISTS custo_pago boolean NOT NULL DEFAULT false;
ALTER TABLE public.oficina_carros ADD COLUMN IF NOT EXISTS custo_pago_em date;
ALTER TABLE public.oficina_carros
  DROP CONSTRAINT IF EXISTS manu_oficina_pago_data_validacao;
ALTER TABLE public.oficina_carros ADD CONSTRAINT manu_oficina_pago_data_validacao
  CHECK (NOT custo_pago OR custo_pago_em IS NOT NULL);

-- Os movimentos automaticos da oficina nao podem ser duplicados por salvamentos ou edicoes.
CREATE UNIQUE INDEX IF NOT EXISTS manu_caixa_origem_oficina_unica
  ON public.manu_movimentos_caixa(empresa_id,origem_id)
  WHERE origem_tipo='oficina';

CREATE OR REPLACE FUNCTION public.manu_oficina_caixa_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bruto text; moeda text; gasto numeric; loja_codigo text;
BEGIN
  IF NEW.empresa_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.custo_pago THEN
    loja_codigo:=UPPER(BTRIM(COALESCE(NEW.loja,'')));
    IF loja_codigo='' OR NOT EXISTS (SELECT 1 FROM public.lojas l WHERE l.empresa_id=NEW.empresa_id AND UPPER(l.codigo)=loja_codigo) THEN
      -- Nao permitir pagamento sem loja; evita contabilizacao ambigua.
      RAISE EXCEPTION 'Associe a oficina a uma loja valida antes de registrar uma despesa paga';
    END IF;
    bruto:=btrim(COALESCE(NEW.valor_final::text,''));
    moeda:=regexp_replace(bruto,'[^0-9,.]','','g');
    IF moeda ~ '^[0-9]{1,3}(\.[0-9]{3})+,[0-9]{1,2}$' OR moeda ~ '^[0-9]+,[0-9]{1,2}$' THEN
       moeda:=replace(replace(moeda,'.',''),',','.');
    END IF;
    IF moeda !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Informe valor final numerico da oficina antes de registrar pagamento';
    END IF;
    gasto:=moeda::numeric;
    IF gasto<=0 OR gasto>1000000000000 THEN RAISE EXCEPTION 'Valor pago de oficina invalido'; END IF;
    INSERT INTO public.manu_movimentos_caixa
      (empresa_id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id)
    VALUES (NEW.empresa_id,loja_codigo,'saida','confirmado','Oficina',
      concat_ws(' ',NEW.marca,NEW.modelo,NEW.placa),gasto,NEW.custo_pago_em,'oficina',NEW.id::text)
    ON CONFLICT (empresa_id,origem_id) WHERE origem_tipo='oficina'
    DO UPDATE SET loja=EXCLUDED.loja,tipo='saida',status='confirmado',categoria='Oficina',
      descricao=EXCLUDED.descricao,valor=EXCLUDED.valor,data_movimento=EXCLUDED.data_movimento;
  ELSE
    UPDATE public.manu_movimentos_caixa SET status='cancelado'
     WHERE empresa_id=NEW.empresa_id AND origem_tipo='oficina' AND origem_id=NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manu_oficina_caixa_movimento ON public.oficina_carros;
CREATE TRIGGER manu_oficina_caixa_movimento
  AFTER INSERT OR UPDATE OF custo_pago,custo_pago_em,valor_final,loja ON public.oficina_carros
  FOR EACH ROW EXECUTE FUNCTION public.manu_oficina_caixa_sync();
REVOKE ALL ON FUNCTION public.manu_oficina_caixa_sync() FROM PUBLIC;
COMMIT;

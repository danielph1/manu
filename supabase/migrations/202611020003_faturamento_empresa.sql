-- MANU/Aurox: dados do emissor do faturamento são exclusivos de cada empresa.
-- Faça backup antes de executar no SQL Editor do Supabase.
BEGIN;
ALTER TABLE public.faturamentos
  ADD COLUMN IF NOT EXISTS empresa_id integer REFERENCES public.empresas(id);
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS desconto_valor numeric DEFAULT 0;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS gerente_nome text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS data_assinatura date;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_marca text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_modelo text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_ano_modelo text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_placa text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_cor text;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS troca_km text;
CREATE INDEX IF NOT EXISTS faturamentos_empresa_id_idx ON public.faturamentos(empresa_id, created_at DESC);

-- Nunca inferir empresa por código de loja: códigos como 001 se repetem em empresas.
-- Migração de históricos identificáveis pelo usuário criador:
UPDATE public.faturamentos f SET empresa_id = u.empresa_id
FROM public.usuarios u
WHERE f.empresa_id IS NULL AND f.criado_por_id = u.id AND u.empresa_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.manu_faturamento_config (
  empresa_id integer PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_fantasia text NOT NULL DEFAULT '',
  razao_social text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  cep text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  texto_observacoes text NOT NULL DEFAULT '',
  texto_contrato text NOT NULL DEFAULT '',
  local_assinatura text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Identidade extraída do documento de referência fornecido pela Manu Automóveis.
-- Não aplicar os dados da Manu a nenhuma outra empresa.
INSERT INTO public.manu_faturamento_config (
  empresa_id,nome_fantasia,razao_social,cnpj,endereco,bairro,cidade,cep,telefone,
  texto_observacoes,texto_contrato,local_assinatura
)
SELECT id, 'MANU AUTOMÓVEIS', 'RLINE AUTOMOVEIS LTDA', '59.548.124/0001-59',
       'EST. INTENDENTE MAGALHÃES, 381', 'OSWALDO CRUZ', 'RIO DE JANEIRO',
       '21330-790', '(21) 3283-7207',
       'IPVA 2026 POR CONTA DA LOJA\nTRANSFERENCIA POR CONTA DO CLIENTE\nGARANTIA DE MOTOR E CAIXA DE MARCHA POR 90 DIAS OU 3 MIL KM RODADOS (KM APARTIR DA SAIDA DA LOJA)',
       'Pelo presente instrumento e na melhor forma de direito a empresa declara, sob penas das lei, que foram realizadas todas as manutenções e revisões necessárias informadas no check list no veículo acima descrito.\nA empresa RLINE AUTOMOVEIS LTDA informa ao comprador que se obriga contratualmente apenas com a GARANTIA DO MOTOR E DA CAIXA DE MARCHA do veículo adquirido, se desonerando dos demais itens, com a devida ciência do adquirente.\nA empresa informa ao comprador que o mesmo tem por lei um prazo decadencial de 90 (noventa) dias ou 3.000 KM o que ocorrer primeiro, para reclamar de vícios (defeitos) aparentes, na forma do artigo 26, inciso ii, do código de defesa do consumidor.\nCIÊNCIA DO ADQUIRENTE - Na oportunidade, o comprador declara, sob as penas da lei, que está de acordo com o perfeito estado do veículo adquirido, tendo sido testado todos os itens mencionados no CHECK LIST na presença do mesmo, nada tendo a reclamar. Cabe ressaltar ainda que as peças que sofrem desgastes naturais em função do uso, deverão ser substituídas periodicamente de acordo com as especificações do fabricante (embreagem, pastilhas de freio, vela de ignição, correias, amortecedores, suspensão, etc). Tais custos serão suportados pelo comprador.\nATENÇÃO COMPRADOR: Perderá totalmente a garantia caso seja constatada qualquer uma das ocorrências abaixo relacionadas:\n1) O veículo tenha sido submetido ao uso de forma inadequada, imprudente, negligente ou danificado por acidente.\n2) Tenha sido instalado Kit-gás (GNV) alterando assim suas características originais de fabrica.\n3) Tenha sido reparado em oficina diversa sem o conhecimento e consentimento da empresa (RLINE AUTOMÓVEIS LTDA).\n4) Em caso de displicência ou inobservância de anormalidades como luz de óleo e luz de injeção eletrônica acesas no painel, bem como o marcador de temperatura acima do nível e o comprador continuar andando até fundir o motor.',
       'Rio de Janeiro'
FROM public.empresas
WHERE lower(regexp_replace(nome, '[^[:alnum:]]', '', 'g')) LIKE 'manuautom%'
ON CONFLICT (empresa_id) DO NOTHING;

-- A API Next.js lê/escreve com credenciais de servidor, não por acesso público.
ALTER TABLE public.manu_faturamento_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_faturamento_config FROM anon, authenticated;

-- Documentos de outras empresas precisam ser configurados por seu administrador.
COMMIT;

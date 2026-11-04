-- MANU: preencher SOMENTE os dados do emissor da empresa "Manu Automóveis".
-- Fonte: PDF de faturamento entregue pelo responsável, preservado na migration original.
-- Execute somente após conferir o nome da empresa e fazer backup.
-- Não altera faturamentos, leads, valores, credenciais nem dados de outras empresas.
BEGIN;
DO $manu_config$
DECLARE
  v_manu_empresa_id integer;
  v_contagem integer;
BEGIN
  IF to_regclass('public.manu_faturamento_config') IS NULL THEN
    RAISE EXCEPTION 'Falta public.manu_faturamento_config: execute a migration de faturamento por empresa antes.';
  END IF;

  SELECT count(*), min(id)
  INTO v_contagem, v_manu_empresa_id
  FROM public.empresas
  WHERE lower(btrim(nome)) IN ('manu automóveis', 'manu automoveis');

  IF v_contagem <> 1 THEN
    RAISE EXCEPTION 'Foram encontradas % empresas chamadas Manu Automóveis. Nenhuma foi alterada: corrija/identifique a empresa primeiro.', v_contagem;
  END IF;

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
WHERE id = v_manu_empresa_id
ON CONFLICT (empresa_id) DO UPDATE SET
  nome_fantasia = COALESCE(NULLIF(BTRIM(manu_faturamento_config.nome_fantasia), ''), EXCLUDED.nome_fantasia),
  razao_social = COALESCE(NULLIF(BTRIM(manu_faturamento_config.razao_social), ''), EXCLUDED.razao_social),
  cnpj = COALESCE(NULLIF(BTRIM(manu_faturamento_config.cnpj), ''), EXCLUDED.cnpj),
  endereco = COALESCE(NULLIF(BTRIM(manu_faturamento_config.endereco), ''), EXCLUDED.endereco),
  bairro = COALESCE(NULLIF(BTRIM(manu_faturamento_config.bairro), ''), EXCLUDED.bairro),
  cidade = COALESCE(NULLIF(BTRIM(manu_faturamento_config.cidade), ''), EXCLUDED.cidade),
  cep = COALESCE(NULLIF(BTRIM(manu_faturamento_config.cep), ''), EXCLUDED.cep),
  telefone = COALESCE(NULLIF(BTRIM(manu_faturamento_config.telefone), ''), EXCLUDED.telefone),
  texto_observacoes = COALESCE(NULLIF(BTRIM(manu_faturamento_config.texto_observacoes), ''), EXCLUDED.texto_observacoes),
  texto_contrato = COALESCE(NULLIF(BTRIM(manu_faturamento_config.texto_contrato), ''), EXCLUDED.texto_contrato),
  local_assinatura = COALESCE(NULLIF(BTRIM(manu_faturamento_config.local_assinatura), ''), EXCLUDED.local_assinatura);
END $manu_config$;
COMMIT;

-- Resultado diagnóstico sem dados dos clientes:
SELECT e.id, e.nome,
  CASE WHEN NULLIF(BTRIM(c.razao_social),'') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS razao_social,
  CASE WHEN NULLIF(BTRIM(c.cnpj),'') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS cnpj,
  CASE WHEN NULLIF(BTRIM(c.texto_contrato),'') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS clausulas
FROM public.empresas e
LEFT JOIN public.manu_faturamento_config c ON c.empresa_id=e.id
WHERE lower(btrim(e.nome)) IN ('manu automóveis', 'manu automoveis');

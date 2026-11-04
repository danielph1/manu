# MANU / Aurox — Métricas por empresa (04/11/2026)

## O que foi corrigido

- Saiu a soma incorreta de propostas aprovadas + entrada prevista como se fossem recebimentos.
- Oficina não é mais tratada como despesa paga apenas por ter `valor_final` ou `valor_carro`.
- A fonte financeira confiável passa a ser o razão `manu_movimentos_caixa` (apenas `status='confirmado'`).
- Todas as consultas de leads/vendedores/bancos filtram a empresa. Para gerente, também filtram sua loja.
- Superadmin escolhe **explicitamente** uma empresa antes da consulta. Não existe visão misturada de todos os contratantes.
- Vendedor: carteira atual, respondidos, fichas, aprovados, vendas, pendências, transferência por atraso (se auditada).
- Equipe completa: exibe outros funcionários, sem atribuir métricas de atendimento a mecânicos se não houver registros operacionais.
- Origem de lead: fontes de `triagem`/`origens_lead`, e eventos únicos de integração com `triagem_id`.
- Qualidade: completude cadastral (nome, contato, veículo, detalhes; 25 pontos cada), além de conversão e taxa de resposta por origem.
- Banco: última situação por banco e ficha, taxa = aprovados/(aprovados+negados), excluindo pendentes.
- Projeção por carroceria: vendas datadas com placa vinculável ao estoque. Exige 5 vendas em 3 meses distintos, usa seis meses completos.
- KPIs duplicados na interface removidos; avisos mostram fontes ausentes sem fingir valor zero.

## Requisitos SQL (backup antes de executar)

1. Execute as migrations anteriores do MANU que ainda não tiverem sido aplicadas (especialmente `202611030001_isolamento_integracoes_chat.sql`, que acrescenta `leads.empresa_id`).
2. Execute no **SQL Editor**: `supabase/migrations/202611040001_metricas_caixa.sql`.
3. Rode `supabase/diagnostico-estrutura.sql`: agora são **quatro consultas**, para conferir quais fontes e colunas existem. **Não compartilhe linhas com dados de clientes nem chaves/senhas.**
4. Os campos financeiros históricos **não serão preenchidos automaticamente**, porque valores de venda, propostas, crédito aprovado e serviços na oficina não comprovam pagamento/liquidação. Para reconstruir o histórico, concilie extratos/contas recebidas e pagas e registre os movimentos confirmados no MANU.

## Como registrar entradas e saídas

Acesse **Métricas → Caixa efetivo → Registrar movimento** (somente admin e superadmin). Informe loja, natureza entrada/saída, categoria, data de liquidação e valor; use confirmado apenas quando realmente liquidado. O relatório mostra categorias e evolução mensal.

Lançamentos `previsto` e `cancelado` não entram nos saldos. A versão inicial não possui importação bancária e não deve ser interpretada como conciliação bancária automática.

## Filtros / segurança

- `admin` e `marketing`: todas as lojas somente da sua empresa.
- `gerente`: apenas a loja configurada em seu usuário.
- `superadmin`: escolhe empresa, podendo filtrar loja.
- Outros cargos: acesso negado.
- Registros sem empresa confiável não são associados automaticamente. Corrija o vínculo antigo após auditoria.

O caixa exige autenticação, valida empresa/loja no servidor e não tem permissão direta para `anon` ou `authenticated` no PostgreSQL (RLS habilitado). Para transações, utilize exclusivamente a API de servidor. Não coloque `DATABASE_URL` no frontend.

## Compilação / publicação

```powershell
npm install
npm run build
npm run dev
```

O código-fonte do ZIP tem apenas `app/privacidade/page.tsx` e `app/ajuda/page.tsx` (sem duplicações). Se você sobrepuser arquivos sobre uma pasta antiga vinculada ao Git, **apague os arquivos antigos de dentro de `(dashboard)`** e registre a exclusão:

```powershell
# Executar na pasta do GitHub se estes arquivos antigos existirem:
if (Test-Path 'app/(dashboard)/privacidade/page.tsx') { git rm -- 'app/(dashboard)/privacidade/page.tsx' }
if (Test-Path 'app/(dashboard)/ajuda/page.tsx') { git rm -- 'app/(dashboard)/ajuda/page.tsx' }

git add -A
git commit -m 'fix: métricas por empresa e rotas duplicadas'
git push origin main
```

A Vercel só deixará de apontar o conflito quando **os arquivos duplicados forem removidos do repositório GitHub**, não apenas omitidos do ZIP.

## Limitações de precisão e cobertura

- Sem movimentos financeiros conciliados: caixa ainda não representa a realidade passada.
- Sem associação de triagem ou fonte: a origem aparecerá não identificada.
- Sem histórico com placa+carroceria+data da venda: projeção indisponível.
- Com poucos casos decididos por banco, o ranking não declara um “vencedor”.
- A contagem de vendas é do CRM, não equivale a valores efetivamente recebidos.
- Taxas de vendedores não são comparáveis sem considerar qualidade/volume de leads e tempo de atribuição.
- Não foram executadas consultas no seu Supabase nem testado build Next.js completo neste ambiente. Faça testes com duas empresas e uma loja distinta em cada, antes de publicar a área financeira.

Arquivos principais: `app/api/metricas/route.ts`, `app/api/metricas/lancamentos/route.ts`, `app/api/metricas/lojas/route.ts`, `app/(dashboard)/metricas/page.tsx`, `lib/metricas/escopo.ts`.

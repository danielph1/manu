# Marketplace Facebook → MANU

## Fluxo
1. Superadmin em **/marketplace** cria busca (ex.: "aceito troca", cidade `rio`)
2. Worker Python (PC/VPS) com Playwright captura anúncios e POST em `/api/marketplace/anuncios`
3. Superadmin em **/marketplace/resultados** revisa, seleciona, **distribui** → vira lead aleatório

## SQL
Arquivo: `supabase/migrations/202610220001_marketplace.sql`
(ou `SQL_MARKETPLACE.sql` / `SQL_COMPLETO_...` na pasta artifacts)

## Vercel env
`MARKETPLACE_SCRAPER_SECRET` = string longa aleatória (mesmo valor no worker)

## Limitações do repo passivebot
- Cidades do código original são dos **EUA** — precisa mapear **rio** (e outras BR)
- Retorna título/preço/local/link/imagem — **não** telefone do anunciante (Marketplace esconde)
- Viola ToS da Meta; risco de ban da conta usada no login

## Lead gerado
Sem telefone no anúncio público: lead fica com título + link + observação. Vendedor contata pelo Facebook.

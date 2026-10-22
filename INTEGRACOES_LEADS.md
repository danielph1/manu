# Integrações de leads (inbound)

## Arquitetura
1. Admin cria conexão em /integracoes (escolhe empresa + plataforma).
2. Sistema gera URL: https://<projeto>.supabase.co/functions/v1/manu-webhook/{uuid}/{token}
3. Empresa cola essa URL no painel OLX / Webmotors / Z-API / Meta / etc.
4. Plataforma envia POST JSON → Edge Function → RPC manu_receber_webhook → tabela triagem.

## Deploy necessário (uma vez, Aurox)
- SQL: migrations manu_integracoes
- supabase functions deploy manu-webhook --no-verify-jwt
- Secrets Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Cliente NÃO precisa de acesso Vercel.

## Plataformas
olx, webmotors, icarros, mercadolivre, napista, chavesnamao, facebook, marketplace, instagram, whatsapp

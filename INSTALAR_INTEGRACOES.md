# Central de Integrações — instalação no seu MANU

## 1) SQL (Supabase → SQL Editor)
1. Rode `supabase/diagnostico-estrutura.sql` (só leitura).
2. Rode **inteiro** o arquivo:
   `supabase/migrations/202610210001_manu_integracoes.sql`

Isso cria:
- `manu_integracoes`
- `manu_integracao_eventos`
- função `manu_receber_webhook`
- coluna `triagem.empresa_id`

## 2) Edge Function
No terminal (com Supabase CLI logado no projeto):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy manu-webhook --no-verify-jwt
```

Secrets da função (já costumam existir no projeto):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3) Vercel
Garanta:
- `NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co` (sem barra no final)
- `DATABASE_URL` / JWT como já usa

Redeploy do Next depois do push.

## 4) Uso
1. Login como admin / marketing / superadmin
2. Menu **Integrações**
3. Criar OLX (ou plataforma nova) → **copiar a URL na hora**
4. Colar no portal OLX / integrador
5. Testar POST JSON (exemplo no LEIA-ME-INTEGRACOES.md)
6. Ver **Eventos** e **Triagem**

## 5) URLs antigas
`/api/olx` e `/api/napista` agora retornam **410**. Use só a URL da Edge Function gerada na tela.

## Observação WhatsApp / Z-API
Este pacote **não substitui** o Z-API. WhatsApp continua em `/api/webhooks/zapi`.  
OLX/NaPista/custom usam a Edge Function isolada por empresa.

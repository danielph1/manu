# MANU / Aurox-WhatsApp v10 — triagem, nome/telefone e mídia

Atualização incremental sobre a v9. **Não altera fichas, faturamento, Z-API, Meta, credenciais ou permissões de usuários.**

## Regras

- Conversa antiga no WhatsApp não impede o lead: uma nova mensagem RECEBIDA após a sessão estar conectada é processada.
- Contato que NÃO existe como lead da empresa: entra na triagem com nome, telefone (quando disponibilizado pelo WhatsApp) e conteúdo.
- Contato já cadastrado como lead nessa empresa: a mensagem vai ao chat desse lead, sem criar outro lead.
- A busca por telefone é restrita à empresa; se houver mais de um lead com o mesmo telefone, não há correspondência automática. A triagem pode receber o contato para revisão.
- Nova mensagem do mesmo contato continua no registro existente. Eventos repetidos são deduplicados pelo ID da mensagem e empresa.
- Recebe texto, foto e áudio/voz. **Vídeos não são importados**; outros eventos e grupos são ignorados.
- Foto e áudio: arquivos privados no Supabase Storage (máximo 8 MB). Uma URL temporária é gerada somente para gestor autorizado da empresa. Sem `SUPABASE_SERVICE_ROLE_KEY` na Vercel, essa funcionalidade não funciona. Caso o arquivo não esteja disponível, chega um marcador descritivo na triagem.
- Mensagens pessoais NÃO devem ser capturadas de um número particular: use um WhatsApp empresarial autorizado e avise os clientes sobre o tratamento de dados.
- Origem `aurox-whatsapp` permanece até 10 minutos na triagem antes da atribuição automática, que continua em um minuto para outros canais.

## Instalação (sem Docker)

1. Faça backup do Supabase e do seu projeto.
2. Execute `supabase/migrations/202611040003_aurox_whatsapp_midia_triagem.sql` no SQL Editor do mesmo Supabase usado pelo MANU. Verifique também se a migration anterior `202611040002_aurox_whatsapp.sql` foi aplicada.
3. Publique os arquivos Next.js atualizados na Vercel, incluindo as APIs `/api/internal/aurox-whatsapp/media-upload` e `/api/triagem/media/[id]`.
4. Confira que `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUROX_WA_WORKER_URL` e `AUROX_WA_WORKER_SECRET` já estão disponíveis no servidor. **Nunca publique segredos com `NEXT_PUBLIC_`.**
5. No seu Windows, mantenha o `.env` e principalmente `workers/aurox-whatsapp/data/` originais (sessões e fila criptografada). Troque somente `workers/aurox-whatsapp/index.mjs` pelo arquivo atualizado. Na pasta do worker, use `node --env-file=.env index.mjs`.
6. Mantenha o Cloudflare Tunnel aberto, apontando para `http://localhost:3456`. Se reiniciar o túnel temporário, atualize `AUROX_WA_WORKER_URL` na Vercel e faça Redeploy.
7. Abra o MANU, conecte Aurox-WhatsApp da empresa e peça a um contato que já conversava anteriormente para **enviar uma mensagem NOVA**. Mensagens anteriores ao pareamento não serão importadas retroativamente.
8. Abra a Triagem em até 10 minutos. Se a empresa tiver vendedor, a atribuição automática poderá ocorrer depois desse prazo.

## Diagnóstico sem expor conversas

No PowerShell do worker procure:

- `evento recebido empresa=...`: whatsapp-web.js disparou o evento de entrada.
- `evento processado empresa=... triagem=... lead=...`: o MANU confirmou a transação. `triagem` preenchido = novo contato; `lead` preenchido = contato já identificado como lead.
- `Reenvio de mensagem não concluído`: a mensagem foi colocada na fila e ainda precisa ser entregue ao MANU.

Para confirmar as últimas mensagens no Supabase:

```sql
SELECT i.empresa_id, i.status, i.ultima_mensagem_em,
       (SELECT COUNT(*) FROM public.aurox_wa_mensagens m WHERE m.empresa_id=i.empresa_id) AS mensagens_registradas
FROM public.aurox_wa_instancias i ORDER BY i.empresa_id;
```

Se o worker registrar `evento recebido` mas não `evento processado`, verifique os logs da API `POST /api/internal/aurox-whatsapp` na Vercel. Não compartilhe chaves, conversas privadas ou imagens pessoais nos logs.

## Testes

Rode na raiz (após `npm install`):

```powershell
npm run test:aurox-whatsapp
npm run test:aurox-whatsapp-v10
npm run prebuild
npm run build
```

Os testes de lógica locais não equivalem a testes com WhatsApp e Supabase reais. Faça a validação com uma empresa de testes antes de habilitar números de clientes.

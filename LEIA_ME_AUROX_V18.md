# Aurox v18 — Preferências Mercado Livre + notificações web push

## Problema da captura
404 em /api/anuncios/preferencias?estoque_id=105 significa rota não publicada na Vercel, não ausência de linha do veículo. A rota foi incluída neste pacote. Se, após o deploy, retornar 503, execute a migration v16 de preferências (`202611060001_preferencias_anuncios.sql`) antes de usar Salvar dados da loja.

## Instalação recomendada
1. Faça backup do código e banco de produção.
2. Execute o SQL `supabase/migrations/202611060002_aurox_push_eventos.sql` no SQL Editor e confirme que não deu erro. Se a tabela de notificações possuir outro esquema, adapte a migration com base nas colunas reais antes de prosseguir.
3. Extraia o hotfix NA RAIZ do projeto, mantendo as pastas, sem apagar seus arquivos .env e nem `workers/aurox-whatsapp/data`.
4. Execute `npm install` e `npm run build`; envie os arquivos e package-lock se modificado ao GitHub e publique na Vercel.
5. Configure variáveis privadas na Vercel, em Production:
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<chave publica VAPID>
   VAPID_PRIVATE_KEY=<chave privada VAPID>
   VAPID_SUBJECT=mailto:seu-email-de-suporte@seudominio.com
   PUSH_DISPATCH_SECRET=<hex aleatorio >=32 caracteres>
   Gere as chaves com `npx web-push generate-vapid-keys` e um segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Nunca adicione chave privada ao NEXT_PUBLIC_ nem faça commit do segredo.
6. No .env privado do worker local, configure a MESMA variável PUSH_DISPATCH_SECRET da Vercel. MANU_APP_URL já aponta para a URL HTTPS de produção. Reinicie o worker com `node --env-file=.env index.mjs`. Ele consultará o endpoint seguro /api/cron/push aproximadamente a cada 30s. O Cloudflare pode permanecer aberto.
7. Faça login no site via HTTPS, abra Configurações > Notificações > Ativar neste dispositivo e autorize pelo navegador. Em cada computador ou celular, ative uma vez. Use Enviar teste.

## Compatibilidade
- Android e desktop: web push, em navegadores suportados, pode funcionar sem instalar o PWA, desde que o dispositivo já tenha visitado o site, autorizado os avisos e registrado sua inscrição.
- iOS/iPadOS: requer Adicionar à Tela de Início e abertura do PWA (iOS 16.4+).
- Sem visitar/autorizar antes, um dispositivo NÃO pode receber Web Push; SMS/e-mail precisam de provedor próprio e consentimento.
- Web Push não garante 100% entrega: aparelho desligado, modo foco, SO, serviços de push ou permissão revogada podem afetar.

## Escopo de eventos
- Todos os avisos inseridos em `public.notificacoes` geram entregas enfileiradas.
- Novos leads da `triagem` notificam gestores da própria empresa.
- Novas mensagens recebidas em `chat_geral_mensagens` (remetente_id nulo) notificam o vendedor da própria empresa.
- Outras ações que ainda NÃO criam registros em `notificacoes` devem ser conectadas à camada `notificar()` para gerar push; não marque tudo como coberto sem auditar os eventos.
- Cada aviso usa título e resumo genérico na tela bloqueada para proteger dados pessoais.

## Entrega durável e manutenção
- `aurox_push_outbox` guarda eventos não entregues e permite reenviar até cinco tentativas para falhas temporárias.
- `GET /api/cron/push` é protegido por segredo PUSH_DISPATCH_SECRET; o worker Windows já o acessa. Em produção permanente, substitua pela sua infraestrutura de agendamento (um worker 24x7 ou Cron com frequência compatível com seu plano).
- Não use cron público sem autenticação. Não execute a limpeza da fila manualmente sem auditoria.

## Testes
1. 404 /api/anuncios/preferencias: deve virar 200 para veículo autorizado (ou 503 se faltar a migration v16).
2. Ative push em um navegador, feche a aba e clique Enviar teste quando aberto novamente, verificando no SO.
3. Envie nova mensagem WhatsApp de um lead e confira o registro em public.notificacoes e aurox_push_outbox.
4. Confira isolamento entre empresas com dois usuários diferentes e permissões.
5. Verifique `/api/cron/push` apenas pelo worker autorizado; sem Authorization deve retornar 401.
6. Teste revogação, logout e troca de conta no mesmo navegador.

Não apague dados do WhatsApp nem execute scripts de reinicialização do banco.

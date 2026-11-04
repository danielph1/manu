# Aurox-WhatsApp — integração independente por empresa

**Edição:** 04/11/2026 · para o MANU Next.js / PostgreSQL. Esta atualização é incremental e parte da versão v7 com o hotfix do faturamento. Não inclui a v8 das fichas bancárias.

## O que está implementado

- **Central de Integrações > Aurox-WhatsApp**: iniciar sessão, gerar QR Code temporário, acompanhar status, desconectar e configurar saudação.
- **Uma sessão por empresa**: o vínculo fica no PostgreSQL por `empresa_id`; há uma restrição de unicidade para números ativos. Nunca é apresentado como conectado se o servidor WhatsApp estiver indisponível.
- **Recepção automática**: a primeira mensagem recebida em conversa privada cria uma linha em `triagem` vinculada à empresa. Mensagens posteriores da mesma conversa são registradas em `aurox_wa_mensagens`; enquanto o contato aguarda triagem, a mensagem é acrescentada ao contexto. Quando o lead for atribuído a um vendedor, a próxima mensagem também aparece no chat do lead.
- **Mensagem automática opcional**: resposta inicial apenas para quem chamou a empresa; desativada por padrão, configurável por admin, marketing ou superadmin.
- **Chat do MANU**: para leads originados no Aurox-WhatsApp, mensagens digitadas pela equipe são enviadas por essa sessão, nunca por uma instância de outra empresa. Para os demais leads, o envio via Z-API existente continua.
- **Fila durável**: eventos recebidos são escritos em disco de forma criptografada e reenviados após indisponibilidades da API do MANU. Duplicatas são ignoradas pelo banco, por empresa e ID externo da mensagem.
- **Sem Z-API para este canal**: não é necessário token Z-API, nem colar um webhook manualmente. O serviço cria a sessão WhatsApp Web e encaminha eventos automaticamente à API do MANU.

**Limites desta primeira versão**: mensagens particulares de entrada (inclusive foto/vídeo/áudio como marcador de tipo). Grupos, canais, status e mensagens enviadas pela própria loja não entram na triagem. O conteúdo binário de mídia não é armazenado; apenas a indicação de que mídia foi recebida. Não há campanhas, disparos em massa ou chatbot de IA.

## Infraestrutura necessária

`whatsapp-web.js` precisa de um processo Node/Chromium sempre ativo com **disco persistente** para guardar a sessão. **Não rode o worker na Vercel** (serverless, filesystem efêmero). Hospede o worker em VPS ou servidor Docker, idealmente em `wa.seudominio.com`, por trás de HTTPS e autenticação de servidor a servidor. Cada instância usa recursos de CPU/RAM: dimensione e limite número de empresas por worker. Uma única réplica deve gerenciar o mesmo volume de sessões; não escale múltiplos workers com o mesmo perfil Chromium.

Arquitetura:

```
Loja escaneia QR no MANU (Vercel)
    ↓ autorização JWT + empresa_id
MANU API Next.js (conversa apenas com worker via segredo)
    ↔ HTTPS /v1/sessions/...  [worker Node + Chromium + LocalAuth persistente]
    ← HTTPS com assinatura HMAC, timestamp e corpo JSON
    ↓ transação PostgreSQL
Supabase: aurox_wa_instancias / contatos / mensagens → triagem → vendedor
```

### 1. SQL no Supabase

Faça backup primeiro e execute apenas uma vez (idempotente):

`supabase/migrations/202611040002_aurox_whatsapp.sql`

O SQL **não altera** tabelas e credenciais da Z-API/Meta, contas existentes, fichas, faturamentos ou leads anteriores. Requer as tabelas pré-existentes `empresas`, `usuarios`, `triagem`, `leads` e `chat_geral_mensagens` (migration do isolamento v4). A sessão atual do WhatsApp não é importada automaticamente da Z-API; ela precisa ser vinculada por QR Code.

### 2. Servidor do worker

Pasta: `workers/aurox-whatsapp/`.

1. Em um servidor Linux com Docker Compose e disco persistente, copie a pasta.
2. Copie `.env.example` para `.env` e preencha `MANU_APP_URL` com o domínio **HTTPS** da Vercel e um segredo longo aleatório.
3. Gere um segredo forte, por exemplo:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Suba o serviço:

   ```bash
   docker compose up -d --build
   docker compose logs -f aurox-whatsapp
   ```

5. Exponha `127.0.0.1:3456` via proxy reverso com HTTPS (`wa.seudominio.com`). Por exemplo, em Caddy:

   ```caddy
   wa.seudominio.com {
     reverse_proxy 127.0.0.1:3456
   }
   ```

   O worker exige `Authorization: Bearer <SEGREDO>` em todos os endpoints; não exponha a porta sem HTTPS na internet. Use também firewall e rate limiting do proxy.

O volume `./data` guarda autenticação e fila criptografada. Faça backup seguro e **nunca envie o diretório `data` para o GitHub**. A pasta LocalAuth guarda credenciais sensíveis de sessão, mesmo que a fila de eventos esteja criptografada.

### 3. Variáveis no servidor do MANU / Vercel

Configure em Environment Variables (Production, Preview se necessário):

```
AUROX_WA_WORKER_URL=https://wa.seudominio.com
AUROX_WA_WORKER_SECRET=O_MESMO_SEGREDO_64_HEX_DO_WORKER
```

Não prefixe essas variáveis com `NEXT_PUBLIC_`. A Vercel deve conseguir acessar a URL do worker por HTTPS. O worker precisa conseguir fazer requisições HTTPS de volta ao `MANU_APP_URL` configurado.

Continue usando `DATABASE_URL` e `JWT_SECRET` **já existentes** no MANU. Não envie nenhuma senha para a conversa nem ao GitHub.

### 4. Conectar a empresa pela interface

Entre como **admin, marketing ou superadmin** em **Integrações**. Se for superadmin, selecione a empresa primeiro; o vínculo fica restrito a ela.

Abra **Aurox-WhatsApp → Gerenciar → Conectar WhatsApp**. O servidor gerará QR Code. No celular da loja: `WhatsApp > Dispositivos conectados > Conectar dispositivo`. Escaneie a partir da tela do computador. O status deve mudar para **Conectado**, com o número da instância.

Envie uma mensagem de **outro número de WhatsApp** para a loja conectada. Consulte a triagem da mesma empresa. Faça o mesmo teste com duas empresas: os números, leads e listas de conexões não devem aparecer cruzados.

A saudação pode ser ativada em **Mensagens automáticas**; somente responde após o contato iniciar uma conversa. Desconectar na interface também revoga o canal no MANU; se o worker estiver indisponível, remova o dispositivo manualmente no WhatsApp conectado.

### 5. Testes recomendados

```bash
npm install
npm run test:aurox-whatsapp
npm run prebuild
npm run build
```

No servidor do worker:

```bash
npm install
npm run check
npm start
```

Os testes automáticos verificam a autenticação e estrutura de isolamento, mas **não substituem** o teste real com WhatsApp, Supabase, Chromium e Vercel.

Casos essenciais antes de liberar clientes:
1. Empresa A, WhatsApp A, mensagem recebida → triagem A.
2. Empresa B, WhatsApp B, mensagem recebida → triagem B. A jamais vê mensagens de B.
3. Mesmo número usado em duas empresas → segunda conexão recusada, sem misturar dados.
4. Mesmo evento entregue duas vezes → apenas um registro de mensagem.
5. Duas mensagens do mesmo contato → um contato/oportunidade; atualização da conversa.
6. Atribuir triagem ao vendedor e receber outra mensagem → aparece no chat do lead.
7. Enviar pelo chat do lead dessa empresa → resposta usando sua sessão Aurox-WhatsApp.
8. Reiniciar worker com disco persistente → restaura sessão sem QR, se WhatsApp permitir.
9. Queda temporária da API → eventos passam pela fila e são retransmitidos.
10. Desconectar → novas mensagens não são processadas; confirmar remoção do dispositivo no celular.

## Privacidade, segurança e limitações

- Mantenha termos/aviso de privacidade atualizados, controle de acesso por empresa e política de retenção para mensagens de consumidores; descarte dados quando não houver mais necessidade legal/contratual.
- Não conecte números pessoais de funcionários para coletar conversas privadas. Use números empresariais autorizados, com ciência dos responsáveis e finalidade adequada, conforme LGPD.
- `whatsapp-web.js` **não é uma API oficial** do WhatsApp, pode parar após mudanças no WhatsApp Web e traz risco de restrição da conta. Para produto SaaS em larga escala, prefira o **WhatsApp Business Platform / Cloud API oficial**, que pode coexistir como outro canal.
- Saudação automática é opcional e restrita a contatos que iniciaram conversa. Não inclui disparos sem consentimento, campanhas ou scraping de listas.
- O processamento de mídias nesta versão registra apenas o tipo. A visualização/download de arquivos será uma funcionalidade adicional, com armazenamento privado e retenção.
- O MANU hospeda interface e API na Vercel; o worker **não** opera em funções serverless. O cliente paga pela hospedagem dedicada do worker, ainda que não use Z-API.

## Arquivos principais

- `components/aurox-whatsapp-connect.tsx` — tela de QR e configurações.
- `app/(dashboard)/integracoes/page.tsx` — inclusão do canal.
- `app/api/integracoes/aurox-whatsapp/route.ts` — API autenticada de conexão.
- `app/api/internal/aurox-whatsapp/route.ts` — eventos assinados e triagem.
- `app/api/internal/aurox-whatsapp/bootstrap/route.ts` — restauração de sessões.
- `lib/aurox-whatsapp/{security,ingest,send}.ts` — segurança, processamento e envio.
- `app/api/chat/route.ts` — escolha entre sessão Aurox-WhatsApp e Z-API anterior.
- `workers/aurox-whatsapp/` — serviço Node.js dedicado.
- `supabase/migrations/202611040002_aurox_whatsapp.sql` — banco multiempresa.

**Estado de validação:** sintaxe do worker e das rotas verificadas; testes de HMAC e isolamento estrutural executados. Não foi realizada autenticação real do WhatsApp nem deploy do serviço neste ambiente.

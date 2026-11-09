# AUROX / MANU — Triagem 10 segundos + Pooling do PostgreSQL no Vercel

Verificado no repositório `danielph1/manu` em 09/11/2026. O instalador é conservador: se o `lib/db.ts` local não tiver a versão exata auditada, ele não modifica nada. Aceita o hotfix de triagem de 10 s preparado anteriormente ou a implementação antiga.

## 1 — Descobertas

1. **`lib/db.ts` já tinha `pg.Pool` (um por instância Node)** com `max:8` e `idleTimeoutMillis:30000`. Isso reutiliza conexões dentro de cada instância, mas **não** evita conexões PostgreSQL excessivas se a URL apontar para o endpoint direto `db.<id>.supabase.co:5432` e a Vercel criar dezenas de instâncias.
2. `app/api/triagem/route.ts` tinha `10 minutes` para Aurox-WhatsApp e `1 minute` para os demais canais. O processamento era disparado principalmente ao consultar `/api/triagem`.
3. O worker já processa Push, mas não distribuía a triagem automaticamente em segundo plano.

## 2 — Como fica

- **Triagem**: leads de *todos os canais* são elegíveis depois de **10 segundos** de `triagem.created_at`. O worker ativo consulta `/api/cron/triagem` a cada **5 segundos**; sem tela aberta. Um lead não é atribuído duas vezes (transação e row lock). Se não houver vendedor ativo da mesma empresa, permanece na triagem.
- **Vendedor após atribuição**: o prazo **separado** de 10 minutos para responder permanece **inalterado**, evitando realocação precipitada. Esse timeout fica em `/api/leads/auto-passar` e não é o tempo de triagem.
- **Banco**: `lib/db.ts` passa a usar `DATABASE_POOLER_URL` (ou `DATABASE_URL` **somente se também apontar para um pooler**). No ambiente de produção, **recusa** URL direta `db.*:5432`. Por padrão, usa **2 conexões por instância**, 5 s para encerrar conexão ociosa, 5 s para tentativa de conexão, 20 s de limite de execução SQL, 25 s de espera de query, 30 s para transação ociosa e 120 s de tempo máximo de vida. Limites com variáveis opcionais e teto máximo 4 por instância.
- **Ciclo de vida Vercel**: usa `@vercel/functions` (`attachDatabasePool`) para liberar conexões ociosas antes da suspensão quando a Vercel Fluid Compute estiver ativa. O pacote adiciona a dependência ao `package.json`; execute **`yarn install`**, gere e faça commit do `yarn.lock`.
- **Conexão externa**: a porta **6543 do Supavisor em Transaction mode**, que compartilha conexões reais entre as instâncias da Vercel. O pool da biblioteca sozinho não substitui esse pooler remoto.
- **Segurança**: URL exclusivamente no servidor, sem `NEXT_PUBLIC_`; SSL com verificação da cadeia de certificados; cliente `pg` não envia named prepared statements. Conexões alocadas por transações devem ser liberadas via `client.release()` nos `finally` (padrão existente nas rotas auditadas).

## 3 — Antes de publicar: configurar o Supabase / Vercel

1. No painel **Supabase → projeto → Connect** escolha **Transaction pooler** e **copie a connection string completa** exibida; o host/usuário dependem da região e do projeto. Não tente adivinhar o hostname.
2. Na **Vercel → MANU → Settings → Environment Variables**, crie:

   `DATABASE_POOLER_URL` = `postgresql://postgres.[SEU-PROJETO]:[SENHA-URL-ENCODED]@[HOST-REAL].pooler.supabase.com:6543/postgres?sslmode=require`

   Esse texto é apenas um modelo ilustrativo, **NÃO** é a URL real. Use **Secret**, ambiente **Production** e eventualmente Preview. Não inclua `NEXT_PUBLIC_`. Não compartilhe senha no chat.
3. No mesmo local, **opcionais** (podem ser omitidas):

   - `PG_POOL_MAX=2` (por instância; faixa 1 a 4, ajustar somente após medir fila)
   - `PG_IDLE_TIMEOUT_MS=5000`
   - `PG_CONNECT_TIMEOUT_MS=5000`
   - `PG_STATEMENT_TIMEOUT_MS=20000`
   - `PG_QUERY_TIMEOUT_MS=25000`
   - `PG_IDLE_TX_TIMEOUT_MS=30000`
   - `PG_CONNECTION_LIFETIME_S=120`

4. Verifique as credenciais com um teste em **homologação**. Só depois faça deploy de produção. O `DATABASE_URL` antigo poderá permanecer por curto período como rollback, mas a nova implementação privilegia `DATABASE_POOLER_URL`. Depois de validar, remova credenciais diretas desnecessárias.

**Importante**: os limites de conexão não limitam os usuários simultâneos do CRM. Eles limitam conexões SQL *por instância*. O total de instâncias na Vercel ainda pode crescer; dimensione a capacidade do Supavisor e observe os gráficos do banco, pois nenhum limite local garante capacidade infinita. Para pelo menos **20 requisições simultâneas de usuários**, não abra 20 conexões em cada função: o teste deve usar 20 chamadas HTTP simultâneas e conferir tempo/erros. Se a exigência for **20 consultas SQL executando fisicamente ao mesmo tempo**, confira se o `Connection pool size` no Supabase comporta 20 e se a instância tem CPU/RAM e conexões reservadas suficientes. Não aumente automaticamente sem medir. Supavisor aceita clientes concorrentes acima do número de conexões físicas, enfileirando operações.

**Sobre SSL**: o código novo exige verificação do certificado TLS. Se o host usado precisar de CA específica, configure certificados corretamente; evite desativar `rejectUnauthorized` em produção. Uma URL com opções `sslmode` pode influenciar as opções TLS do driver `pg`.

## 4 — Instalar (Windows)

Faça backup do projeto e do banco. Extraia este ZIP. Abra PowerShell **na pasta extraída** e execute:

```powershell
.\INSTALAR_AUROX_TRIAGEM_POOL.bat "C:\manuSiteOficialOriginal" --check
```

Se o check passar:

```powershell
.\INSTALAR_AUROX_TRIAGEM_POOL.bat "C:\manuSiteOficialOriginal"
cd C:\manuSiteOficialOriginal
corepack yarn install
npx tsc --noEmit
npm run build
```

A instalação cria backup em `.manu-backups/triagem-pooler-...`. Acrescente `.manu-backups/` e `.aurox-backups/` ao `.gitignore` antes de commitar. Em homologação, teste login, listagem do painel, criação de lead, emissão de ficha e consultas simultâneas. Só então faça commit, push (incluindo `package.json` e `yarn.lock`) e confirme a publicação pela Vercel. **Habilite ou confirme Fluid Compute nas configurações da Vercel** para aproveitar o gerenciamento de conexões ociosas.

### Worker

O worker existente precisa ser **reiniciado depois de copiar as alterações** (ou receber novo deploy no Railway/Docker) para ativar o tick de 5 segundos:

```powershell
cd C:\manuSiteOficialOriginal\workers\aurox-whatsapp
node --env-file=.env index.mjs
```

É necessário `PUSH_DISPATCH_SECRET` com 32+ caracteres, **igual** na Vercel e no `.env` do worker. A função interna `/api/cron/triagem` só aceita POST autenticado. O Cloudflare Tunnel usado para acesso ao WhatsApp é um serviço diferente; a chamada do worker para `/api/cron/triagem` é uma requisição HTTPS *saindo* do worker para o MANU.

### Como conferir

- Em `/triagem`, um lead novo aparece no início e segue para a carteira após aprox. **10 a 15 s**, quando houver vendedor disponível e worker online. Pode ser mais em casos de latência, filas ou falha de rede.
- Sem ninguém abrindo `/triagem`, o worker continua efetuando a atribuição.
- Um lead da Empresa A nunca deve ser atribuído a vendedor da Empresa B.
- Se o worker estiver offline, o GET da página ainda funciona como fallback; mas **não** garante 10 segundos com a página fechada.
- Confira no Supabase os gráficos de conexões e latência antes/depois, e logs do worker (`[Aurox Triagem]`).

## 5 — Teste de 20 operações concorrentes (somente HOMOLOGAÇÃO)

O instalador cria `scripts/testar-pool-20.mjs`, que executa 20 `SELECT 1` em paralelo, passando por um pool local de **2 conexões**, liberando-as no fim. Isso exercita a fila do `pg.Pool` e o Supavisor sem ocupar 20 conexões físicas. Exige `DATABASE_POOLER_URL` de teste no `.env.local` (não cole segredos no chat):

```powershell
cd C:\manuSiteOficialOriginal
node --env-file=.env.local scripts/testar-pool-20.mjs
```

Aprovação do teste exige `20/20 operações concluídas`, mas **não garante 20 usuários simultâneos**. Para validar essa meta, rode uma ferramenta de carga HTTP autenticada com 20 usuários de teste contra a homologação, observando latência p95, falhas 5xx, tempo de fila, CPU e gráfico de conexões do Supabase. Evite carga em produção.

### Sessão de usuários e Push

Usuário conectado **não precisa manter socket PostgreSQL aberto**. A autenticação usa JWT (atualmente expira em **7 dias** no `lib/session.ts`) e cada requisição abre/reutiliza uma conexão temporária quando necessário. Web Push usa a assinatura do navegador e o Service Worker, separado do pool PostgreSQL; pode chegar com aba fechada quando navegador e sistema operacional permitem. Não é necessário manter a página aberta para receber Push. Se quiser login de longa duração com segurança, implemente renovação por refresh token rotativo (projeto separado) em vez de sessões infinitas; esta atualização não altera expiração de JWT.

## 6 — Observações e limites

- Não houve conexão com o banco real, execução de migrations, commit no GitHub nem deploy na Vercel.
- Esta atualização não requer migration SQL nova, mas **pressupõe** a existência das tabelas e colunas de triagem/empresa das migrations anteriores.
- Se o código do `lib/db.ts` foi alterado localmente, o instalador para e não sobrescreve. Isso protege atualizações concorrentes.
- **Não existe garantia de tempo exato de 10,000 s em um cron distribuído**. A regra é tempo mínimo de 10 s + frequência de 5 s + latência. Para SLA rígido, será necessário uma fila persistente e worker dedicado 24/7.
- **Serverless congelado** pode atrasar temporizadores de cleanup; `idleTimeoutMillis` e `allowExitOnIdle` encerram conexões quando a instância executa. O pooler remoto é o que permite compartilhar conexões mesmo quando instâncias se multiplicam.

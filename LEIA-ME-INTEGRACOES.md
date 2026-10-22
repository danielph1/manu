# MANU — Central de Integrações (OLX, NaPista e webhooks customizados)

## O que é este pacote?

Patch baseado no repositório público `danielph1/manu`, árvore GitHub `7fd7811941864f2e7f688353d2f02a388c2ecc3b`.
O projeto completo **não é incluído neste ZIP de patch**: o script `montar_manu_completo.py` baixa o snapshot original (sem acesso à sua conta), aplica as modificações e cria `MANU-INTEGRACOES-COMPLETO.zip` no **seu computador**. Ou aplique os arquivos sobre sua cópia existente com `python instalar_no_projeto.py CAMINHO_DA_PASTA_MANU`.

### O que foi implementado

- Nova página `/integracoes` e menu visíveis para admin, marketing e superadmin; validação equivalente em todas as APIs, consultando o papel vigente no banco.
- Superadmin escolhe empresa; admin/marketing veem somente sua empresa.
- Cadastro de OLX, NaPista e **qualquer nova origem capaz de disparar POST JSON**, com mapeamento configurável de campos, ativar/desativar, rotacionar URL, consulta de eventos.
- Token de 256 bits guardado somente como SHA-256 no PostgreSQL: mostrado uma vez, e sua URL pode ser rotacionada.
- Supabase Edge Function como receptor independente do deploy da Vercel, com função transacional e deduplicação.
- Leads recebidos entram em `public.triagem` com `empresa_id`, sem chamar o frontend e sem recarregar o browser manualmente.
- Triagem adaptada para restringir empresa e escolher somente vendedor da empresa correta; fluxo de atribuição transacional.
- Endpoints antigos `/api/olx` e `/api/napista` agora respondem HTTP 410: **atualize a URL cadastrada nos portais antes de usar em produção**. Eram inseguros.

### Pré-requisitos e backup

1. **Troque a senha exposta** do banco no painel Supabase antes de fazer deploy. Revogue quaisquer credenciais comprometidas. Mantenha `.env.local` fora do Git.
2. Faça **backup** do banco e copie uma versão local do projeto para trabalhar; este patch modifica a triagem e dois endpoints existentes.
3. Execute o diagnóstico SOMENTE LEITURA `supabase/diagnostico-estrutura.sql` para conferir os tipos das chaves de `empresas.id`, `usuarios.id` e `triagem.id` no banco real; a migração pressupõe `integer` para IDs de empresa/usuário e `bigint` para referência a triagem. A migração ainda **não foi executada nem validada no banco real**.
4. A aplicação já deve ter `DATABASE_URL`, `JWT_SECRET` forte, `NEXT_PUBLIC_SUPABASE_URL` e configurações Supabase corretas. O patch não inclui credenciais e não altera variáveis Vercel se URL pública já estiver configurada.

### Instalação Windows

1. Extraia este patch.
2. Abra o terminal no diretório extraído.
3. Para aplicar ao projeto já existente, execute `python instalar_no_projeto.py "C:\\caminho\\para\\manu"`.
4. OU dê dois cliques em `MONTAR_COMPLETO.bat` ou execute `python montar_manu_completo.py` para baixar snapshot público, aplicar as alterações e criar um ZIP do projeto completo. É necessária conexão com GitHub.
5. Revise as diferenças e `.backup-pre-integracoes` antes de usar.

### Banco (uma vez)

No Supabase, use **SQL Editor**, revise o arquivo `supabase/migrations/202610210001_manu_integracoes.sql` e execute. Não cole sua senha em SQL.

O SQL cria `manu_integracoes`, `manu_integracao_eventos`, função `manu_receber_webhook`, adiciona `triagem.empresa_id` e habilita RLS nas novas tabelas. Não apaga linhas antigas. Leads legados com `empresa_id NULL` não ficam visíveis para admin/marketing; superadmin deverá revisar atribuição.

### Edge Function (uma vez)

No terminal autenticado no projeto Supabase:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy manu-webhook --no-verify-jwt
```

Garanta que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` existam como secrets da função. Essas chaves não vão no frontend. A opção `--no-verify-jwt` é intencional: a função verifica o segredo imprevisível na URL e a autenticação adicional no PostgreSQL; OLX não envia um JWT Supabase.

**Segurança operacional:** trate a URL gerada como senha. Não a compartilhe, registre em analytics, ou a inclua em screenshots públicos. Copie-a para a configuração de leads da plataforma. Rotacionar invalida a anterior.

### OLX

No MANU, abra `Integrações` → selecione a empresa → `OLX` → crie. Copie a URL gerada e solicite/homologue integração de leads na OLX. O cadastro automático da URL pela API OLX e o OAuth **não estão implementados** neste patch: esta etapa inicial é recepção do webhook. Na documentação OLX, o escopo OAuth para configurar envio de leads é `autoservice`.

Documentação: https://developers.olx.com.br/lead/how_to.html e https://developers.olx.com.br/lead/leads.html

### NaPista

A plataforma consta como origem suportada por integradores terceiros; não confirmamos API/webhook direto de lead liberado publicamente. O canal estará preparado para receber JSON **se** o NaPista/integrador permitir informar URL externa. Em outras modalidades, como envio de leads por e-mail, será necessário desenvolver outro adaptador.

### Plataforma nova sem código

Escolha `+ Plataforma personalizada`, defina o identificador técnico (ex.: `mobiauto`) e os caminhos do JSON (ex.: `cliente.nome`, `cliente.telefone`, `veiculo.modelo`). O portal externo deve permitir envio HTTP POST `Content-Type: application/json` à URL secreta exibida. Eventos duplicados com mesmo identificador externo ou mesmo payload são ignorados. Para APIs que exigem OAuth, busca periódica, assinatura HMAC ou XML, há trabalho adicional de conector.

### Exemplo de teste manual (PowerShell)

Use a URL recém-gerada (não compartilhe). O exemplo usa dados fictícios:

```powershell
$webhook = 'COLE_A_URL_GERADA_NO_MANU'
$body = @{ source='olx'; name='Teste Local'; email='teste@example.com'; phone='21999999999'; message='Tenho interesse no veículo'; listId='12345'; linkAd='https://www.olx.com.br/'; externalId='teste-manual-001' } | ConvertTo-Json
Invoke-RestMethod -Uri $webhook -Method Post -ContentType 'application/json' -Body $body
```

A resposta deve retornar `ok:true`, `duplicado:false`, `responseId` e `triagem_id`. Repetir exatamente o mesmo teste deve retornar `duplicado:true`, sem gerar outro lead. Abra o painel `Integrações` → `Ver eventos` e depois `Triagem`.

### Limitações e cuidados relevantes

- Sem migração validada no seu banco e sem integração homologada externamente, **não marque como pronto para produção**.
- A página carrega novos eventos a cada 10 s; a triagem existente já atualiza periodicamente. Supabase Realtime pode ser integrado posteriormente.
- Integração OLX chat/mensagens é outro produto, com API e permissões próprias.
- O código já tinha outras rotas públicas de entrada e um handler Z-API que merecem auditoria; este patch corrige apenas OLX/NaPista e triagem, **não declara todas as APIs de entrada seguras**.
- O plugin de autenticação atual do MANU tem fallback que usa o JWT se a validação no DB falha; as novas rotas fazem verificação de perfil no banco sem esse fallback.
- Para produção SaaS, faça revisão de LGPD, retenção de payloads, rate-limits, alertas de falha, observabilidade e testes de concorrência/indisponibilidade.

### Recursos não alterados

Permanece a lógica existente de Z-API, histórico de chat e transferência dos leads; esta entrega não é uma revisão completa de segurança dessas áreas. O disparo antigo de `/api/leads/auto-passar` que ocorria em `GET /api/triagem` não é mais feito, porque precisava ser revisto para respeitar o isolamento por empresa. Revise esse comportamento antes de produção.

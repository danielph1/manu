# MANU — CÓDIGO COMPLETO ATUALIZADO (31/10/2026)

Este ZIP contém **o repositório inteiro enviado por você** (`manu-main.zip`), com as correções da Gestão de Atendimento, triagem, estoque/oficina, segurança de acesso e início de login oficial OLX incorporadas. Não precisa executar Python, instalar patch separado nem baixar repositório adicional.

## Abrir e iniciar no Windows

1. Extraia o ZIP em uma **pasta nova**, para preservar sua instalação atual.
2. Abra a pasta `MANU_Completo_Atualizado` no VS Code.
3. Copie seu `.env.local` atual para a pasta principal do projeto (não foi incluído no ZIP, por segurança). Use `.env.example` apenas como referência. **NUNCA cole senhas em `NEXT_PUBLIC_`**.
4. Execute no terminal:

```powershell
npm install
npm run build
npm run dev
```

O projeto é Next.js e normalmente abre em `http://localhost:3000`. Verifique o endereço informado no terminal.

## SQL / banco de dados

Antes de alterar o banco, faça backup. Use o SQL Editor do Supabase para verificar e executar, em ordem e **apenas se ainda não executadas**, as migrations do diretório `supabase/migrations/`:

- `202610210001_manu_integracoes.sql` (integrações, triagem por empresa, webhook);
- `202610220010_manu_oauth.sql` (conexões por empresa);
- `202610310001_atendimento_gestao.sql` (auditoria de transferências).

Outras migrations existentes devem ser avaliadas conforme seu histórico de banco. **Não atribua empresa_id a leads/veículos legados sem identificar a empresa correta.**

## O que foi alterado

- Corrigido `lib/supabase.ts` com inicialização tardia, para evitar `supabaseUrl is required` na coleta estática do Next.js quando variáveis ainda não foram carregadas; não elimina a exigência de chaves reais quando recursos de Supabase forem executados.
- Aba `/atendimento`: exibe leads sem resposta, fila e indicadores por vendedor; erros isolados das consultas aparecem como avisos em vez de zerar tudo silenciosamente. O acesso é permitido a `marketing`, `gerente`, `admin` e `superadmin` (o servidor também verifica).
- Transferências de leads entre vendedores da empresa e auditoria, com gerente limitado à loja; endpoint de cron autenticado para redistribuição (não executa automaticamente sem configurar agendamento).
- Permissões de estoque/oficina e separação por empresa; suporte a cadastro manual de veículo no estoque.
- Central `/integracoes`: botão **Conectar OLX** direciona ao login oficial OAuth quando sua integração for homologada. Webmotors/iCarros exibem passos de credenciamento em vez de pedir senhas dentro do MANU. Facebook/Meta, Mercado Livre e Z-API preservados da base original.

## OLX — configuração obrigatória (após homologação)

Para o botão funcionar, a OLX deve fornecer `OLX_CLIENT_ID` e `OLX_CLIENT_SECRET` ao MANU como integrador, com URI HTTPS de callback autorizada. Configure no ambiente **do servidor**, sem prefixo NEXT_PUBLIC:

```env
OLX_CLIENT_ID=SEU_CLIENT_ID
OLX_CLIENT_SECRET=SEU_CLIENT_SECRET
OLX_REDIRECT_URI=https://SEU-DOMINIO/api/integracoes/oauth/olx/callback
MANU_OAUTH_ENCRYPTION_KEY=CHAVE_ALEATORIA_DE_32_BYTES_EM_BASE64
```

Para gerar a chave no PowerShell (um único comando Node.js, não Python):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

O callback tentará registrar o webhook de leads. O funcionamento real depende de scopes, contas autorizadas e endpoints homologados; **não testado com credenciais reais da OLX**. Publicação de anúncios OLX, Webmotors e iCarros **não é automática nesta versão**; anúncios na fila não equivalem a publicações no portal.

## Diagnóstico do painel

Se `/atendimento` exibir aviso de informação parcial, verifique os logs do servidor Next.js (`[atendimento:...]`) e o histórico das migrations. Sem as tabelas e associações corretas no Supabase, o painel não pode exibir números confiáveis.

## Segurança

Não publique `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OLX_CLIENT_SECRET` ou `MANU_OAUTH_ENCRYPTION_KEY` no navegador. O ZIP não contém `.env.local`, `node_modules`, `.next` ou backups temporários. Ao implantar para mais empresas, revise outras rotas antigas de entrada de leads e habilite unicamente webhooks autenticados por empresa.

## Validações da entrega

- ZIP completo montado a partir do arquivo `manu-main.zip` fornecido nesta conversa.
- Verificação sintática de 249 arquivos TS/TSX/JS/JSX concluída sem diagnósticos.
- **Build Next.js não executado**: a instalação npm falhou porque o registry npm está inacessível neste ambiente (`EAI_AGAIN`). Faça `npm install` e `npm run build` na sua máquina para validar dependências e ambiente real.
- Não houve implantação no seu Supabase nem gravação no seu repositório GitHub.

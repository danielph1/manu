# MANU — Atualização de Gestão de Atendimento / Estoque / Triagem

Este pacote é uma **atualização incremental** sobre o repositório `danielph1/manu` (branch `main` analisada em 31/10/2026). Não contém uma cópia inteira do MANU. Não reescreve nem publica seu repositório.

## Instalar em Windows (PowerShell ou terminal VS Code)

1. Baixe o projeto `https://github.com/danielph1/manu` (ou abra seu clone local atualizado). Faça backup de seu `.env.local` e de banco.
2. Extraia este ZIP em uma pasta separada.
3. No terminal, execute:

```powershell
python "C:\CAMINHO\PARA\manu-patch\instalar_no_manu.py" "C:\CAMINHO\PARA\manu" --dry-run
```

4. Se o diagnóstico estiver correto, execute sem `--dry-run`:

```powershell
python "C:\CAMINHO\PARA\manu-patch\instalar_no_manu.py" "C:\CAMINHO\PARA\manu"
```

5. No Supabase SQL Editor, execute **apenas após backup** a migration:
`supabase/migrations/202610310001_atendimento_gestao.sql`.
6. No terminal da pasta MANU:

```powershell
npm install
npm run build
npm run dev
```

Se seu ambiente usa Yarn, `yarn install`, `yarn build`, `yarn dev` são alternativas.

O instalador **valida os pontos de integração antes de escrever**. Em caso de versão diferente, aborta sem modificar arquivos. Salva originais em `.manu-backups/atendimento-AAAA...` e NÃO modifica `.env*`.

## O que muda

- `/atendimento`: painel protegido para `superadmin`, `admin`, `gerente` e `marketing`, sem misturar empresas. Lista lead, veículo, contato, responsável e tempo sem resposta registrado no MANU. Estatísticas por vendedor de todas as lojas da empresa.
- `/api/atendimento`: API autenticada e escopada. Estatísticas de recebidos atuais no dia, pendentes +10 minutos e transferências por atraso realizadas hoje. **Recebidos atuais não contabiliza necessariamente todas as atribuições históricas do dia**.
- `/api/leads/[id]/passar`: transferência **transacional**, com escopo por empresa, gerente limitado à própria loja, escolhas de mesmo estabelecimento ou aleatório entre lojas da mesma empresa, e registro de auditoria.
- `/api/leads/auto-passar`: exige `CRON_SECRET` via header `x-manu-cron`, método POST; seleciona vendedor da **mesma empresa**, prefere loja de origem e grava transferências por atraso. Não roda automaticamente sem cron configurado.
- `/triagem`: gerente passa a consultar e distribuir os leads da empresa, com a mesma regra de empresa da triagem.
- Estoque: novo formulário simples de cadastro manual, restrito a `superadmin`, `admin`, `gerente`, `marketing`. O veículo criado recebe `empresa_id` obrigatório. Superadmin informa ID da empresa.
- Oficina: permissão de cadastro/edição para esses quatro papéis; leituras/alterações escopadas por empresa. Registros antigos sem empresa ficam invisíveis até regularização.
- Listagem/edição de anúncios, fotos do estoque e leads por ID recebem verificações adicionais de empresa.
- Rotação automática foi removida do simples GET da lista de leads. Utilize o endpoint de cron, autenticado, para ativá-la.

## Importante sobre integração com portais

**O repositório já possui** `manu_integracoes`, `manu_integracao_eventos`, RPC `manu_receber_webhook` e `supabase/functions/manu-webhook`, que são a base de recebimento. O pacote NÃO cria acesso automático a APIs de terceiros por descobrir e-mail e senha, nem simula uma publicação que não ocorreu. Para entrar leads reais, é preciso ativar o canal junto ao provedor e configurar o envio para o webhook da empresa.

### OLX — caminho oficial confirmado

1. Solicite homologação OLX em `suporteintegrador@olxbr.com`, conforme documentação oficial: https://developers.olx.com.br/lead/how_to.html . A integração de leads está associada a planos profissionais de Autos.
2. Obtenha credenciais OAuth e autorização necessária, incluindo `autoservice` para configurar leads e `autoupload` para enviar anúncios, conforme modalidade.
3. Em **Integrações** do MANU, selecione a empresa, configure o canal e gere sua URL exclusiva de webhook. A URL do lead precisa ser cadastrada com a OLX (homologação/configuração oficial).
4. Verifique a Edge Function e a RPC: `supabase functions deploy manu-webhook --no-verify-jwt`; os segredos da Supabase não devem ir no frontend.
5. Teste mensagem real OLX e verifique **Integrações > Eventos** e `/triagem`.
6. A integração de mensagens OLX chat pode entregar apenas aviso de conversa, conforme modalidade; conversar pelo CRM demanda suporte específico de API.

Mapeamento já existente: `name` -> nome, `phone` -> telefone (opcional), `email` -> e-mail, `adsInfo.subject` -> interesse/veículo, `message` -> mensagem, `externalId` -> chave de deduplicação. Quando `adsInfo.subject` não vier, a RPC tenta `listId` e `linkAd`. O anúncio do estoque deve ter identificador externo mapeado para associar lead à placa/veículo automaticamente; essa ligação de ID ainda não foi implementada neste pacote.

### Webmotors, iCarros, NaPista, Chaves na Mão, Facebook e WhatsApp

As plataformas têm fluxos de autenticação e permissões diferentes. Os endpoints genéricos do MANU podem **receber payloads encaminhados por um integrador oficial** por empresa. Não há comprovação de API pública de login universal + envio de anúncios para todas. Solicite contrato/documentação ao parceiro e valide o payload e as credenciais.

- Para Z-API, QR Code depende de uma **instância ativa** (credenciais/assinatura válidas). O código existente de QR deve ser configurado com a instância correta.
- Facebook/Instagram/WhatsApp Cloud exigem permissões da Meta, revisão de aplicação conforme caso e verificação de assinaturas webhooks.
- Mercado Livre já tem um esboço de publicação OAuth no repo; revise token refresh concorrente, categoria correta e atributos exigidos pela API antes de produção.
- Para OLX/Webmotors/iCarros/NaPista, o sistema de publicação atual pode registrar **fila interna**: isso NÃO significa que o anúncio foi publicado no portal. Só marque anúncio no ar após confirmação/ID externo real.

## Pendências antes do SaaS em produção

- **API dos portais**: obter homologação, credenciais por anunciante, webhook real e mapeamento de anúncios/veículos. Não solicite senhas das contas pessoais das plataformas dentro do MANU; use OAuth ou integração oficial.
- **Dados legados**: associar manualmente os registros de `estoque_carros`, `oficina_carros`, `leads` e `triagem` às empresas/lojas corretas. O pacote evita liberar registros de estoque/oficina com `empresa_id = NULL`; não executa associação automática para evitar mistura de empresas.
- **Isolamento total**: esta atualização reforça as rotas examinadas, mas ainda requer auditoria de todas as demais APIs (incluindo `entrada`, `webmotors`, `mercadolivre`, `facebook`, `instagram`, `whatsapp`, `fichas` e outras) antes de expor o sistema a empresas independentes. Alguns endpoints legados aceitam dados sem autenticação e sem empresa: **não devem ser publicados como receptores de leads de produção**.
- **Criptografia**: tabelas legadas de OAuth usam campos `access_token_enc` mas nem sempre criptografam o valor de fato. Planeje migração para armazenamento cifrado server-side; nunca exponha tokens/`DATABASE_URL` no frontend.
- **Métricas**: `respondeu` é um marcador do MANU, não garantia de que houve (ou não houve) contato fora do sistema. Defina SLA comercial e forma oficial de medir primeiro atendimento, com eventos de resposta, para métrica auditável de leads perdidos.
- **LGPD**: defina finalidade, retenção, acesso por papel/empresa, trilha de auditoria, exclusão e base legal para armazenar mensagens e dados de interessados.
- **Cron**: adicione `CRON_SECRET` seguro ao servidor e configure um agendador HTTPS para `POST /api/leads/auto-passar` com header `x-manu-cron`. **Não insira segredo na URL**. O cron não é ativado automaticamente por este pacote.

## Status de validação

- Inspeção do repositório GitHub concluída (somente leitura; o GitHub recusou `create_branch` com HTTP 403).
- Verificação de sintaxe do instalador Python e dos arquivos TypeScript/TSX novos.
- **Não foi executado o build Next.js completo nem testada conexão real com o seu Supabase.** Execute primeiro numa cópia do projeto, revise o diff gerado e confirme as tabelas/migrations.

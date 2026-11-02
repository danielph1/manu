# MANU / AUROX — Login responsivo e faturamento por empresa

## Entrega

Este ZIP **contém o projeto completo**, não apenas um patch. O login Aurox foi remodelado em layouts próprios para celular e desktop. O faturamento apresenta a **Autorização de Faturamento em HTML A4**, com a estrutura do PDF de referência da Manu Automóveis: cabeçalho, dados do comprador, veículo, negociação, financiamento, observações, cláusulas e assinaturas. A marca Manu foi reconstruída em HTML tipográfico, portanto não é um arquivo vetorial idêntico ao logotipo do PDF; no painel de emissor é possível inserir uma URL HTTPS da logo oficial.

### Proteção multiempresa

A emissão é vinculada a `faturamentos.empresa_id` e aos dados específicos em `manu_faturamento_config`. Usuários de empresa não podem consultar, editar, exportar ou anexar comprovantes de outras empresas, mesmo conhecendo um ID. O superadmin seleciona a empresa antes de listar/emitir.

**Atenção a registros legados**: a migration preenche `empresa_id` somente quando a empresa do usuário criador está identificada. Registros antigos sem empresa serão ocultados dos usuários comuns e precisam de vínculo administrativo conferido manualmente. Não associe por código da loja, pois lojas de empresas diferentes podem ter o mesmo código.

### Instalação

1. Faça backup do projeto atual e do PostgreSQL.
2. Extraia o ZIP numa pasta nova e copie o `.env.local` apenas para a nova pasta, sem enviar credenciais ao GitHub.
3. Execute no Supabase SQL Editor `supabase/migrations/202611020003_faturamento_empresa.sql` **uma única vez após aplicar as migrations anteriores**.
4. Execute `npm install`, `npm run build` e `npm run dev`.
5. Abra **Faturamento → Dados do emissor**, usando uma conta admin ou superadmin. Confira razão social, CNPJ, endereço, logotipo e textos legais. O superadmin deve primeiro selecionar a empresa.
6. Crie um faturamento e use **Imprimir** ou **Baixar HTML**. No navegador, selecione A4 / retrato / margens padrão mínimas; desative cabeçalhos/rodapés do navegador para um documento mais parecido com o modelo.

### Dados da Manu e das outras empresas

A migration cadastra inicialmente os dados específicos da **Manu Automóveis / RLINE AUTOMOVEIS LTDA** somente para empresas cujo nome comece com `Manu Autom...`, e apenas caso não tenham configuração anterior. Nenhum desses dados é copiado para outras empresas. Para outra empresa, o administrador deve fornecer sua própria razão social, CNPJ, endereço, condições comerciais e texto jurídico.

**Revisão jurídica obrigatória**: o texto de cláusulas do PDF foi preservado como referência do cliente. Não foi validado juridicamente. Há expressões sobre garantia legal e quilometragem que devem ser verificadas antes de utilizar documentos em contratos reais. O HTML não constitui certificado jurídico.

### Código alterado

- `app/login/page.tsx` — nova composição adaptável.
- `app/(dashboard)/faturamento/page.tsx` — gestão, impressão, loja e configuração por empresa.
- `lib/faturamento-html.ts` — documento A4 de referência, com dados e cláusulas do emissor.
- `lib/faturamento-empresa.ts` — autorização de acesso por empresa.
- `app/api/faturamento/{route.ts,empresas,config,[id],[id]/html,[id]/anexos,excluir,liberar}` — endpoints protegidos.
- `supabase/migrations/202611020003_faturamento_empresa.sql` — schema, migração segura de históricos e configuração legal por empresa.

### Validação realizada neste ambiente

- Verificação de sintaxe TypeScript/TSX do projeto completo.
- Verificação de rotas duplicadas Next.js.
- Exportação visual de uma página A4 de teste com um renderizador HTML para PDF.

**Não foram realizados**: build completo com dependências do npm, teste autenticado com o Supabase do proprietário, validação jurídica das cláusulas, homologação de impressão em todas as versões do Chrome/Edge. Essas etapas precisam ser conferidas antes de produção.

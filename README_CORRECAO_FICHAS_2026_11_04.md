# MANU / Aurox — v7 • Persistência de fichas bancárias

Atualização sobre o projeto completo MANU v6. Não é um gerador: todos os arquivos da aplicação estão incluídos.

## Por que os problemas aconteciam

1. O painel interpretava `leads.aprovado = false` (valor inicial legado) como **Recusado** mesmo antes de uma decisão da financeira.
2. A ficha só gravava as mudanças ao clicar em **Salvar e devolver ao vendedor**; fechar a janela antes descartava o conteúdo preenchido.
3. A API ignorava `fin_parcelas`, `fin_valor_parcela` e não expunha ao vendedor as observações individuais dos bancos.
4. A operação de salvar os bancos não era transacional. Bancos recém-criados sem ID podiam ser inseridos repetidas vezes.
5. Alguns campos do lead preenchidos no cadastro novo não eram incluídos na inserção no PostgreSQL.
6. O faturamento de instalações antigas podia não ter a coluna `gerente_nome`.

## O que mudou

- Novas fichas entram em **Pendente**. Só uma decisão explícita altera o status para **Aprovada** ou **Negada**.
- No painel, o cartão de lead segue `status_ficha` e **não** considera `aprovado=false` uma negativa automática.
- O formulário salva **automaticamente após ~1,2 segundo sem mudanças**, e tenta salvar antes de fechar (inclusive no botão X). Se falhar, mantém a janela aberta para evitar perda.
- A API grava dados gerais, etapas e todos os bancos na **mesma transação PostgreSQL**, com rollback em caso de falha. Bancos novos usam uma chave estável (`client_key`) para evitar duplicação durante autosave.
- As observações de cada banco, a orientação geral e as próximas etapas aparecem na visualização do vendedor. Ao clicar **Salvar e devolver ao vendedor** ou fechar após editar, o vendedor recebe uma notificação interna (e web push, se configurado).
- `fin_parcelas` e `fin_valor_parcela` passam a ser salvos e recuperados.
- Campos complementares do veículo e do empregador entram na criação de lead.
- Coluna `gerente_nome` adicionada de modo idempotente pela migration.
- Nenhuma aprovação/recusa antiga explicitamente registrada é reclassificada automaticamente.

## Instalação — a ordem é importante

1. Faça backup dos dados do Supabase antes de alterar as tabelas.
2. No Supabase → SQL Editor, execute `supabase/migrations/202611040002_fichas_persistencia.sql`. Também há uma cópia TXT do arquivo ao lado do ZIP para facilitar abrir no Windows.
3. Publique o conteúdo deste ZIP numa pasta limpa do seu repositório. Copiar por cima sem apagar arquivos removidos pode fazer reaparecer páginas duplicadas antigas. Use `git add -A` e confirme que `node scripts/check-routes.mjs` encontra 38 páginas sem colisões.
4. Preserve as variáveis privadas do seu `.env.local` **no seu computador ou na Vercel**, sem incluí-las no GitHub.
5. Execute `npm install`, `npm run prebuild`, `npm run test:fichas`, `npm run build` e implante na Vercel.

> A migration **é obrigatória antes de testar as novas fichas**. Ela adiciona o identificador idempotente dos bancos e os campos faltantes. Se o código for publicado sem a migration, a API pode retornar erro e o formulário avisará sobre a falha no salvamento.

## Roteiro de validação

1. Crie um lead novo, gere a ficha e verifique: **Ficha pendente**, não Recusado.
2. Entre na ficha como admin, gerente, superadmin ou ElfenAI. Edite banco, status, 48x/60x, observação, boleto e etapas. Espere a indicação **salvo automaticamente**.
3. Feche pelo X e reabra: cada campo, checkbox e banco deve manter seu valor.
4. Altere uma observação e clique em **Salvar e devolver ao vendedor**. Entre como vendedor responsável: confira a resposta na ficha e a notificação do sistema.
5. Mude o status geral para **Negada** e confira que agora o cartão aparece Recusado; mude de volta para **Pendente** para remover a negativa.
6. Gere faturamento e confirme que a coluna `gerente_nome` não provoca erro.
7. Repita o teste com duas empresas distintas e verifique se ninguém consegue abrir ficha de outra concessionária.

## O que a migração não faz

- Não restaura campos que já haviam sido perdidos em um salvamento anterior que falhou.
- Não adivinha respostas de bancos nem decide aprovações por score estimado.
- Não faz deploy automaticamente, não altera tokens e não acessa o banco remoto.

**Validação deste pacote:** análise de sintaxe TypeScript/JavaScript, 15 verificações estáticas da persistência, 27 verificações de permissões e verificação de rotas. Sem dependências instaladas nem acesso ao banco, não foi possível executar um build completo ou um teste real de leitura e gravação no Supabase.

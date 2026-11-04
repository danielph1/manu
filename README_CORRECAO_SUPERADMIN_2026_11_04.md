# MANU — correção de permissões do Superadmin (04/11/2026)

## O que mudou

- **Superadmin herda todas as permissões de Admin** em `lib/session.ts` (incluindo edição de ficha de banco), além de permissões globais já existentes.
- Corrigido nome da função importada em `app/api/leads/[id]/route.ts`: agora `lib/lead-access.ts` exporta também `podeAcessarLead`, mantendo checagem efetiva por empresa/loja/vendedor.
- **Novo lead:** Superadmin escolhe a **empresa e o vendedor** (não precisa ser vendedor). A empresa do lead é determinada pelo vendedor no backend. Administradores comuns só podem atribuir à própria empresa; gerentes somente à loja deles.
- Criação de lead + ficha passa a ocorrer numa única transação no PostgreSQL: se a ficha falhar, a transação é revertida.
- O formulário de lead grava também os dados complementares preenchidos na criação, em vez de ignorá-los.
- **Fichas:** edição e anexos agora validam o escopo, e a atualização de um banco exige que ele realmente pertença à ficha.
- A geração de faturamento pela ficha inclui empresa e loja do vendedor responsável, para o superadmin não perder o contexto da emissão.
- Metas e status de Z-API incluem superadmin entre os cargos que podem executar ações administrativas.
- O Feed permanece exclusivo do Superadmin, no menu e nas rotas de API.
- As mensagens genéricas "Erro ao salvar" agora distinguem erros HTTP e problemas de conexão quando a API não devolve um texto específico.

## Instalação no Windows / Vercel

1. Faça cópia de segurança de seu projeto e banco.
2. Extraia este ZIP em uma pasta NOVA. **Não copie por cima de uma pasta antiga**, porque arquivos de páginas removidas podem continuar no GitHub e causar o erro de rotas duplicadas.
3. Copie seu `.env.local` antigo para a pasta nova; ele não está neste ZIP por segurança.
4. As migrations anteriores, especialmente `202611030001_isolamento_integracoes_chat.sql`, precisam estar aplicadas no Supabase. **Esta atualização não exige migration nova.**
5. No terminal da pasta extraída, execute `npm install`, `npm run prebuild`, `npm run test:permissoes`, `npm run build` e `npm run dev`.
6. Para enviar ao GitHub, confirme a remoção das páginas duplicadas, inclusive `app/(dashboard)/ajuda/page.tsx` e `app/(dashboard)/privacidade/page.tsx`, e registre exclusões com `git add -A`.
7. Faça o deploy e teste com um superadmin e uma conta admin de uma empresa de testes.

## Teste recomendado

- Criar um lead como superadmin escolhendo empresa e vendedor. Confirmar `empresa_id` e `vendedor_id` na tabela `public.leads`.
- Criar outro lead com "Gerar ficha" marcado e confirmar um registro correspondente em `public.fichas_credito`.
- Editar o lead e salvar os dados. Se surgir erro, a mensagem agora informa o status ou o erro retornado pela API.
- Abrir e salvar uma ficha como superadmin, alterando o banco e o status; verificar que o lead corresponde à mesma empresa.
- Gerar faturamento a partir da ficha e conferir empresa e loja.
- Entrar como admin/gerente/vendedor e garantir que nenhuma pessoa de outra empresa fique visível; testar a restrição do Feed ao superadmin.

## Validação executada

- Sintaxe de 269 arquivos JavaScript/TypeScript: **sem erros sintáticos**.
- `npm run prebuild`: 38 rotas de página, sem conflitos.
- 27 verificações locais das permissões e invariantes do Feed: aprovadas.

**Não foi feito um `next build` nem testes reais conectados ao seu banco** neste ambiente. O código foi corrigido, mas os endpoints e as colunas precisam ser confirmados na implantação. Não substitua uma auditoria completa de isolamento multiempresa por estes testes estáticos.

# MANU — Atualização Usuários, Hierarquia e Processador de Mídia

Este ZIP é o **projeto completo** com as atualizações anteriores preservadas. Não requer Python ou aplicador de patches.

## 1. Antes de atualizar

- Faça backup do banco Supabase/PostgreSQL e do projeto publicado.
- Extraia o ZIP numa pasta limpa; preserve apenas as credenciais de produção no ambiente seguro da Vercel e o `.env.local` local (nunca publique segredos no repositório).
- Confirme que `supabase/migrations/202611020001_manu_melhorias.sql` já foi aplicada. Depois execute no SQL Editor **`202611020002_manu_media_jobs.sql`**.
- Execute `npm install`, `npm run build`. O script de pré-build detecta páginas Next.js duplicadas.
- Se sua branch antiga ainda contiver `app/(dashboard)/privacidade/page.tsx`, apague **esse arquivo duplicado**; a página correta é `app/privacidade/page.tsx`. Copiar arquivos por cima sem remover os arquivos excluídos pode manter o conflito na Vercel.

## 2. Nova aba Usuários / vendedores

Menu → Usuários / vendedores, apenas `marketing`, `admin` e `superadmin`.

| Cargo que cria | Quem pode cadastrar |
|---|---|
| Superadmin (nível 1) | Admin (2), Gerente/Marketing (3), Vendedor/Mecânico/Guariba (4) |
| Admin (nível 2) | Gerente/Marketing (3), Vendedor/Mecânico/Guariba (4) |
| Marketing (nível 3) | Vendedor/Mecânico/Guariba (4) |
| Gerente (nível 3) | Sem acesso ao cadastro |
| Nível 4 | Sem acesso ao cadastro |

Superadmin não é criado por essa tela; a concessão desse papel é reservada à administração da plataforma.

Os cadastros são transacionais. O login deve ser único; senha é protegida por PBKDF2-SHA256 com salt (compatível com o login atual do MANU). `vendedor` também cria um registro em `public.vendedores`, vinculado à empresa e loja. Nenhum cargo pode criar ou alterar alguém de nível igual ou superior. É possível desativar e reativar contas subordinadas.

**Importante:** o usuário deve existir em empresa e loja previamente cadastradas. No caso de erro da restrição `usuarios_loja_check`, aplique primeiro a migration 202611020001.

## 3. Processador de vídeos real

O site envia MP4/WebM até 25 MB diretamente ao Storage do Supabase e grava um job na tabela `public.manu_media_jobs`. O worker Node/FFmpeg (na pasta `workers/media-processor`) gera MP4 H.264/AAC, até 720p, removendo metadados. Só substitui o vídeo publicado se o arquivo ficar menor. Em caso de falha, o original é preservado; a fila admite novas tentativas.

**A Vercel sozinha não executa processamento em background permanente.** Para ativar compactação automática de vídeos, é necessário iniciar o worker separadamente, em VPS ou contêiner Docker. O README dentro da pasta do worker explica execução direta e por Docker. Até lá, os vídeos originais são publicados normalmente e permanecem aguardando processamento.

Fotos já são comprimidas no navegador pelo fluxo existente. A qualidade/resolução final depende da origem; não é possível manter absolutamente todos os detalhes comprimindo um vídeo.

## 4. Correção de deploy da captura

O build anterior falhou porque havia duas páginas atendendo a `/privacidade`:

- `app/(dashboard)/privacidade/page.tsx`
- `app/privacidade/page.tsx`

Este projeto completo **mantém apenas a segunda**. O novo `scripts/check-routes.mjs` roda automaticamente antes de `next build` para detectar duplicações futuras.

## 5. Segurança e testes

As permissões são verificadas no servidor lendo o usuário atual no PostgreSQL (não somente no frontend); empresas e lojas são verificadas antes de cadastrar. O processador não disponibiliza chaves secretas no navegador. Os arquivos fornecidos não incluem `.env.local`, `.env.worker` nem chaves privadas.

Validação de sintaxe concluída com ferramentas locais; **build de produção e testes reais no Supabase não foram executados** porque o npm registry ficou inacessível no ambiente de preparação. Valide numa cópia de teste antes do deploy.

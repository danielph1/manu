# Aurox v16 — Anúncios, preferências por empresa, comentário interno e chat

Este pacote foi preparado a partir do MANU v12 com os hotfixes v13, v14 e v15 aplicados. Para instalações com correções locais posteriores, utilize **o ZIP pequeno somente de arquivos alterados**, sobre sua própria cópia, e sempre faça backup.

## Atualização

1. Faça backup do código e do banco.
2. No Supabase SQL Editor, execute `supabase/migrations/202611060001_preferencias_anuncios.sql` **uma única vez**, antes de publicar a interface.
3. Copie os arquivos do hotfix, preservando pastas. O `package.json`/`package-lock.json` incluem `sharp` 0.35.5 para as imagens (implementação v15).
4. Na raiz: `npm install` e `npm run build`. Corrija eventuais erros do seu ambiente antes de enviar à produção.
5. Publique no GitHub/Vercel. NÃO atualize o worker Aurox-WhatsApp, Docker ou Cloudflare: não há mudança nele.
6. Abra **Anúncios**, selecione o veículo. Preencha o telefone e escolha Estado/Cidade (IDs automáticos). Clique em **Salvar dados da loja agora** ou deixe **Lembrar ...** marcado ao publicar. A preferência é POR EMPRESA, não por navegador nem por usuário.
7. Escolha a **categoria** (ex.: para Honda PCX, `Motos e scooters`) e preencha os atributos obrigatórios retornados pelo Mercado Livre. O Aurox consulta `/categories/{id}/attributes` e refaz a pré-validação da publicação.
8. No **Chat**, no celular a lista leva à tela de conversa; no desktop as duas ficam lado a lado. Vendedor responsável ou superadmin pode criar **Nota interna** em Informações; ela não vai ao WhatsApp e fixa o lead com o vendedor atual. Notas são imutáveis no histórico.

## Limites importantes

- Campos exigidos pelo Mercado Livre mudam por categoria, conta e condições de publicação. O Aurox consulta atributos dinâmicos e apresenta falhas da validação oficial. Isso não garante aprovação do portal em todos os cenários; a conta ainda precisa de pacote de veículos contratado.
- O suporte dinâmico abrange **Mercado Livre**. OLX, Webmotors, iCarros, Facebook e os demais canais só geram fila/intenção enquanto não houver implementação e aprovação da API própria. Nunca trate fila como publicação.
- Lead com nota interna não roda automaticamente nem é transferido manualmente por outro perfil. Um superadmin pode confirmar transferência excepcional; a rotação continua bloqueada.
- Não altera registros existentes de leads, chat, estoque ou faturamento. A migration cria uma tabela nova de preferências e marca como não rotativos os leads que já possuíam nota interna.
- Não usa `localStorage` para preferências da empresa: persistência é no PostgreSQL com verificação da empresa vinculada ao veículo.
- Nenhum teste foi realizado com sua conta real do Mercado Livre ou seu banco de produção. Testes estáticos/funcionais simulados não substituem teste real de publicação e de permissões.

## Diagnóstico

- Erro de `TRIM`, `KILOMETERS`, `FUEL_TYPE`, `DOORS`: confira se a categoria está correta e complete os campos dinâmicos. Uma PCX deve estar em **Motos**, não **Carros e caminhonetes**.
- Erro ao salvar contato/local: confirme a migration e `DATABASE_URL` funcionando na Vercel.
- Falha em `/categories/.../attributes`: confira a autorização da empresa em Integrações.
- Não consegue mandar nota interna: a sessão deve ter perfil `vendedor` responsável pelo lead ou `superadmin`.
- Depois de instalar dependências, execute `node --test tests/aurox-v16-regressions.test.cjs` (requer pacote `typescript`).

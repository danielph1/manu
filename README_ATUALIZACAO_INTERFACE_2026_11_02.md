# Aurox / MANU — atualização da interface (02/11/2026)

Esta é a pasta **completa** do MANU, baseada em `MANU_Completo_Atualizado_Usuarios_Hierarquia_Processador_Midia.zip`. Não é um patch. **Não precisa de Python ou gerador**: extraia o ZIP em nova pasta, restaure sua configuração privada e rode o Next.js.

## O que mudou

- Login `/login` redesenhado para desktop e celular, mantendo a marca Aurox e os campos de login/senha atuais. Inclui acesso público a `/termos`, `/privacidade` e `/ajuda`.
- Removidos os links Ajuda / Termos de Uso do menu lateral. Agora estão em Configurações, com o link de Termos apontando corretamente para `/termos`. A página Ajuda é pública para leitura das orientações; abrir/acompanhar chamados exige autenticação.
- Feed removido da barra inferior e oculto para todos menos o superadmin; rotas do feed também exigem superadmin no servidor. **Observação**: mídias antigas no bucket de armazenamento público podem permanecer acessíveis por URL pública direta. Para acesso sigiloso a vídeos/fotos, configure bucket privado e distribuição de URLs assinadas antes da produção.
- Painel de leads: ações em massa foram transferidas para uma **barra fixa** exibida somente com seleção. Ações: atendido, não atendido, excluir, adicionar à lista, agendar e favoritar. A seleção por toque prolongado em celular e via botão de Ações no desktop foi preservada. Limite: 100 leads por operação. Permissão no servidor restrita a gerente, marketing, admin e superadmin, com verificação de empresa/loja.
- Novo agendamento em massa usa a mesma data/hora para os selecionados; favoritos são inseridos sem duplicação e as listas continuam locais por usuário/dispositivo, como no projeto original. Para listas sincronizadas entre dispositivos será preciso migrar as listas do `localStorage` ao banco.
- Na Central de Integrações, OLX permanece com OAuth oficial (requer homologação e credenciais no servidor). Webmotors e iCarros agora apresentam acesso direto ao portal da concessionária e encaminham para solicitação de ativação técnica. **Abrir/login no portal ainda não ativa, sozinho, a integração automática MANU**. Isso depende do credenciamento e das APIs/parcerias de cada provedor.

## Instalação sem scripts de migração

1. Faça cópia/backup da versão atual do projeto e do banco.
2. Extraia este ZIP em uma pasta nova no Windows.
3. Copie **somente no seu computador** o arquivo `.env.local` da versão anterior; nunca o adicione ao GitHub.
4. No terminal dessa pasta rode `npm install`, `npm run build` e `npm run dev`.
5. Se for publicar pelo GitHub, faça `git add -A`, `git commit -m "Aurox: interface, acoes em massa e navegacao"` e `git push`. **`git add -A` é importante para remover arquivos antigos deletados/movidos**, como uma possível página duplicada de `/privacidade`.
6. No Vercel, verifique se o último deploy aponta para o commit recém-enviado.

### Banco

Esta versão **não introduz uma nova migration**; depende das migrations anteriores do projeto, incluindo as tabelas de favoritos, leads, feed e suporte já existentes.

## Limitações e validação

- O repositório foi verificado quanto à sintaxe TypeScript/JSX e às rotas Next.js duplicadas.
- **Build completo `next build` e testes com seu banco/provedores externos não foram executados.** O registro npm não estava totalmente disponível para instalar as dependências neste ambiente.
- O acesso automático a leads/anúncios Webmotors/iCarros não está habilitado até a homologação de integrador. Botões de entrada no portal não representam vínculo OAuth ao MANU.
- O envio de fotos/vídeos continua usando o Storage do Supabase; processamento automático de vídeo exige o worker FFmpeg documentado anteriormente.

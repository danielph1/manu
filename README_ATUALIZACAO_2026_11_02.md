# MANU — atualização completa de 02/11/2026

## O que mudou

- **Cadastro de empresas**: transação atômica no PostgreSQL. Caso haja login duplicado, falha de validação de loja ou erro no usuário administrador, a empresa e as lojas NÃO ficam cadastradas pela metade. A migration atualiza o check antigo `usuarios_loja_check`, removendo restrições de códigos fixos e mantendo validação no backend.
- **Oficina**: para superadmin, dropdown Empresa → Loja; para os demais, escopo da empresa da sessão. Validação de loja no backend; filtro de empresa preservado ao buscar, inclusive sob busca textual. Permissões adicionadas para marketing e superadmin.
- **Tarefas**: botões de seleção, selecionar todas e excluir em massa (até 100); cargos admin, gerente, marketing e superadmin. API verifica empresa/loja e papel antes de modificar/excluir.
- **Leads**: seleção múltipla (botão no desktop; segurar ~650 ms no card de celular) e ações de exclusão, marcar atendido ou pendente. API valida todos os IDs e vendedores da mesma empresa/loja antes de operar; não permite ação parcial se houver um ID sem permissão.
- **Integrações**: remove duplicação do formulário manual de OLX, Webmotors e iCarros. O OAuth da OLX, Mercado Livre e Meta disponível no projeto requer credenciais/homologação válidas. Webmotors e iCarros dependem de relacionamento/credenciamento técnico: não há login fabricado.
- **Feed**: todos os usuários autenticados podem publicar **somente foto ou vídeo**, com descrição opcional. Upload diretamente no Supabase Storage com autorização temporária vinculada ao usuário. Fotos comprimidas no navegador, vídeos até 25 MB (MP4/WebM), sem transcoding automático. Autor pode excluir seus posts; visualizações são únicas por usuário/post, não por abertura. Navegação inferior permanece visível no feed.
- **Perfil**: upload valida tipos JPG/PNG/WebP e limite de 512 KB; cliente já usa compressão de avatar.
- **Termos, privacidade e ajuda**: Termos e Privacidade agora são acessíveis sem login; página Ajuda com FAQ, abertura de chamados e administração de chamados pelo superadmin. Termos são minuta, exigem revisão jurídica.
- **Notificações da oficina**: segmentadas pela empresa, evitando envio geral a todos os gestores de todas as empresas.

## INSTALAÇÃO (sem Python)

1. **Faça backup do seu banco Supabase e do `.env.local` atual.**
2. Extraia este ZIP em uma **pasta nova** e abra-a no VS Code.
3. Copie o seu `.env.local` local ou configure as variáveis do deploy. **Não envie segredos ao GitHub.**
4. No **Supabase SQL Editor** (projeto do MANU, não outro projeto), execute:
   `supabase/migrations/202611020001_manu_melhorias.sql`
   Após o backup e após migrations anteriores. Atenção: a migration substitui `usuarios_loja_check` e recalcula contagens antigas de visualização como zero, pois não existiam registros de espectadores únicos anteriores.
5. O bucket de Storage `manu_arquivos` precisa existir e permitir leitura pública de mídias compartilhadas no feed; configure tamanho máximo de objeto de acordo com o seu plano Supabase. O backend usa service role SOMENTE no servidor e tokens temporários para o navegador.
6. Execute `npm install`, `npm run build` e `npm run dev` na pasta extraída.
7. Confirme os testes abaixo antes de publicar: operações multiempresa, cadastro de empresas, feed, autorização de uploads, exclusão, tarefas e permissões.

## Sobre a tela de empresa duplicada

O erro anterior `new row for relation "usuarios" violates check constraint "usuarios_loja_check"` ocorria DEPOIS de criar empresa e lojas; havia cadastros incompletos. A nova transação impede isso em novas criações. **Não elimina automaticamente as empresas antigas**: o superadmin deve avaliar os registros existentes e desativar/arquivar as duplicadas de maneira consciente, preservando históricos. Antes de cadastrar novamente, procure a empresa pelo nome e slug.

## OLX, Webmotors e iCarros

- **OLX**: a autorização funciona no domínio oficial da OLX. `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, `OLX_REDIRECT_URI` exigem homologação. A conexão OAuth não significa, por si só, que publicação de anúncio está implementada. Documentação: https://developers.olx.com.br/anuncio/api/oauth.html
- **Webmotors**: acesso pela plataforma Cockpit e credenciais do perfil de Integrador de API. Nenhum login OAuth público do tipo OLX foi implementado, pois depende da autorização e documentação do parceiro. https://portal-webmotors.sensedia.com/api-portal/documentacao/faq
- **iCarros / NaPista / Chaves na Mão**: integrações de parceiro seguem dependentes de documentação/credenciamento e webhooks reais. O MANU não coleta as senhas de terceiros.
- **Mercado Livre / Meta / WhatsApp Z-API**: manter os fluxos existentes; não trocar credenciais entre empresas.

## Testes de aceitação sugeridos

- Superadmin cadastra empresa com 2 lojas, administrador já associado à primeira loja; repetir o mesmo login deve retornar 409 e não criar empresa nova.
- Registrar empresa com código de loja não fixo (`ABC01`). Após aplicar migration deve aceitar e mostrar a loja correta.
- Administradores não podem criar/excluir tarefas ou leads de empresas diferentes, mesmo conhecendo o ID.
- No painel de leads, selecionar dois cards, marcar atendidos, conferir atualização. Em touch, segurar card inicia seleção.
- Na oficina, superadmin escolhe empresa e loja pelo dropdown; não digita ID. Gerente não consegue editar veículo de outra empresa.
- No feed, publicar foto WebP comprimida, ver a imagem, comentar, curtir, excluir própria publicação; a visualização deve aumentar apenas na PRIMEIRA abertura por aquele usuário. Testar vídeo MP4/WebM menor que 25MB.
- Conferir se a barra inferior continua visível durante scroll do feed.
- Usuário abre chamado em Ajuda; superadmin vê o chamado e altera status.
- Publicação de anúncios externos deve exibir comprovante de publicação real, nunca `fila` como se estivesse no ar.

## Limites conhecidos (não ocultados)

- Não foi possível executar `npm run build` nesta infraestrutura porque a instalação do registro npm excedeu o limite de execução. **Foram feitas verificações sintáticas dos arquivos, não um build e2e**.
- Vídeos não são transcodificados automaticamente: a compactação sem perda visual significativa, em grandes volumes, exige pipeline separado de FFmpeg/MediaConvert. O limite de 25 MB é uma contenção de armazenamento, não um encoder.
- As APIs dos portais dependem de homologação e credenciais. O MANU não obtém automaticamente permissões de parceiros sem autorização.
- Os dados antigos de empresa ou loja com `NULL` precisam de vinculação e revisão manual. A atualização não atribui automaticamente dados sensíveis a uma empresa incerta.
- LGPD: este pacote fornece controles técnicos básicos; política e termos precisam de revisão jurídica e de um processo operacional para solicitações de titulares.

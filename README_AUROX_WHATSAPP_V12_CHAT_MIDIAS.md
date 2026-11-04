# MANU v12 — Chat com foto e áudio reais (Aurox-WhatsApp)

Esta atualização parte da v11 e altera APENAS o fluxo de chat, triagem e Aurox-WhatsApp.
Não altera fichas, faturamentos, usuários, métricas nem dados cadastrais.

## Instalação em uma base existente (recomendada)

1. Faça backup da pasta do MANU e do Supabase.
2. Copie o conteúdo do ZIP `MANU_Hotfix_v12_Chat_Fotos_Audios.zip` PARA A RAIZ do projeto, conservando subpastas. Não substitua seu `.env` nem a pasta `workers/aurox-whatsapp/data`.
3. No Supabase SQL Editor, execute `supabase/migrations/202611040004_aurox_whatsapp_chat_midia.sql` (também incluído como arquivo de texto). Esse passo é OBRIGATÓRIO ANTES do deploy do código novo.
4. Publique as alterações no GitHub/Vercel para atualizar as APIs. Confirme que `SUPABASE_SERVICE_ROLE_KEY` já funciona (mídia recebida fica no bucket privado `aurox-wa-media`).
5. No PC Windows, interrompa o worker com Ctrl+C e execute:
   cd C:\manuSiteOficialOriginal\workers\aurox-whatsapp
   node --env-file=.env index.mjs
6. Mantenha aberto também o Cloudflare Tunnel já configurado. Não precisa reconectar o QR Code se a sessão LocalAuth persistida ainda estiver válida.

## Fluxo corrigido

- Mensagens recebidas: são associadas por ID à mensagem Aurox (incluindo mídia no bucket privado) na triagem e após atribuição ao vendedor.
- Mensagens recebidas antigas: migration tenta recuperar a associação com foto/áudio existente SOMENTE quando há correspondência não ambígua por lead, empresa, texto e hora. NÃO baixa mídia que o WhatsApp/worker nunca armazenou. Nesse caso, peça o reenvio do arquivo.
- Chat: busca URL temporária autenticada com a permissão do lead para mostrar foto e tocar áudio, sem duplicar o arquivo no PostgreSQL.
- Prefixos [cliente] e [Aurox-WhatsApp] são ocultados da conversa. Mensagens novas não recebem esses prefixos.
- Envio: arquivo foto/áudio real segue via MessageMedia do worker; NÃO transmite a palavra 'Áudio' ou 'Foto' como mensagem para o cliente.
- Vídeos são bloqueados no chat e ignorados no receptor do Aurox-WhatsApp.
- Se o Aurox não estiver conectado, o arquivo é salvo apenas no MANU e o usuário recebe um aviso; NUNCA ocorre fallback automático para Z-API com uma mídia.
- Áudios WebM gravados no Chrome são enviados como anexo de áudio (arquivo .webm), não necessariamente como mensagem de voz nativa. No Firefox ou em outras plataformas com OGG/Opus, o worker pode enviar como voz. A exibição exata depende do aplicativo WhatsApp e deve ser testada.

## Limites e segurança

- Envio pelo chat: até 4 MB de foto/áudio por mensagem, sem vídeo.
- Recebimento: até 8 MB no bucket privado, conforme migration v10 anterior.
- URL assinada de leitura: 10 minutos e apenas emitida após validação do usuário, permissão do lead e empresa.
- O segredo AUROX_WA_WORKER_SECRET fica apenas no servidor. NÃO cole em prints ou repositórios.

## Teste recomendado

A. Envie do celular para o WhatsApp conectado uma foto e um áudio; confira o registro no terminal (mídia=sim), triagem e chat após atribuição.
B. Abra uma conversa já existente: a migração tenta vincular as fotos/áudios antigos somente se puder fazê-lo sem ambiguidade.
C. No chat do MANU, envie uma foto e um áudio para um lead com número válido. Confira se o cliente RECEBE o arquivo, não a palavra 'Áudio'.
D. Confira a mesma operação para uma segunda empresa: nenhuma conversa ou mídia deve cruzar empresas.
E. Teste no celular (PWA) e no navegador desktop. Se uma URL expirar, use 'Atualizar arquivo'.

## Verificações neste ambiente

- Node.js: `node --check workers/aurox-whatsapp/index.mjs`.
- Testes simulados: `NODE_PATH=$(npm root -g) node --test tests/aurox-whatsapp*.test.cjs` (NODE_PATH só foi necessário no ambiente de construção deste pacote).
- `node scripts/check-routes.mjs`.
- NÃO houve pareamento real com WhatsApp nem gravação no seu Supabase nesta execução.

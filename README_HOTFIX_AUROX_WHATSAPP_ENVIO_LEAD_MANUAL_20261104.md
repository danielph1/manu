# MANU — Hotfix: enviar pelo Aurox-WhatsApp para leads cadastrados manualmente

**Base:** MANU v10 (triagem e recebimento de fotos/áudios).
**Data:** 04/11/2026.
**Escopo:** somente `app/api/chat/route.ts`, `app/(dashboard)/chat/page.tsx`, `lib/aurox-whatsapp/send.ts`, `workers/aurox-whatsapp/index.mjs`, teste automatizado e este manual.

## Causa do problema

A rotina de envio só utilizava o Aurox-WhatsApp quando encontrava uma linha em `aurox_wa_contatos` já vinculada ao lead. Um lead adicionado manualmente não tinha essa linha e, por isso, acabava usando a Z-API.

## O que muda

- Com uma sessão **Aurox-WhatsApp habilitada para a empresa**, mensagens de texto para leads manuais são enviadas pelo WhatsApp conectado da própria empresa.
- Se já existir contato do Aurox associado ao lead, mantém-se o `chat_id` desse contato.
- Se não existir, usa-se o telefone cadastrado com DDD. Para números brasileiros sem código do país, acrescenta-se `55`. O **worker verifica que o número existe no WhatsApp usando `getNumberId`** e só então envia.
- Após envio confirmado pelo worker, registra o contato vinculado ao lead e o ID da mensagem de saída para que as futuras respostas possam ser associadas corretamente.
- Se o Aurox estiver habilitado, mas offline ou com erro, **não tenta a Z-API silenciosamente**. O chat informa que a mensagem foi salva internamente, mas não enviada pelo WhatsApp.
- A Z-API legada só continua como alternativa quando a empresa não tiver uma sessão Aurox habilitada.
- Mensagens começando com `[interno]` continuam internas e não são enviadas ao cliente.
- **Anexos enviados pelo chat** ainda são salvos apenas no MANU. O worker de saída desta versão envia **texto**; não afirma ter enviado fotos ou áudio. Isso não altera o recebimento de fotos/áudios do WhatsApp implantado na v10.
- Não modifica faturamento, fichas, estoque, aprovações ou integrações de outros portais.

## Implantação segura (recomendado: ZIP pequeno)

1. Salve um backup da pasta atual e preserve `.env`, `.env.local`, `workers/aurox-whatsapp/data/` e os dispositivos conectados.
2. Extraia `MANU_Hotfix_v11_Envio_WhatsApp_Leads_Manuais.zip` sobre a raiz do MANU, mantendo a árvore de diretórios. **Não substitua `workers/aurox-whatsapp/data/`**.
3. Registre as alterações no GitHub (por exemplo, `git add -A`, `git commit` e `git push`), para a Vercel publicar `app/api/chat/route.ts`, `app/(dashboard)/chat/page.tsx` e `lib/aurox-whatsapp/send.ts`.
4. No Windows, pare **somente o PowerShell do worker Aurox-WhatsApp** com `Ctrl+C`. Não precisa desligar o Cloudflare Tunnel.
5. Abra `C:\manuSiteOficialOriginal\workers\aurox-whatsapp` e execute `node --env-file=.env index.mjs`. O arquivo `index.mjs` **precisa estar atualizado**, pois a versão anterior rejeita envio usando apenas telefone.
6. Confirme na Central de Integrações que Aurox-WhatsApp da empresa está **Conectado**.
7. Faça teste com um número empresarial autorizado: crie um lead manual com DDD e telefone, abra o chat e envie um texto. Confira a chegada no aparelho destinatário. Depois, responda no aparelho e confira o histórico do mesmo lead no MANU.

**Não exige SQL novo.** Mantém as migrations v9 e v10 e as configurações da Vercel existentes.

## Se o envio falhar

- **Número não encontrado no WhatsApp**: confira DDD, país e número do lead.
- **WhatsApp da empresa desconectado**: a sessão/worker precisa estar conectado.
- **Serviço indisponível**: confira se `cloudflared` ainda está em execução e se `AUROX_WA_WORKER_URL` na Vercel aponta para a URL temporária atual.
- **Contato associado a outro lead**: confira registros duplicados da **mesma empresa**; a aplicação não redireciona para outro cliente automaticamente.
- **Mensagem salva, mas não enviada**: não reenvie sem confirmar o status no WhatsApp do aparelho, especialmente se houve timeout de rede.
- **Aparece mensagem sobre Z-API**: o código atualizado ainda não foi publicado na Vercel, ou a empresa selecionada não tem a sessão Aurox habilitada no banco.

## Testes realizados

- 9 testes automatizados do hotfix (encaminhamento manual, ligação existente, ausência de sessão, falha, telefone inválido, conflito e privacidade).
- Testes anteriores do canal Aurox-WhatsApp (autenticação, isolamento, deduplicação, recebimento) executados.
- Verificação de sintaxe em arquivos alterados, `node --check` no worker e verificação de 38 rotas Next.js sem colisões.

**Não houve teste de envio real no seu WhatsApp nem build de produção nesta execução.** Teste com uma conta autorizada antes de disponibilizar a outros funcionários.

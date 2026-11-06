# Aurox / MANU — Hotfix de triagem: 10 segundos

Preparado com base na versão do repositório `danielph1/manu` consultada em 06/11/2026.

## O que muda

- WhatsApp e demais canais: espera mínima da triagem de **10 segundos** contados de `triagem.created_at`.
- Novo endpoint privado `POST /api/cron/triagem`, autenticado com `PUSH_DISPATCH_SECRET`.
- O worker `push-dispatcher.mjs` passa a consultar a triagem a cada **5 segundos**, mesmo se ninguém estiver com o site aberto.
- O painel de atendimento mostra segundos na fila em vez de 0 minutos durante o intervalo inicial.
- Corrige `Dockerfile` para copiar `push-dispatcher.mjs` e evitar erro ao subir o worker no Docker.
- **O período de 10 minutos para um vendedor responder a um lead já atribuído permanece inalterado.** Esse prazo é diferente da espera inicial da triagem. Reduzi-lo a 10 segundos pode provocar transferências indevidas.

**Importante:** não é um prazo exato de 10,000 segundos; como a verificação ocorre a cada 5 segundos, normalmente a distribuição acontecerá pouco depois de 10 segundos. Falha de rede, ausência de vendedor ou indisponibilidade do worker podem atrasar a ação.

## Instalar no Windows

1. Faça backup do projeto (ou use Git com arquivos confirmados) e do banco Supabase.
2. Extraia este ZIP.
3. No PowerShell, dentro da pasta extraída, execute:

   ```powershell
   .\aplicar-triagem-10s.bat "C:\manuSiteOficialOriginal"
   ```

   Requer Python 3 instalado (`py -3` ou `python`). O instalador valida os arquivos **antes** de alterar qualquer um e cria backup em `.aurox-backups/triagem-10s-...`. Caso algum arquivo diverja muito do GitHub consultado, não substitui por adivinhação.

4. Na raiz do projeto MANU, valide e publique:

   ```powershell
   npx tsc --noEmit
   npm run build
   git add .
   git commit -m "Triagem automatica em 10 segundos"
   git push
   ```

   Se não quiser enviar cópias locais de backup ao GitHub, acrescente `.aurox-backups/` ao `.gitignore` ANTES de `git add .`. Confira `git status`.

5. Na Vercel: `PUSH_DISPATCH_SECRET` deve conter o mesmo segredo que o worker (mínimo 32 caracteres), configurado apenas em variáveis server-side. **Não** use `NEXT_PUBLIC_`. Faça redeploy no ambiente Production.
6. Reinicie o worker Node.js **a partir da pasta atualizada** ou suba nova imagem do worker Railway/Docker. No PC, por exemplo:

   ```powershell
   cd C:\manuSiteOficialOriginal\workers\aurox-whatsapp
   node --env-file=.env index.mjs
   ```

   Os intervalos só funcionam enquanto o worker estiver rodando. Se ainda estiver no seu Windows, desligar o PC interrompe o processamento contínuo. Para operação 24/7, coloque o worker em hospedagem com armazenamento persistente, HTTPS e reinicialização automática.

## Sem SQL novo

Este hotfix não precisa de migration nova. Reaproveita as tabelas `public.triagem` e `public.leads` e as validações de empresa existentes.

## Cenários a testar ANTES de produção

- WhatsApp: enviar nova mensagem de número ainda não cadastrado, confirmar que surge na triagem e depois é atribuído depois de 10–15 segundos aproximadamente.
- Outro canal: criar novo item na triagem e conferir mesmo prazo.
- Múltiplas mensagens recebidas no mesmo intervalo: as mensagens devem ser vinculadas ao mesmo contato/lead.
- Empresa A e B: testar que um lead nunca é distribuído ao vendedor de outra empresa.
- Nota interna: lead com `rotacionar=FALSE` não deve ser transferido pelo endpoint de auto-passar.
- Nenhum vendedor disponível: o lead permanece na triagem, sem atribuição a conta inexistente.
- Worker desligado: se ninguém acessar a triagem, o auto-roteamento não ocorrerá até o worker voltar; isso é esperado nessa arquitetura.

## Escopo

Mudanças somente em:
- `app/api/triagem/route.ts`
- `app/(dashboard)/triagem/page.tsx`
- `app/api/atendimento/route.ts`
- `app/(dashboard)/atendimento/page.tsx`
- `workers/aurox-whatsapp/push-dispatcher.mjs`
- `workers/aurox-whatsapp/Dockerfile`
- `lib/triagem/auto-atribuir.ts` (novo)
- `app/api/cron/triagem/route.ts` (novo)

**Não houve commit automático nem deploy. Não foi executado um build completo do seu repositório.** As verificações deste pacote incluem sintaxe das rotas e testes de aplicação em arquivos simulados.

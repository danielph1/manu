# Aurox v17 — Indicadores clicáveis de Gestão de Atendimento

Hotfix incremental sobre o **MANU/Aurox v16**. Não modifica banco de dados, faturamento, fichas, Chat nem o worker WhatsApp.

## O que foi corrigido

- Clicar em **Aguardando triagem** exibe somente a fila de triagem da empresa.
- Clicar em **Com vendedor, sem resposta** exibe somente leads ainda não respondidos.
- Clicar em **Sem resposta +10 min** filtra o subconjunto atrasado.
- Clicar novamente no indicador ativo ou em **Limpar filtro** retorna à visualização completa.
- O indicador selecionado tem contorno diferenciado e acessibilidade `aria-pressed`.
- Páginas de **40 leads** por vez, com botões **Anterior** e **Próxima**; navegação não carrega todos os registros.
- Contagens são feitas por `COUNT(*)` e não pelo número de registros devolvidos na página. Isso elimina o falso teto de 150 exibido pela versão anterior.
- Atualização automática a cada 15 segundos continua ativa. Ao trocar empresa, o filtro volta a Todos.
- Respostas antigas a requisições já ultrapassadas são ignoradas para não misturar empresas ou páginas.
- O pacote inclui `app/api/anuncios/mercadolivre/atributos/route.ts`, presente na v16 mas ausente da árvore atual do GitHub no momento da conferência. Sua ausência pode explicar a mensagem "Não foi possível consultar a ficha técnica desta categoria". A rota consulta o catálogo oficial com o token da empresa; erro de token/API continua dependendo da conta do Mercado Livre.

## Arquivos atualizados

1. `app/(dashboard)/atendimento/page.tsx`
2. `app/api/atendimento/route.ts`
3. `app/api/anuncios/mercadolivre/atributos/route.ts` (restauração)
4. `tests/aurox-v17-atendimento.test.cjs` (novo)

## Instalação

1. Faça backup do projeto atual (especialmente arquivos alterados localmente).
2. Descompacte **somente o ZIP incremental v17** na raiz do projeto, mantendo as pastas.
3. Verifique no PowerShell (na pasta do MANU):

```powershell
npm install
node --test tests/aurox-v17-atendimento.test.cjs
npm run build
```

4. Envie os arquivos alterados para o GitHub e faça um novo deploy na Vercel.
5. Teste os três cartões em **/atendimento** numa empresa com leads. Confira a paginação e a troca de empresa pelo superadmin.
6. Em **/anuncios**, abra a PCX e selecione **Motos e scooters** para testar se a rota de atributos voltou a responder. Se persistir erro, analise o status HTTP da rota em *Network* ou os logs da Vercel; não exponha tokens.

**Nenhuma migration SQL é necessária.** Não alterar `.env`, `DATABASE_URL`, processos do Cloudflare ou `workers/aurox-whatsapp`.

## Notas importantes

- “Sem resposta” significa **sem resposta registrada no MANU**. Não prova falta de contato externo.
- A listagem inclui leads de vendedores vinculados à empresa selecionada. O cálculo de atrasados utiliza `COALESCE(atribuido_em, created_at, data_lead)` quando essas colunas existem.
- Se algum bloco de consulta ao banco falhar, a API devolve aviso e não inventa total zero.
- Se o lead mudar de situação durante a paginação, ele pode sair do filtro no próximo refresh, como esperado.
- Esta versão foi testada com banco simulado; a aplicação real depende da estrutura do seu Supabase. O build completo precisa ser executado no ambiente do projeto.

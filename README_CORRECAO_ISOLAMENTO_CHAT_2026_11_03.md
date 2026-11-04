# MANU / Aurox — correção de isolamento das integrações e envio do chat

**Base:** ZIP integral do MANU com login e faturamento por empresa, atualizado em 03/11/2026. Este pacote é o projeto inteiro, sem gerador Python. Faça backup do banco e do repositório antes de substituir sua versão.

## Problemas verificados no código anterior

1. A tela listava conexões de todas as empresas para superadmin e `statusDe()` buscava somente pelo nome da plataforma. Selecionar outra empresa não atualizava os dados exibidos.
2. O webhook antigo da Z-API pesquisava telefones em toda a tabela `leads` e criava `triagem` sem `empresa_id`.
3. O chat disparava mensagens na Z-API usando `ZAPI_INSTANCE_ID` / `ZAPI_TOKEN` globais, sem identificar a empresa do lead. A tela confundia erro do WhatsApp com falha de gravação do chat.
4. O webhook Meta não verificava assinatura `X-Hub-Signature-256` e aceitava associações aproximadas de IDs no JSON.
5. Rotas legadas (`/api/entrada`, `/api/webmotors`, `/api/mercadolivre`, `/api/facebook`, `/api/instagram`, `/api/whatsapp` e `/api/webhooks/zapi`) podiam receber mensagens sem comprovação do vínculo empresarial.

## O que mudou

- `GET /api/integracoes/oauth?empresa_id=ID`: retorna exclusivamente conexões da empresa solicitada. Para usuários comuns, o backend ignora outra empresa e fixa a empresa de sua sessão. Conexões de outras empresas nunca são devolvidas.
- A tela atualiza a lista quando o seletor muda; enquanto carrega, limpa o status anterior e não reaproveita a indicação de “conectado”.
- Z-API: uma instância **não pode pertencer a duas empresas**. Ao conectá-la por QR, o backend registra automaticamente `update-webhook-received` apontando para um callback exclusivo e autenticado.
- O novo callback `/api/webhooks/zapi/[connectionId]?sig=...` valida assinatura, instância, empresa e ID de mensagem, cria triagem com `empresa_id`, só deduplica leads na própria empresa e evita mensagens repetidas.
- A rota Z-API antiga sem escopo foi desativada (HTTP 410), pois misturava dados de empresas diferentes.
- Meta: exige assinatura real do provedor, identifica página/número exatos, rejeita vínculos ambíguos e grava leads **apenas** na triagem identificada pela empresa, sem fallback para lead sem `empresa_id`.
- Autorização de páginas Meta, número WhatsApp e conta Mercado Livre verifica se a conta já pertence a outra empresa antes de vincular.
- O chat verifica permissão do usuário **sobre o lead** antes de ler, enviar, editar ou excluir mensagens. A mensagem interna e o envio externo são resultados distintos.
- O envio WhatsApp do chat usa apenas a instância verificada da empresa do lead, nunca os tokens globais de outra concessionária.
- `requireUser()` não confia em uma sessão antiga se o banco não puder validar o usuário.
- APIs legadas sem autenticação empresarial retornam 410. Reconfigure os portais usando URLs individuais da Central de Integrações.

## Instalação

1. Faça backup do banco Supabase, do código atual e do `.env.local`. **Não** inclua `.env.local` no GitHub.
2. Extraia o ZIP completo numa pasta nova; não copie arquivos sobre uma branch antiga sem remover os arquivos que deixaram de existir.
3. No **SQL Editor do Supabase**, execute `supabase/migrations/202611030001_isolamento_integracoes_chat.sql`. Ela adiciona vínculo `leads.empresa_id`, campos de anexos de chat, log de eventos Z-API e uma view de auditoria. **Não remove nem transfere registros automaticamente**.
4. Na Vercel → Environment Variables → Production, configure `APP_URL=https://SEU-DOMINIO-HTTPS` (sem barra no final) e `MANU_WEBHOOK_SIGNING_SECRET` com uma sequência aleatória de pelo menos 32 caracteres. No PowerShell, você pode gerar uma chave assim:

   ```powershell
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

   **Guarde esse segredo em segurança; não o envie por chat, não o coloque em `NEXT_PUBLIC_*`.** Alterá-lo invalida os callbacks Z-API já configurados, exigindo reconexão.
5. Se usar Meta, mantenha `META_APP_SECRET`, `META_VERIFY_TOKEN` e os demais parâmetros oficiais devidamente configurados. As chamadas de webhook sem assinatura válida passarão a ser rejeitadas (403).
6. Publique a versão completa na branch que a Vercel usa. Confirme que o commit **inclui exclusões** de arquivos antigos (`git add -A`).
7. Execute `npm install`, `npm run build`. Veja erros de banco e assinatura nos logs da Vercel.
8. Abra **Central de Integrações**, escolha **uma empresa**, e **reconecte a Z-API dessa empresa**, usando a instância exclusiva dela. Ao gerar QR, o backend configurará o webhook automaticamente via API. Repita separadamente para cada empresa.
9. Teste com **duas empresas diferentes** e números de WhatsApp diferentes. Envie uma mensagem de cada e confirme que cada contato aparece somente na triagem da empresa certa. Em seguida, teste o chat de um lead de cada empresa.

## Conferir contas já compartilhadas

No SQL Editor, somente como superadmin:

```sql
SELECT * FROM public.manu_auditoria_contas_compartilhadas;
```

Se houver resultados, **não exclua empresas nem redistribua leads automaticamente**. Verifique a conta externa e reconecte uma instância/número/página diferente para cada empresa. Se a view encontrar duplicidades pré-existentes, a migration mantém o sistema funcionando e pode adiar o índice exclusivo: resolva essas ambiguidades antes de habilitar várias empresas em produção.

## Diagnóstico do chat

- “Mensagem salva no MANU, mas não encaminhada ao WhatsApp”: gravação interna funcionou; falta instância Z-API **daquela empresa**, ou o envio externo falhou.
- “Estrutura do chat incompleta”: execute a migration para adicionar `arquivo_nome`, `arquivo_mime` e `arquivo_bytes`.
- “Sem acesso ao lead”: a empresa do lead e a da sessão não coincidem, ou o usuário não tem acesso hierárquico. Para leads antigos sem empresa, revise o vendedor e o `empresa_id`; não atribua registros sem comprovação.
- “instância já vinculada a outra empresa”: não use o mesmo `ZAPI_INSTANCE_ID` global para todas as lojas.
- `403 assinatura Meta inválida`: verifique `META_APP_SECRET` e as assinaturas recebidas do provedor.
- Endpoints antigos retornando HTTP 410: atualize os webhooks diretamente com o conector individual da empresa.

**Atenção**: esta correção foi revisada por sintaxe e validações estáticas. O build integral e o funcionamento com o Supabase/Meta/Z-API reais ainda dependem do seu ambiente e credenciais. Não coloque múltiplas empresas em produção sem concluir os testes cruzados.

## Observação sobre a autenticação

Configure `JWT_SECRET` com valor forte e exclusivo no ambiente de produção. A versão corrigida não aceita o segredo de desenvolvimento como substituto em produção. A validação de sessão depende de consulta ao banco, para impedir acesso quando um usuário é desativado ou muda de empresa.

## Verificações antes de liberar o sistema a clientes

- Nenhuma empresa sem autenticação pode ler a lista de conexões de outra.
- O mesmo número Z-API não pode ser atribuído a duas empresas.
- Um mesmo Page ID Meta/WhatsApp Cloud ou conta Mercado Livre não pode ser associado a duas empresas ativas.
- A triagem, o chat e a distribuição de leads devem mostrar exclusivamente dados da empresa e loja autorizadas.
- Rotas legadas HTTP 410 precisam ser substituídas por webhooks únicos e validados.
- Uma mensagem de teste deve apresentar confirmação **separada** para gravação no MANU e envio externo ao WhatsApp.

A migration e a atualização **não reorganizam historicamente leads sem empresa**; eles deverão passar por revisão administrativa antes de serem disponibilizados aos usuários. Se a auditoria encontrar conexões duplicadas, a associação precisa ser regularizada antes de operar com várias concessionárias.

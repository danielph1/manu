# MANU — Hotfix isolado de faturamento (04/11/2026)

**Base:** projeto MANU v7, anterior à v8, exatamente como solicitado. Não foram atualizadas as rotas de fichas, leads, chat ou permissões.

## Falhas corrigidas

1. **Mostruário:** a listagem apresentava `faturamentos.entrada_total` como valor do cartão. Agora exibe o financiamento da **ficha ligada ao documento** (`fichas_credito.valor_liberado` ou `valor_financiado`), validando também empresa e lead antes de utilizar os dados. Se a ficha estiver ausente, não inventa o valor: mostra **Não informado**.
2. **Impressão/documento:** a configuração do emissor estava incompleta. O arquivo SQL preenche os campos **em branco** da empresa exata **Manu Automóveis**, utilizando a referência fornecida pelo responsável, sem tocar em outras empresas. Para outras empresas, o administrador precisa preencher **Dados do emissor**.
3. **Erros de impressão:** o frontend passa a mostrar a mensagem retornada pela API mesmo quando o conteúdo chega como texto/Blob; a aba de impressão é aberta no clique, evitando bloqueios comuns de popup após a requisição assíncrona.
4. **Aviso de configuração:** agora também considera a ausência de razão social ou cláusulas, não somente CNPJ.

## Ordem de instalação

1. Faça backup do banco e salve a pasta atual do projeto.
2. Execute **somente** `supabase/migrations/202611040004_faturamento_emissor_manu_hotfix.sql` no SQL Editor do Supabase correspondente ao MANU (também disponível em `.txt`). O SQL interrompe sem alterar nada se não encontrar exatamente uma empresa chamada **Manu Automóveis**. Confirme se retornou `OK` para razão social, CNPJ e cláusulas.
3. Extraia o ZIP completo **em uma pasta nova**, não por cima da anterior. Preserve seu `.env.local` fora do Git.
4. Verifique `npm install`, `npm run prebuild`, `npm run build`, e publique o código com `git add -A` (para registrar exclusões). Evite misturar duas versões diferentes na mesma pasta.
5. No MANU, selecione Manu Automóveis → **Dados do emissor** e revise razão social, CNPJ, endereço, logo e, sobretudo, o texto contratual. Depois abra um faturamento e teste **Imprimir**.
6. No mostruário, documentos sem ficha de crédito vinculada mostrarão **Não informado** em Valor financiado. O valor da entrada deixou de substituir o financiamento.

## Arquivos de código efetivamente alterados

- `app/api/faturamento/route.ts` (consulta segura do valor financiado)
- `app/(dashboard)/faturamento/page.tsx` (mostruário e impressão)

**Arquivo SQL adicionado:** `supabase/migrations/202611040004_faturamento_emissor_manu_hotfix.sql` (também há uma cópia `.txt` na raiz do pacote).

O restante do código é preservado da v7. Não é necessário instalar a v8. Nenhuma tabela de ficha é modificada por este hotfix.

### Limites e segurança

- O HTML de faturamento é **documento contratual**, por isso o texto do PDF foi preservado como referência, mas **precisa de revisão jurídica** antes de emitir documentos reais.
- `valor_liberado` é um valor informado na ficha: não equivale automaticamente a dinheiro recebido no caixa. Não é calculado multiplicando parcelas ou subtraindo a entrada.
- **Sem ficha vinculada**, o montante financiado não pode ser verificado apenas a partir da entrada. A interface informa ausência de dados.
- O hotfix foi validado com analisador de sintaxe TypeScript, verificação de rotas Next.js, inspeção do ZIP e revisões estáticas. **Não foi executado o build de produção nem uma impressão conectada ao Supabase real**.

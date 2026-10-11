# Status Manu Next (v0.3 — banco direto)

## Funcionando com Postgres real
- Login (`senha_hash`)
- Painel de leads + métricas por período (padrão: este mês)
- Estoque (lista)
- Fichas de crédito (lista)
- Oficina (lista, cadastro, edição, RECAL/estoque, auto 4 dias)
- Faturamento (busca + últimos registros; formulário completo ainda enxuto)

## Ainda parcial vs Streamlit
- Transferência de leads (UI existe; regras avançadas incompletas)
- Chat / tarefas / metas (telas; APIs podem falhar)
- Faturamento: sem HTML de impressão completo como no Streamlit
- Push PWA: próximo ciclo
- IA suporte: próximo ciclo

## Rodar
```bash
# .env.local com DATABASE_URL + JWT_SECRET + keys Supabase
npm install
npm run dev
```

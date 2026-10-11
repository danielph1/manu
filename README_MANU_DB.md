# Manu Next — banco direto (Postgres)

## O que foi corrigido
- Login lê `public.usuarios.senha` (formato Streamlit `pbkdf2_sha256$iter$salt_hex$hash_hex`)
- Conexão via `pg` + `DATABASE_URL` (mesmo banco do Streamlit)
- Leads / vendedores / métricas em SQL direto

## Como rodar
```bash
cp .env.example .env.local
# preencha DATABASE_URL com a mesma URL do Streamlit [postgres] url
npm install
npm run dev
```

Abra http://localhost:3000/login e use o mesmo login/senha do Streamlit.

## Segurança
Acesso direto ao Postgres é ótimo para testar. Em produção depois:
- restrinja IP / use connection pooler
- ou mude rotas críticas para service_role + RLS

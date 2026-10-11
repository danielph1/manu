import { query } from '@/lib/db';

export async function ensureAnexos(tabela: 'faturamento_anexos' | 'ficha_anexos', fk: string) {
  await query(`
    CREATE TABLE IF NOT EXISTS public.${tabela} (
      id serial primary key,
      ${fk} integer,
      nome_arquivo text,
      mime text,
      arquivo_b64 text,
      created_at timestamptz default now()
    )
  `);
}

export async function salvarAnexo(tabela: string, fk: string, id: number, nome: string, mime: string, b64: string) {
  await query(
    `INSERT INTO public.${tabela} (${fk}, nome_arquivo, mime, arquivo_b64) VALUES ($1,$2,$3,$4)`,
    [id, nome, mime, b64],
  );
}

export async function listarAnexos(tabela: string, fk: string, id: number) {
  const { rows } = await query(
    `SELECT id, nome_arquivo, mime, arquivo_b64 FROM public.${tabela} WHERE ${fk} = $1 ORDER BY id`,
    [id],
  );
  return rows;
}

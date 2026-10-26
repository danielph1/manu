import { query } from '@/lib/db';

/** Carro vendido (liberado): sai da vitrine, anúncio desligado, fica inativo no BD */
export async function marcarEstoqueVendido(placa: string) {
  const p = String(placa || '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return;
  try {
    await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS status_estoque text DEFAULT 'ativo'`);
    await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false`);
  } catch { /* ok */ }
  await query(
    `UPDATE public.estoque_carros SET
       status_estoque = 'inativo',
       anunciado = false,
       anunciado_em = NULL
     WHERE UPPER(REPLACE(REPLACE(COALESCE(placa,''),'-',''),' ','')) = $1`,
    [p],
  );
}

/** Oficina pronto → entra/atualiza estoque ativo */
export async function oficinaProntoParaEstoque(row: {
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: string;
  cor?: string;
  empresa_id?: number | null;
}) {
  const placa = String(row.placa || '').trim();
  if (!placa) return;
  try {
    await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS status_estoque text DEFAULT 'ativo'`);
  } catch { /* ok */ }

  const existing = await query(
    `SELECT id FROM public.estoque_carros
      WHERE UPPER(REPLACE(REPLACE(COALESCE(placa,''),'-',''),' ','')) = UPPER(REPLACE(REPLACE($1,'-',''),' ',''))
      LIMIT 1`,
    [placa],
  );
  if (existing.rows?.length) {
    await query(
      `UPDATE public.estoque_carros SET status_estoque='ativo', marca=COALESCE($2,marca), modelo=COALESCE($3,modelo), ano=COALESCE($4,ano), cor=COALESCE($5,cor)
       WHERE id=$1`,
      [existing.rows[0].id, row.marca || null, row.modelo || null, row.ano || null, row.cor || null],
    );
  } else {
    await query(
      `INSERT INTO public.estoque_carros (marca, modelo, placa, ano, cor, empresa_id, status_estoque, anunciado)
       VALUES ($1,$2,$3,$4,$5,$6,'ativo',false)`,
      [row.marca || null, row.modelo || null, placa, row.ano || null, row.cor || null, row.empresa_id || null],
    );
  }
}

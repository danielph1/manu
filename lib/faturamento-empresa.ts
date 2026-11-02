import { queryOne } from '@/lib/db';
import type { SessionUser } from '@/lib/session';

export function empresaPermitida(u: SessionUser, empresaId: number | null | undefined): boolean {
  const id = Number(empresaId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  return u.tipo === 'superadmin' || (Number(u.empresa_id) > 0 && Number(u.empresa_id) === id);
}

export async function obterFaturamentoPermitido(id: number, u: SessionUser) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const row = await queryOne<any>(`SELECT f.* FROM public.faturamentos f WHERE f.id=$1 LIMIT 1`, [id]);
  if (!row || !empresaPermitida(u, row.empresa_id)) return null;
  if (u.tipo === 'vendedor' && Number(row.criado_por_id) !== u.id) return null;
  if (u.tipo === 'gerente' && u.loja && String(row.loja || '').toUpperCase() !== String(u.loja).toUpperCase()) return null;
  return row;
}

export async function obterEmissor(empresaId: number) {
  return queryOne<any>(`
    SELECT e.id as empresa_id, e.nome AS empresa_nome,
      c.nome_fantasia,c.razao_social,c.cnpj,c.endereco,c.bairro,c.cidade,c.cep,
      c.telefone,c.logo_url,c.texto_observacoes,c.texto_contrato,c.local_assinatura
    FROM public.empresas e
    LEFT JOIN public.manu_faturamento_config c ON c.empresa_id=e.id
    WHERE e.id=$1 LIMIT 1`,[empresaId]);
}

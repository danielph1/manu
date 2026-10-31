import { queryOne } from '@/lib/db';
import type { SessionUser } from '@/lib/session';

export async function podeAcessarVeiculo(u: SessionUser, carroId: number): Promise<boolean> {
  if (!Number.isSafeInteger(carroId) || carroId < 1) return false;
  const vehicle = await queryOne<{ empresa_id: number | null }>(
    'SELECT empresa_id FROM public.estoque_carros WHERE id=$1', [carroId]);
  if (!vehicle) return false;
  if (u.tipo === 'superadmin') return true;
  return !!u.empresa_id && vehicle.empresa_id != null && Number(vehicle.empresa_id) === Number(u.empresa_id);
}

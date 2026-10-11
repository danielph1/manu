import { api } from '@/lib/api';
import type { Vendedor } from '@/types';

export const vendedoresService = {
  async list(): Promise<Vendedor[]> {
    const { data } = await api.get<Vendedor[]>('/vendedores');
    return data;
  },
};

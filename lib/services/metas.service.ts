import { api } from '@/lib/api';
import type { Meta } from '@/types';

export const metasService = {
  async list(params?: { mes?: number; ano?: number }): Promise<Meta[]> {
    const { data } = await api.get<Meta[]>('/metas', { params });
    return data;
  },
  async upsert(payload: Partial<Meta>): Promise<Meta> {
    const { data } = await api.post<Meta>('/metas', payload);
    return data;
  },
};

import { api } from '@/lib/api';
import type { EstoqueCarro } from '@/types';

export const estoqueService = {
  async list(): Promise<EstoqueCarro[]> {
    const { data } = await api.get<EstoqueCarro[]>('/estoque');
    return data;
  },
  async get(id: number): Promise<EstoqueCarro> {
    const { data } = await api.get<EstoqueCarro>(`/estoque/${id}`);
    return data;
  },
  async create(payload: Partial<EstoqueCarro>): Promise<EstoqueCarro> {
    const { data } = await api.post<EstoqueCarro>('/estoque', payload);
    return data;
  },
  async update(id: number, payload: Partial<EstoqueCarro>): Promise<EstoqueCarro> {
    const { data } = await api.put<EstoqueCarro>(`/estoque/${id}`, payload);
    return data;
  },
  async remove(id: number): Promise<void> { await api.delete(`/estoque/${id}`); },
};

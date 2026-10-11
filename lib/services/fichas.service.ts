import { api } from '@/lib/api';
import type { FichaCredito } from '@/types';

export const fichasService = {
  async list(): Promise<FichaCredito[]> {
    const { data } = await api.get<FichaCredito[]>('/fichas');
    return data;
  },
  async get(id: number): Promise<FichaCredito> {
    const { data } = await api.get<FichaCredito>(`/fichas/${id}`);
    return data;
  },
  async create(payload: Partial<FichaCredito>): Promise<FichaCredito> {
    const { data } = await api.post<FichaCredito>('/fichas', payload);
    return data;
  },
  async update(id: number, payload: Partial<FichaCredito>): Promise<FichaCredito> {
    const { data } = await api.put<FichaCredito>(`/fichas/${id}`, payload);
    return data;
  },
};

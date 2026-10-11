import { api } from '@/lib/api';
import type { Tarefa } from '@/types';

export const tarefasService = {
  async list(): Promise<Tarefa[]> {
    const { data } = await api.get<Tarefa[]>('/tarefas');
    return data;
  },
  async create(payload: Partial<Tarefa>): Promise<Tarefa> {
    const { data } = await api.post<Tarefa>('/tarefas', payload);
    return data;
  },
  async update(id: number, payload: Partial<Tarefa>): Promise<Tarefa> {
    const { data } = await api.put<Tarefa>(`/tarefas/${id}`, payload);
    return data;
  },
  async remove(id: number): Promise<void> { await api.delete(`/tarefas/${id}`); },
};

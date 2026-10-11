// =============================================================
// Leads Service - CRUD + filtros
// =============================================================
import { api } from '@/lib/api';
import type { Lead, LeadFiltros, PainelStats } from '@/types';

export const leadsService = {
  // GET /leads?filtro=...&periodo=...&busca=...
  async list(filtros?: LeadFiltros): Promise<Lead[]> {
    const { data } = await api.get<Lead[]>('/leads', { params: filtros });
    return data;
  },

  // GET /leads/stats
  async stats(filtros?: LeadFiltros): Promise<PainelStats> {
    const { data } = await api.get<PainelStats>('/leads/stats', { params: filtros });
    return data;
  },

  // GET /leads/:id
  async get(id: number): Promise<Lead> {
    const { data } = await api.get<Lead>(`/leads/${id}`);
    return data;
  },

  // POST /leads
  async create(payload: Partial<Lead>): Promise<Lead> {
    const { data } = await api.post<Lead>('/leads', payload);
    return data;
  },

  // PUT /leads/:id
  async update(id: number, payload: Partial<Lead>): Promise<Lead> {
    const { data } = await api.put<Lead>(`/leads/${id}`, payload);
    return data;
  },

  // DELETE /leads/:id
  async remove(id: number): Promise<void> {
    await api.delete(`/leads/${id}`);
  },
};

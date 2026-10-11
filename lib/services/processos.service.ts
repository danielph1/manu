import { api } from '@/lib/api';
import type { ProcessoTransferencia } from '@/types';

export const processosService = {
  async list(): Promise<ProcessoTransferencia[]> {
    const { data } = await api.get<ProcessoTransferencia[]>('/processos-transferencia');
    return data;
  },
  async create(payload: Partial<ProcessoTransferencia>): Promise<ProcessoTransferencia> {
    const { data } = await api.post<ProcessoTransferencia>('/processos-transferencia', payload);
    return data;
  },
  async aprovar(id: number): Promise<ProcessoTransferencia> {
    const { data } = await api.post<ProcessoTransferencia>(`/processos-transferencia/${id}/aprovar`);
    return data;
  },
  async recusar(id: number, motivo?: string): Promise<ProcessoTransferencia> {
    const { data } = await api.post<ProcessoTransferencia>(`/processos-transferencia/${id}/recusar`, { motivo });
    return data;
  },
};

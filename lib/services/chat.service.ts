import { api } from '@/lib/api';
import type { ChatMensagem } from '@/types';

export const chatService = {
  async listGeral(): Promise<ChatMensagem[]> {
    const { data } = await api.get<ChatMensagem[]>('/chat/geral');
    return data;
  },
  async enviarGeral(conteudo: string): Promise<ChatMensagem> {
    const { data } = await api.post<ChatMensagem>('/chat/geral', { conteudo });
    return data;
  },
  async listPrivado(outroUsuarioId: number): Promise<ChatMensagem[]> {
    const { data } = await api.get<ChatMensagem[]>(`/chat/privado/${outroUsuarioId}`);
    return data;
  },
  async enviarPrivado(destinatario_id: number, conteudo: string): Promise<ChatMensagem> {
    const { data } = await api.post<ChatMensagem>('/chat/privado', { destinatario_id, conteudo });
    return data;
  },
};

// =============================================================
// Auth Service - endpoints de autenticacao (FastAPI)
// =============================================================
import { api } from '@/lib/api';
import type { AuthResponse, LoginPayload, User } from '@/types';

export const authService = {
  // POST /auth/login
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', payload);
    return data;
  },

  // GET /auth/me
  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },

  // POST /auth/logout (opcional - server-side invalidation)
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignora falhas - logout e sempre client-side
    }
  },
};

// Helpers de role para o frontend
import type { User } from '@/types';

export const Role = {
  isAdmin: (u?: User | null) => u?.tipo === 'admin',
  isGerente: (u?: User | null) => u?.tipo === 'gerente' || u?.tipo === 'admin',
  isVendedor: (u?: User | null) => u?.tipo === 'vendedor',
  isElfenAI: (u?: User | null) => u?.tipo === 'elfenai',
  isDocumento: (u?: User | null) => u?.tipo === 'documento',
  verMetricas: (u?: User | null) => u?.tipo === 'admin' || u?.tipo === 'gerente',
  verLeads: (u?: User | null) => ['admin','gerente','vendedor','marketing','documentista','documento','elfenai'].includes(u?.tipo ?? ''),
  verFichas: (u?: User | null) => ['admin','gerente','vendedor','elfenai'].includes(u?.tipo ?? ''),
  verDocumental: (u?: User | null) => ['admin','gerente','vendedor','documento'].includes(u?.tipo ?? ''),
  editarLead: (u?: User | null, leadVendedorId?: number) => {
    if (!u) return false;
    if (u.tipo === 'admin' || u.tipo === 'gerente') return true;
    if (u.tipo === 'vendedor' && u.vendedor_id === leadVendedorId) return true;
    return false;
  },
  editarFichaBanco: (u?: User | null) => ['admin','gerente','elfenai'].includes(u?.tipo ?? ''),
  editarDocumental: (u?: User | null) => ['admin','gerente','documento'].includes(u?.tipo ?? ''),
};

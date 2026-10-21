// Helpers de role para o frontend
import type { User } from '@/types';

export const Role = {
  isSuperAdmin: (u?: User | null) => u?.tipo === 'superadmin',
  isAdmin: (u?: User | null) => u?.tipo === 'admin' || u?.tipo === 'superadmin',
  isGerente: (u?: User | null) => u?.tipo === 'gerente' || u?.tipo === 'admin' || u?.tipo === 'superadmin',
  isVendedor: (u?: User | null) => u?.tipo === 'vendedor',
  isElfenAI: (u?: User | null) => u?.tipo === 'elfenai',
  isDocumento: (u?: User | null) => u?.tipo === 'documento' || u?.tipo === 'documentista',
  verMetricas: (u?: User | null) => u?.tipo === 'admin' || u?.tipo === 'gerente' || u?.tipo === 'superadmin',
  verLeads: (u?: User | null) => ['admin','gerente','vendedor','marketing','documentista','documento','elfenai','superadmin'].includes(u?.tipo ?? ''),
  verFichas: (u?: User | null) => ['admin','gerente','vendedor','elfenai','superadmin'].includes(u?.tipo ?? ''),
  verDocumental: (u?: User | null) => ['admin','gerente','vendedor','documento','documentista','superadmin'].includes(u?.tipo ?? ''),
  verAurox: (u?: User | null) => u?.tipo === 'superadmin',

  editarLead: (u?: User | null, leadVendedorId?: number) => {
    if (!u) return false;
    // superadmin, admin, gerente, marketing — qualquer lead
    if (['superadmin', 'admin', 'gerente', 'marketing'].includes(String(u.tipo))) return true;
    if (u.tipo === 'vendedor' && u.vendedor_id === leadVendedorId) return true;
    return false;
  },
  editarFichaBanco: (u?: User | null) => ['admin','gerente','elfenai','superadmin'].includes(u?.tipo ?? ''),
  editarDocumental: (u?: User | null) => ['admin','gerente','documento','documentista','superadmin'].includes(u?.tipo ?? ''),
};

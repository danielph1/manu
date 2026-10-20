/**
 * Planos Aurox por LOJA (SaaS)
 * VANGUARD = entrada | COMMAND = fluxo/automação | BLACK = números/gestão multi-loja
 *
 * Limites são defaults comerciais — ajuste em PLAN_LIMITS sem mexer na UI.
 */

export type PlanoCodigo = 'vanguard' | 'command' | 'black';

export type FeatureKey =
  | 'leads'
  | 'equipe'
  | 'tarefas'
  | 'faturamento'
  | 'chat'
  | 'estoque'
  | 'oficina'
  | 'fichas'
  | 'elfenai'
  | 'documental'
  | 'transferencias'
  | 'metas'
  | 'ranking'
  | 'metricas'
  | 'ranking_lojas'
  | 'previsoes'
  | 'multi_loja';

export const PLAN_LIMITS: Record<
  PlanoCodigo,
  {
    label: string;
    max_vendedores: number; // 0 = ilimitado
    max_estoque: number; // 0 = ilimitado
    max_lojas_empresa: number; // quantas lojas o plano “pensa”; BLACK sobe
    features: FeatureKey[];
  }
> = {
  vanguard: {
    label: 'Vanguard',
    max_vendedores: 4, // adicional pago
    max_estoque: 30, // 10–30 carros típico de loja pequena
    max_lojas_empresa: 1,
    features: [
      'leads',
      'equipe',
      'tarefas',
      'faturamento',
      'chat',
      'estoque',
      // sem oficina, ranking, metricas, metas, transferencias, fichas/elfenai avançado
    ],
  },
  command: {
    label: 'Command',
    max_vendedores: 15,
    max_estoque: 120,
    max_lojas_empresa: 3,
    features: [
      'leads',
      'equipe',
      'tarefas',
      'faturamento',
      'chat',
      'estoque',
      'oficina',
      'fichas',
      'elfenai',
      'documental',
      'transferencias',
      'metas',
      // ranking/metricas leves podem entrar depois; foco é fluxo
    ],
  },
  black: {
    label: 'Black',
    max_vendedores: 0,
    max_estoque: 0,
    max_lojas_empresa: 0,
    features: [
      'leads',
      'equipe',
      'tarefas',
      'faturamento',
      'chat',
      'estoque',
      'oficina',
      'fichas',
      'elfenai',
      'documental',
      'transferencias',
      'metas',
      'ranking',
      'metricas',
      'ranking_lojas',
      'previsoes',
      'multi_loja',
    ],
  },
};

export function normalizePlano(p?: string | null): PlanoCodigo {
  const s = String(p || 'black').toLowerCase().trim();
  if (s === 'vanguard' || s === 'standard' || s === 'basico' || s === 'básico') return 'vanguard';
  if (s === 'command' || s === 'intermediario' || s === 'intermediário') return 'command';
  return 'black';
}

export function hasFeature(plano: string | null | undefined, feature: FeatureKey): boolean {
  const p = normalizePlano(plano);
  return PLAN_LIMITS[p].features.includes(feature);
}

/** Manu atual: trata como Black até definir plano por loja no banco */
export function planoEfetivo(user: { tipo?: string; plano?: string; loja_plano?: string } | null | undefined): PlanoCodigo {
  if (!user) return 'black';
  if (String(user.tipo || '').toLowerCase() === 'superadmin') return 'black';
  return normalizePlano(user.loja_plano || user.plano || 'black');
}

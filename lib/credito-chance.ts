/**
 * Chance de aprovação de crédito (visão micro).
 * Função logística:
 *   P = 1 / (1 + e^(-(B0 + B1·scoreN + B2·entrada% − B3·inadimplênciaBanco)))
 *
 * Taxas de inadimplência: dados de mercado atualizados (ajuste manual).
 */

export const BANCO_INADIMPLENCIA: Record<string, number> = {
  itau: 0.019,
  'itaú': 0.019,
  santander: 0.033,
  bradesco: 0.041,
  bb: 0.0505,
  'banco do brasil': 0.0505,
  caixa: 0.028,
  bv: 0.048,
  pan: 0.068,
  c6: 0.042,
  safra: 0.031,
  creditas: 0.035,
  volkswagen: 0.032,
  volks: 0.032,
  digio: 0.058,
  midway: 0.062,
};

/** Coeficientes do modelo (sigmoide) */
export const MODEL_PARAMS = {
  B0: -1.2, // intercepto
  B1_SCORE: 3.4, // peso score (0–1)
  B2_ENTRADA: 2.1, // peso % entrada (0–1)
  B3_INADIMPLENCIA: 4.5, // penalizador inadimplência do banco
};

function normScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  if (s <= 0) return null;
  const max = s <= 100 ? 100 : 1000;
  return Math.min(1, Math.max(0, s / max));
}

export function inadimplenciaBanco(nome: string | null | undefined): number {
  const k = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!k) return 0.05;
  for (const [banco, taxa] of Object.entries(BANCO_INADIMPLENCIA)) {
    const bk = banco.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (k.includes(bk) || bk.includes(k)) return taxa;
  }
  return 0.05;
}

export type ChanceResult = {
  ok: boolean;
  sem_score?: boolean;
  p: number | null;
  nivel: 'baixo' | 'medio' | 'alto' | 'sem_score';
  label: string;
  detalhe?: string;
};

export function chanceAprovacao(opts: {
  score?: number | null;
  banco?: string | null;
  valorEntrada?: number | null;
  valorCarro?: number | null;
  diasEstoque?: number | null; // ignorado no modelo atual (mantido na assinatura)
}): ChanceResult {
  const scoreN = normScore(opts.score);
  if (scoreN === null) {
    return { ok: false, sem_score: true, p: null, nivel: 'sem_score', label: 'sem score' };
  }

  const inad = inadimplenciaBanco(opts.banco);
  const entrada =
    opts.valorCarro && opts.valorCarro > 0 && opts.valorEntrada != null
      ? Math.min(1, Math.max(0, Number(opts.valorEntrada) / Number(opts.valorCarro)))
      : 0.2;

  const { B0, B1_SCORE, B2_ENTRADA, B3_INADIMPLENCIA } = MODEL_PARAMS;
  // p = 1 / (1 + e^(-(B0 + B1*score + B2*entrada - B3*inad)))
  const z = B0 + B1_SCORE * scoreN + B2_ENTRADA * entrada - B3_INADIMPLENCIA * inad;
  const p = 1 / (1 + Math.exp(-z));

  let nivel: ChanceResult['nivel'] = 'medio';
  if (p >= 0.7) nivel = 'alto';
  else if (p < 0.3) nivel = 'baixo';

  const label = nivel === 'alto' ? 'alto' : nivel === 'baixo' ? 'baixo' : 'médio';

  return {
    ok: true,
    p,
    nivel,
    label,
    detalhe: `score ${opts.score} · inad. banco ${(inad * 100).toFixed(1)}% · entrada ${(entrada * 100).toFixed(0)}%`,
  };
}

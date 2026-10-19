/**
 * Chance de aprovação de crédito (visão micro).
 * Função logística:
 *   P = 1 / (1 + e^(-(β0 + β1·scoreN + β2·entrada% + β3·(1−inad) + β4·diasEstoqueN)))
 *
 * Taxas de inadimplência por banco: proxies públicas de mercado (revenda/financiamento).
 * Podem ser ajustadas depois sem mudar a UI.
 */

export const BANCO_INADIMPLENCIA: Record<string, number> = {
  // fração 0–1 (quanto maior, pior para aprovação)
  itau: 0.035,
  'itaú': 0.035,
  bradesco: 0.038,
  santander: 0.04,
  bb: 0.032,
  'banco do brasil': 0.032,
  caixa: 0.045,
  pan: 0.09,
  bv: 0.07,
  safra: 0.05,
  creditas: 0.055,
  volkswagen: 0.048,
  volks: 0.048,
  c6: 0.06,
  digio: 0.08,
  midway: 0.085,
};

/** βs calibrados de forma heurística para score 0–1000 (Serasa-like) */
const B0 = -1.2;
const B1_SCORE = 3.4; // score normalizado 0–1
const B2_ENTRADA = 1.1; // % entrada 0–1
const B3_INAD = 2.2; // (1 - inadimplência)
const B4_DIAS = -0.6; // dias em estoque normalizados (0–1 ~ 0–180d)

function normScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  if (s <= 0) return null;
  // aceita 0–1000 ou 0–100
  const max = s <= 100 ? 100 : 1000;
  return Math.min(1, Math.max(0, s / max));
}

export function inadimplenciaBanco(nome: string | null | undefined): number {
  const k = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!k) return 0.06;
  for (const [banco, taxa] of Object.entries(BANCO_INADIMPLENCIA)) {
    const bk = banco.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (k.includes(bk) || bk.includes(k)) return taxa;
  }
  return 0.06; // default mercado
}

export type ChanceResult = {
  ok: boolean;
  sem_score?: boolean;
  p: number | null; // 0–1
  nivel: 'baixo' | 'medio' | 'alto' | 'sem_score';
  label: string;
  detalhe?: string;
};

export function chanceAprovacao(opts: {
  score?: number | null;
  banco?: string | null;
  valorEntrada?: number | null;
  valorCarro?: number | null;
  diasEstoque?: number | null;
}): ChanceResult {
  const scoreN = normScore(opts.score);
  if (scoreN === null) {
    return { ok: false, sem_score: true, p: null, nivel: 'sem_score', label: 'sem score' };
  }

  const inad = inadimplenciaBanco(opts.banco);
  const entrada =
    opts.valorCarro && opts.valorCarro > 0 && opts.valorEntrada != null
      ? Math.min(1, Math.max(0, Number(opts.valorEntrada) / Number(opts.valorCarro)))
      : 0.2; // assume 20% se não informado

  const dias = opts.diasEstoque != null ? Math.min(1, Math.max(0, Number(opts.diasEstoque) / 180)) : 0.3;

  const z =
    B0 +
    B1_SCORE * scoreN +
    B2_ENTRADA * entrada +
    B3_INAD * (1 - inad) +
    B4_DIAS * dias;

  const p = 1 / (1 + Math.exp(-z));

  let nivel: ChanceResult['nivel'] = 'medio';
  if (p >= 0.7) nivel = 'alto';
  else if (p < 0.3) nivel = 'baixo';

  const label =
    nivel === 'alto' ? 'alto' : nivel === 'baixo' ? 'baixo' : 'médio';

  return {
    ok: true,
    p,
    nivel,
    label,
    detalhe: `score ${opts.score} · inad. banco ${(inad * 100).toFixed(1)}% · entrada ${(entrada * 100).toFixed(0)}%`,
  };
}

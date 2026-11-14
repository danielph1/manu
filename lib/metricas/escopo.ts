import type { SessionUser } from '@/lib/session';

export const PAPEIS_METRICAS = new Set(['superadmin', 'admin', 'marketing', 'gerente']);
export const PAPEIS_CAIXA = new Set(['superadmin', 'admin']);

export type EscopoMetricas = {
  empresaId: number;
  loja: string | null;
  papel: string;
};

export function resolverEscopoMetricas(
  usuario: SessionUser,
  empresaSolicitada: unknown,
  lojaSolicitada: unknown,
): EscopoMetricas {
  const papel = String(usuario.tipo || '').toLowerCase();
  if (!PAPEIS_METRICAS.has(papel)) throw new Error('PERMISSAO');
  const empresaId = papel === 'superadmin' ? Number(empresaSolicitada) : Number(usuario.empresa_id);
  if (!Number.isSafeInteger(empresaId) || empresaId < 1) throw new Error('EMPRESA_OBRIGATORIA');
  if (papel !== 'superadmin' && Number(usuario.empresa_id) !== empresaId) throw new Error('PERMISSAO');
  const loja = papel === 'gerente' ? String(usuario.loja || '').trim().toUpperCase() : (papel === 'superadmin' || papel === 'admin') ? String(lojaSolicitada || '').trim().toUpperCase() : '';
  if (papel === 'gerente' && !loja) throw new Error('LOJA_OBRIGATORIA');
  if (loja && (loja.length > 40 || !/^[\p{L}\p{N}_ .-]+$/u.test(loja))) throw new Error('LOJA_INVALIDA');
  return { empresaId, loja: loja && loja !== 'GERAL' && loja !== 'TODAS' ? loja : null, papel };
}

export function periodoMetricas(periodo: string): { inicio: string | null; fim: string | null; etiqueta: string } {
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [ano, mes] = data.split('-').map(Number);
  const iso = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
  if (periodo === 'tudo') return { inicio: null, fim: null, etiqueta: 'Todo o histórico' };
  if (periodo === 'mes_passado') {
    const ref = new Date(Date.UTC(ano, mes - 2, 1));
    return { inicio: iso(ref.getUTCFullYear(), ref.getUTCMonth() + 1), fim: iso(ano, mes), etiqueta: 'Mês anterior' };
  }
  return { inicio: iso(ano, mes), fim: iso(ano + (mes === 12 ? 1 : 0), mes === 12 ? 1 : mes + 1), etiqueta: 'Mês atual' };
}

export function indiceQualidade(lead: { nome?: unknown; telefone?: unknown; email?: unknown; veiculo?: unknown; mensagem?: unknown }) {
  const valido = (v: unknown) => String(v ?? '').trim().length > 2;
  const nome = valido(lead.nome) && !/^sem nome$/i.test(String(lead.nome).trim());
  const contato = valido(lead.telefone) || /.+@.+\..+/.test(String(lead.email ?? ''));
  const veiculo = valido(lead.veiculo);
  const mensagem = valido(lead.mensagem);
  return 25 * Number(nome) + 25 * Number(contato) + 25 * Number(veiculo) + 25 * Number(mensagem);
}

export function projetarCorpos(historico: Array<{ carroceria: string; mes: string; vendas: number }>, referencia: Date) {
  const meses: string[] = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}`);
  }
  const nomes = [...new Set(historico.map(h => h.carroceria))].filter(n => n && n !== 'não identificado');
  return nomes.map(carroceria => {
    const serie = meses.map(m => Number(historico.find(h => h.mes === m && h.carroceria === carroceria)?.vendas || 0));
    const seis = serie.reduce((a,b) => a+b, 0);
    const recentes = serie.slice(-3).reduce((a,b) => a+b, 0);
    const suficiente = seis >= 5 && serie.filter(n => n > 0).length >= 3;
    return {
      carroceria, vendas_seis_meses: seis, vendas_ultimos_tres_meses: recentes,
      estimativa_mes_seguinte: suficiente ? Math.round(((seis / 6) * 0.4 + (recentes / 3) * 0.6) * 10) / 10 : null,
      amostra_suficiente: suficiente,
    };
  }).sort((a,b)=>b.vendas_seis_meses-a.vendas_seis_meses);
}

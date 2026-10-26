/** Nome de vitrine a partir das colunas do estoque (marca / carro / modelo). */
export function nomeVeiculo(c: {
  marca?: string | null;
  modelo?: string | null;
  carro?: string | null;
}): string {
  const marca = String(c?.marca || '').trim();
  const carro = String(c?.carro || '').trim();
  const modelo = String(c?.modelo || '').trim();

  let rest = '';
  if (carro && modelo) {
    const cl = carro.toLowerCase();
    const ml = modelo.toLowerCase();
    if (cl.includes(ml) || cl === ml) rest = carro;
    else if (ml.includes(cl)) rest = modelo;
    else rest = `${carro} ${modelo}`;
  } else {
    rest = carro || modelo;
  }

  const full = [marca, rest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return full || 'Sem nome';
}

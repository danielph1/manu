export const CARROCERIAS = [
  'hatch',
  'sedan',
  'suv',
  'pickup',
  'utilitario',
  'cupe',
  'conversivel',
  'van',
  'minivan',
] as const;

/** Texto livre bate com carroceria (campo ou interesse/produto). */
export function matchCarroceria(row: any, filtro: string): boolean {
  if (!filtro || filtro === 'todas') return true;
  const f = filtro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const blob = [
    row?.carroceria,
    row?.tipo_carroceria,
    row?.produto_interesse,
    row?.interesse,
    row?.marca,
    row?.modelo,
    row?.carro,
  ]
    .map((x) =>
      String(x || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    )
    .join(' ');
  return blob.includes(f);
}

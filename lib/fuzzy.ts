/**
 * Utilitários de busca aproximada (typos: onis → onix).
 */

/** Gera variantes simples de digitação para ILIKE */
export function variantesBusca(q: string): string[] {
  const s = String(q || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!s) return [];
  const out = new Set<string>([s]);

  // remove espaços extras
  out.add(s.replace(/\s+/g, ''));

  // trocas comuns PT/teclado
  const pairs: [string, string][] = [
    ['s', 'x'],
    ['x', 's'],
    ['c', 'k'],
    ['k', 'c'],
    ['z', 's'],
    ['s', 'z'],
    ['i', 'y'],
    ['y', 'i'],
    ['u', 'o'],
    ['o', 'u'],
    ['ph', 'f'],
    ['f', 'ph'],
  ];
  for (const [a, b] of pairs) {
    if (s.includes(a)) out.add(s.replace(a, b));
  }

  // delete 1 char
  if (s.length >= 3) {
    for (let i = 0; i < s.length; i++) {
      out.add(s.slice(0, i) + s.slice(i + 1));
    }
  }

  // prefixo (mín. 3)
  if (s.length >= 4) out.add(s.slice(0, Math.max(3, s.length - 1)));

  return [...out].filter((x) => x.length >= 2).slice(0, 20);
}

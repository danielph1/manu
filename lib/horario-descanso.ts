/**
 * Horário de descanso da loja: 21h – 9h (America/Sao_Paulo).
 * Nesse intervalo o sistema NÃO repassa leads entre vendedores.
 * Leads ainda entram (triagem/WhatsApp); só a rotação automática pausa.
 */

export function emHorarioDescanso(date = new Date()): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    });
    const hour = Number(fmt.format(date));
    // 21,22,23,0,1,...,8 → descanso; 9–20 → ativo
    return hour >= 21 || hour < 9;
  } catch {
    const h = date.getHours();
    return h >= 21 || h < 9;
  }
}

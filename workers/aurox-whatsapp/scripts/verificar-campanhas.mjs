// Não imprime chaves nem qualquer dado de cliente.
// Uso: node --env-file=.env scripts/verificar-campanhas.mjs
const base = String(process.env.MANU_APP_URL || '').replace(/\/$/, '');
const push = String(process.env.PUSH_DISPATCH_SECRET || '');
const followup = String(process.env.FOLLOWUP_DISPATCH_SECRET || push || '');
const okUrl = /^https:\/\//.test(base);
console.log('MANU_APP_URL:', okUrl ? 'CONFIGURADA (HTTPS)' : 'AUSENTE OU INVALIDA');
console.log('PUSH_DISPATCH_SECRET:', push.length >= 32 ? 'CONFIGURADA' : 'AUSENTE/INVALIDA');
console.log('FOLLOWUP_DISPATCH_SECRET (ou fallback Push):', followup.length >= 32 ? 'CONFIGURADA' : 'AUSENTE/INVALIDA');
if (process.argv.includes('--enviar-teste')) {
  if (!okUrl || followup.length < 32) { console.error('Não é possível disparar: configuração ausente.'); process.exitCode = 2; }
  else {
    console.log('Acionando uma execução do despachante (pode enviar UM item pendente elegível).');
    try {
      const response = await fetch(`${base}/api/cron/follow-up`, {
        headers: { Authorization: `Bearer ${followup}` },
        signal: AbortSignal.timeout(20000), cache: 'no-store',
      });
      console.log('HTTP:', response.status);
      const data = await response.json().catch(() => ({}));
      console.log('Resultado:', JSON.stringify({
        ok: data.ok ?? false, processados: data.processados ?? null,
        enviados: data.enviados ?? null, erros: data.erros ?? null,
        ignorados: data.ignorados ?? null, pausado: data.pausado ?? null,
        error: data.error ?? null,
      }));
      if (!response.ok) process.exitCode = 1;
    } catch (error) { console.error('Falha ao contatar MANU:', error instanceof Error ? error.message : 'erro'); process.exitCode = 1; }
  }
}

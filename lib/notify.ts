import { query } from '@/lib/db';

export async function notificar(opts: {
  titulo: string;
  mensagem: string;
  tipo?: string;
  usuario_ids?: number[];
  tipos?: string[];
  broadcast?: boolean;
}) {
  try {
    let ids = [...(opts.usuario_ids || [])];
    if (opts.broadcast) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios WHERE COALESCE(ativo, TRUE) = TRUE`,
      );
      ids = rows.map((r: any) => r.id);
    } else if (opts.tipos?.length) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios
         WHERE COALESCE(ativo, TRUE) = TRUE AND LOWER(tipo) = ANY($1)`,
        [opts.tipos.map((t) => t.toLowerCase())],
      );
      ids.push(...rows.map((r: any) => r.id));
    }
    ids = [...new Set(ids.map(Number).filter(Boolean))];
    for (const id of ids) {
      await query(
        `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
         VALUES ($1, $2, $3, $4)`,
        [id, opts.tipo || 'geral', opts.titulo, opts.mensagem],
      );
    }
  } catch {
    /* tabela pode falhar; nao derruba o fluxo */
  }
}

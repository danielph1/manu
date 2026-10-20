import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const postId = Number(id);
  try {
    const ja = await queryOne(
      `SELECT 1 FROM public.feed_likes WHERE post_id = $1 AND usuario_id = $2`,
      [postId, u.id],
    );
    if (ja) {
      await query(`DELETE FROM public.feed_likes WHERE post_id = $1 AND usuario_id = $2`, [postId, u.id]);
      await query(`UPDATE public.feed_posts SET likes = GREATEST(COALESCE(likes,1)-1, 0) WHERE id = $1`, [postId]);
      return NextResponse.json({ liked: false });
    }
    await query(`INSERT INTO public.feed_likes (post_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      postId,
      u.id,
    ]);
    await query(`UPDATE public.feed_posts SET likes = COALESCE(likes,0)+1 WHERE id = $1`, [postId]);
    return NextResponse.json({ liked: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

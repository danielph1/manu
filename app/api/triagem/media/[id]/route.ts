import { NextRequest, NextResponse } from 'next/server';
import { gestorAtendimento } from '@/lib/atendimento-auth';
import { queryOne } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const actor = await gestorAtendimento(req);
  if (!actor) return NextResponse.json({error:'Sem permissão'}, {status:403});
  const {id} = await params;
  const mediaId = Number(id);
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0)
    return NextResponse.json({error:'Arquivo inválido'}, {status:400});
  try {
    const item = await queryOne<{media_path:string;media_mime:string}>(`
      SELECT m.media_path,m.media_mime
      FROM public.aurox_wa_mensagens m
      JOIN public.aurox_wa_contatos c ON c.id=m.contato_id AND c.empresa_id=m.empresa_id
      WHERE m.id=$1 AND m.media_path IS NOT NULL
        AND ($2::boolean OR m.empresa_id=$3)
        AND c.triagem_id IS NOT NULL
      LIMIT 1`,[mediaId,actor.tipo==='superadmin',actor.empresa_id]);
    if (!item?.media_path) return NextResponse.json({error:'Arquivo não encontrado'}, {status:404});
    if (!/^(image|audio)\//.test(item.media_mime || ''))
      return NextResponse.json({error:'Tipo não permitido'}, {status:400});
    const {data,error} = await supabaseAdmin.storage.from('aurox-wa-media')
      .createSignedUrl(item.media_path,120);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Storage indisponível');
    return NextResponse.json({url:data.signedUrl,mime:item.media_mime},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    console.error('[aurox-wa] acesso mídia da triagem falhou',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Não foi possível consultar a mídia'}, {status:503});
  }
}

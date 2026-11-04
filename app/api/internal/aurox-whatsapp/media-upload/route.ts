import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { authorizedWorker } from '@/lib/aurox-whatsapp/security';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BUCKET = 'aurox-wa-media';
const MEDIA: Record<string,string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/aac': 'aac', 'audio/webm': 'webm',
};

/** Somente o worker autenticado recebe uma URL temporaria; nunca expor service_role. */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedWorker(req.headers.get('authorization')))
      return NextResponse.json({error:'Não autorizado'}, {status:401});
    const b = await req.json().catch(()=>null);
    const id = Number(b?.empresa_id);
    const instancia = String(b?.instancia_id || '');
    const messageId = String(b?.message_id || '');
    const mime = String(b?.mime || '').toLowerCase().split(';')[0].trim();
    const size = Number(b?.size);
    if (!Number.isSafeInteger(id) || id <= 0 ||
        !/^[0-9a-f-]{36}$/i.test(instancia) || !/^[a-f0-9]{64}$/i.test(messageId) ||
        !MEDIA[mime] || !Number.isSafeInteger(size) || size < 1 || size > 8*1024*1024) {
      return NextResponse.json({error:'Arquivo ou identificação inválida'}, {status:400});
    }
    const owner = await queryOne(`SELECT i.empresa_id FROM public.aurox_wa_instancias i
      JOIN public.empresas e ON e.id=i.empresa_id
      WHERE i.empresa_id=$1 AND i.instancia_id=$2 AND i.habilitada=TRUE AND e.ativo=TRUE`,[id,instancia]);
    if (!owner) return NextResponse.json({error:'Conexão não autorizada'}, {status:403});
    const storagePath = `${id}/${instancia}/${messageId}.${MEDIA[mime]}`;
    const {data,error} = await supabaseAdmin.storage.from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Storage indisponível');
    return NextResponse.json({url:data.signedUrl,path:storagePath},
      {headers:{'Cache-Control':'private, no-store'}});
  } catch(e) {
    console.error('[aurox-wa] não foi possível gerar URL de mídia', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({error:'Falha ao preparar mídia; confira Storage e migration v10'}, {status:503});
  }
}

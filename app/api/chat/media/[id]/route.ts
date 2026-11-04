import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';
import { queryOne } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Resolve mídia privada por mensagem, com a MESMA permissão do lead do chat. */
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const actor=await requireUser(req);
  if(!actor) return NextResponse.json({error:'Não autenticado'},{status:401});
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Mensagem inválida'},{status:400});
  try {
    const item=await queryOne<{lead_id:number;media_path:string;media_mime:string}>(`
      SELECT ch.lead_id, wa.media_path, wa.media_mime
        FROM public.chat_geral_mensagens ch
        JOIN public.leads l ON l.id=ch.lead_id
        LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
        JOIN public.aurox_wa_mensagens wa ON wa.id=ch.aurox_wa_mensagem_id
        JOIN public.aurox_wa_contatos c ON c.id=wa.contato_id AND c.empresa_id=wa.empresa_id
        LEFT JOIN public.triagem t ON t.id=c.triagem_id AND t.empresa_id=c.empresa_id
       WHERE ch.id=$1 AND wa.media_path IS NOT NULL
         AND wa.empresa_id=COALESCE(l.empresa_id,v.empresa_id)
         AND (c.lead_id=ch.lead_id OR t.lead_id=ch.lead_id)
       LIMIT 1`,[id]);
    if(!item)return NextResponse.json({error:'Arquivo não encontrado'},{status:404});
    if(!await leadAcessivel(actor,Number(item.lead_id)))
      return NextResponse.json({error:'Sem acesso a esta conversa'},{status:403});
    if(!/^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|webm))$/.test(item.media_mime||''))
      return NextResponse.json({error:'Formato inválido'},{status:415});
    const {data,error}=await supabaseAdmin.storage.from('aurox-wa-media').createSignedUrl(item.media_path,600);
    if(error||!data?.signedUrl)throw new Error(error?.message||'Sem URL de mídia');
    return NextResponse.json({url:data.signedUrl,mime:item.media_mime},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }catch(e){
    console.error('[Aurox media chat]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Mídia indisponível'},{status:503});
  }
}

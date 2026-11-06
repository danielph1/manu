import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ROLES = new Set(['superadmin','admin','marketing','gerente']);

async function escopo(req: NextRequest) {
  const user = await requireUser(req);
  if (!user || (!ROLES.has(String(user.tipo||'').toLowerCase()) && !isSuperAdmin(user))) return null;
  const id = Number(req.nextUrl.searchParams.get('estoque_id'));
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const carro = await queryOne<{empresa_id:number|null}>('SELECT empresa_id FROM public.estoque_carros WHERE id=$1', [id]);
  if (!carro?.empresa_id) return null;
  if (!isSuperAdmin(user) && Number(user.empresa_id) !== Number(carro.empresa_id)) return null;
  return { user, empresaId: Number(carro.empresa_id) };
}

export async function GET(req: NextRequest) {
  const scope = await escopo(req);
  if (!scope) return NextResponse.json({error:'Sem acesso ao veículo desta empresa.'},{status:403});
  try {
    const row = await queryOne(`SELECT telefone_whatsapp, estado_ml_id, cidade_ml_id
      FROM public.manu_anuncios_preferencias WHERE empresa_id=$1`, [scope.empresaId]);
    return NextResponse.json(row || { telefone_whatsapp:'', estado_ml_id:'', cidade_ml_id:'' }, {
      headers:{ 'Cache-Control':'private, no-store' },
    });
  } catch(e:any) {
    return NextResponse.json({error:'Preferências não disponíveis. Execute a migration 202611060001.'},{status:503});
  }
}

export async function PUT(req: NextRequest) {
  const scope = await escopo(req);
  if (!scope) return NextResponse.json({error:'Sem permissão para salvar preferências desta empresa.'},{status:403});
  const b = await req.json().catch(()=>({}));
  const telefone = String(b.telefone_whatsapp||'').replace(/\D/g,'');
  const estado = String(b.estado_ml_id||'').trim();
  const cidade = String(b.cidade_ml_id||'').trim();
  if (telefone && !/^(?:55)?\d{10,11}$/.test(telefone)) return NextResponse.json({error:'Informe o WhatsApp da loja com DDD.'},{status:400});
  if ((estado || cidade) && (!/^[a-zA-Z0-9_-]{2,120}$/.test(estado) || !/^[a-zA-Z0-9_-]{2,120}$/.test(cidade))) {
    return NextResponse.json({error:'Selecione estado e cidade pelo catálogo do Mercado Livre.'},{status:400});
  }
  try {
    await queryOne(`INSERT INTO public.manu_anuncios_preferencias
      (empresa_id,telefone_whatsapp,estado_ml_id,cidade_ml_id,atualizado_por)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (empresa_id) DO UPDATE SET
        telefone_whatsapp=EXCLUDED.telefone_whatsapp,
        estado_ml_id=EXCLUDED.estado_ml_id,
        cidade_ml_id=EXCLUDED.cidade_ml_id,
        atualizado_por=EXCLUDED.atualizado_por,
        atualizado_em=now()
      RETURNING empresa_id`, [scope.empresaId,telefone,estado,cidade,scope.user.id]);
    return NextResponse.json({ok:true});
  } catch(e:any){
    console.error('[Aurox preferências]',e?.code||'',e?.message||'');
    return NextResponse.json({error:'Não foi possível salvar as preferências. Verifique a migration.'},{status:503});
  }
}

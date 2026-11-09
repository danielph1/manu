#!/usr/bin/env python3
"""Hotfix isolado 10s triagem; preserva alterações anteriores e faz backup antes."""
from __future__ import annotations
import sys, shutil, datetime, py_compile
from pathlib import Path

FILES = [
 'app/api/triagem/route.ts',
 'app/(dashboard)/triagem/page.tsx',
 'app/api/atendimento/route.ts',
 'app/(dashboard)/atendimento/page.tsx',
 'workers/aurox-whatsapp/push-dispatcher.mjs',
 'workers/aurox-whatsapp/Dockerfile',
]
MODULE = 'lib/triagem/auto-atribuir.ts'
CRON = 'app/api/cron/triagem/route.ts'

def exactly(s: str, old: str, new: str, label: str, count: int=1) -> str:
    found=s.count(old)
    if found != count:
        raise ValueError(f'{label}: esperado {count} ocorrência(s), encontrado {found}. Versão diferente: arquivo NÃO foi alterado.')
    return s.replace(old,new)

def prepare(root: Path) -> dict[str,str]:
    original={}
    for p in FILES:
        path=root/p
        if not path.is_file():raise FileNotFoundError(f'Arquivo obrigatório não encontrado: {path}')
        original[p]=path.read_text(encoding='utf-8-sig')
    for p in (MODULE,CRON):
        if (root/p).exists():
            raise ValueError(f'{p} já existe; este hotfix é para uma instalação nova. Revise antes de sobrescrever.')

    out=dict(original)
    p='app/api/triagem/route.ts'; s=out[p]
    start='/** Checagem da fila sempre limitada à empresa para não atribuir leads entre clientes. */'
    end='export async function GET(req: NextRequest) {'
    if s.count(start)!=1 or s.count(end)!=1:raise ValueError('A rota triagem foi modificada; extração automática interrompida.')
    a=s.index(start); b=s.index(end)
    functions=s[a:b].strip()+"\n"
    functions=exactly(functions,"async function expirar(empresaId: number | null, superadmin: boolean)","export async function expirar(empresaId: number | null, superadmin: boolean)",'export expirar')
    functions=exactly(functions,"async function virarLead(triagemId:number,vendedorId:number,empresaPermitida:number | null)","export async function virarLead(triagemId:number,vendedorId:number,empresaPermitida:number | null)",'export virarLead')
    functions=exactly(functions,"AND created_at < now() -\n          (CASE WHEN origem='aurox-whatsapp' THEN interval '10 minutes'\n                ELSE interval '1 minute' END)","AND created_at <= now() - interval '10 seconds'",'tempo 10s')
    functions=exactly(functions,'  for(const t of rows) {','  let atribuidos=0;\n  for(const t of rows) {','contador início')
    functions=exactly(functions,"    if(v) await virarLead(t.id,v.id,t.empresa_id).catch(err=>console.error('triagem auto',err instanceof Error?err.message:'erro'));", "    if(v) {\n      const leadId=await virarLead(t.id,v.id,t.empresa_id).catch(err=>{\n        console.error('triagem auto',err instanceof Error?err.message:'erro');\n        return null;\n      });\n      if(leadId) atribuidos++;\n    }",'contador atribuições')
    functions=exactly(functions,"  }\n}\n\n/** Operação atômica:","  }\n  return { examinados: rows.length, atribuidos };\n}\n\n/** Operação atômica:",'contador retorno')
    out[MODULE]="import { query, queryOne, getPool } from '@/lib/db';\n\n"+functions
    s=s[:a]+s[b:]
    s=exactly(s,"import { query, queryOne, getPool } from '@/lib/db';", "import { query, queryOne } from '@/lib/db';\nimport { expirar, virarLead } from '@/lib/triagem/auto-atribuir';",'triagem import')
    out[p]=s

    p='app/(dashboard)/triagem/page.tsx';s=out[p]
    s=exactly(s,'Leads novos. Mensagens do Aurox-WhatsApp ficam até 10 minutos na fila antes da atribuição automática; outros canais seguem o prazo de 1 minuto.',
                  'Novos leads permanecem pelo menos 10 segundos na triagem antes da distribuição automática, independentemente do canal. A fila é processada pelo servidor.','texto triagem')
    out[p]=s

    p='app/api/atendimento/route.ts';s=out[p]
    anchor="origem, created_at AS desde,\n                GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(now()-created_at))/60))::int AS minutos_aguardando"
    s=exactly(s,anchor,"origem, created_at AS desde,\n                GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(now()-created_at))/60))::int AS minutos_aguardando,\n                GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(now()-created_at))))::int AS segundos_aguardando",'tempo atendimento')
    out[p]=s

    p='app/(dashboard)/atendimento/page.tsx';s=out[p]
    s=exactly(s,"vendedor?: string; loja?: string; origem?: string; minutos_aguardando: number;", "vendedor?: string; loja?: string; origem?: string; minutos_aguardando: number; segundos_aguardando?: number;",'tipo tempo')
    s=exactly(s,'<td className="p-3">{mins(l.minutos_aguardando)}</td><td className="p-3"><a className="text-primary underline" href="/triagem">Distribuir</a></td>',
       '<td className="p-3">{l.segundos_aguardando != null ? `${l.segundos_aguardando}s` : mins(l.minutos_aguardando)}</td><td className="p-3"><a className="text-primary underline" href="/triagem">Distribuir</a></td>','ui atendimento segundos')
    out[p]=s

    p='workers/aurox-whatsapp/push-dispatcher.mjs';s=out[p]
    anchor="  setInterval(()=>{void tick();},30000).unref();"
    schedule="""  // Triagem: prazo de 10s; verificação a cada 5s, inclusive sem painel aberto.
  // Usa a mesma chave do dispatcher push. Um ciclo nunca se sobrepõe a outro.
  let triagemRunning=false;
  async function triagemTick(){
    if(triagemRunning)return;
    triagemRunning=true;
    try{
      const res=await fetch(`${base}/api/cron/triagem`,{
        method:'POST',
        headers:{Authorization:`Bearer ${secret}`},
        signal:AbortSignal.timeout(12000),cache:'no-store',
      });
      if(!res.ok){console.warn(`[Aurox Triagem] despacho HTTP ${res.status}`);return;}
      const data=await res.json();
      if(Number(data.atribuidos)>0)console.info(`[Aurox Triagem] ${data.atribuidos} lead(s) distribuído(s)`);
    }catch(e){console.warn('[Aurox Triagem] falha temporária:',e?.message||'erro');}
    finally{triagemRunning=false;}
  }
  setTimeout(()=>{void triagemTick();},5000).unref();
  setInterval(()=>{void triagemTick();},5000).unref();"""
    s=exactly(s,anchor,anchor+'\n'+schedule,'agendador 5s')
    out[p]=s

    p='workers/aurox-whatsapp/Dockerfile';s=out[p]
    if 'COPY index.mjs push-dispatcher.mjs ./' not in s:
        s=exactly(s,'COPY index.mjs ./','COPY index.mjs push-dispatcher.mjs ./','Docker com dispatcher')
    out[p]=s

    out[CRON]="""import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { expirar } from '@/lib/triagem/auto-atribuir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente o worker autorizado pode iniciar a distribuição global; nunca público.
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET || '';
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
  if (secret.length < 32 || !token || Buffer.byteLength(secret)!==Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(secret),Buffer.from(token))) {
    return NextResponse.json({error:'Não autorizado'},{status:401});
  }
  try {
    const result = await expirar(null,true);
    return NextResponse.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[cron triagem]',error instanceof Error ? error.message : 'erro');
    return NextResponse.json({error:'Falha ao distribuir triagem'},{status:503});
  }
}
export async function GET() {
  return NextResponse.json({error:'Use POST autenticado'},{status:405});
}
"""
    return out

def install(root: Path):
    out=prepare(root) # validamos TODOS antes de escrever QUALQUER arquivo
    backup=root/'.aurox-backups'/('triagem-10s-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    for path in FILES:
        dst=backup/path;dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(root/path,dst)
    for path,content in out.items():
        dst=root/path;dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_text(content,encoding='utf-8')
    print('Hotfix 10s instalado. Backup em:',backup)
    print('Arquivos atualizados:',', '.join(out.keys()))
    print('Execute: npx tsc --noEmit, npm run build e o deploy de produção.')
    print('Triagem automática contínua requer worker online e PUSH_DISPATCH_SECRET igual no worker e na Vercel.')

if __name__=='__main__':
    if len(sys.argv)!=2:
        print('Uso: py -3 aplicar_triagem_10s.py C:\\pasta\\do\\projeto')
        sys.exit(2)
    try:install(Path(sys.argv[1]).expanduser().resolve())
    except Exception as e:
        print('INSTALAÇÃO INTERROMPIDA:',e)
        sys.exit(1)

from pathlib import Path
from tempfile import TemporaryDirectory
from aplicar_triagem_10s import prepare, FILES, MODULE, CRON

with TemporaryDirectory() as tmp:
 r=Path(tmp)
 fixtures={
 'app/api/triagem/route.ts': '''import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, getPool } from '@/lib/db';
import { gestorAtendimento } from '@/lib/atendimento-auth';
/** Checagem da fila sempre limitada à empresa para não atribuir leads entre clientes. */
async function expirar(empresaId: number | null, superadmin: boolean) {
  const {rows} = await query<{id:number;empresa_id:number}>(
    `SELECT id,empresa_id FROM public.triagem
      WHERE status='aguardando' AND empresa_id IS NOT NULL
        AND created_at < now() -
          (CASE WHEN origem='aurox-whatsapp' THEN interval '10 minutes'
                ELSE interval '1 minute' END)
        AND ($1::boolean OR empresa_id=$2)
      ORDER BY created_at LIMIT 50`,[superadmin,empresaId],
  );
  for(const t of rows) {
    const v=await queryOne<{id:number}>(
      `SELECT id FROM public.vendedores WHERE empresa_id=$1 ORDER BY random() LIMIT 1`,[t.empresa_id]);
    if(v) await virarLead(t.id,v.id,t.empresa_id).catch(err=>console.error('triagem auto',err instanceof Error?err.message:'erro'));
  }
}

/** Operação atômica: row lock, valida empresa do vendedor e registra lead exatamente uma vez. */
async function virarLead(triagemId:number,vendedorId:number,empresaPermitida:number | null) {
  const client=await getPool().connect();
  return triagemId;
}

export async function GET(req: NextRequest) {
  const actor = await gestorAtendimento(req);
  await expirar(actor.empresa_id,actor.tipo==='superadmin');
  return NextResponse.json({ok:true});
}
export async function POST(req: NextRequest){
  return NextResponse.json(await virarLead(1,1,1));
}
''',
 'app/(dashboard)/triagem/page.tsx':'Leads novos. Mensagens do Aurox-WhatsApp ficam até 10 minutos na fila antes da atribuição automática; outros canais seguem o prazo de 1 minuto.',
 'app/api/atendimento/route.ts':'''const triagemQuery=`SELECT origem, created_at AS desde,
                GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(now()-created_at))/60))::int AS minutos_aguardando`''',
 'app/(dashboard)/atendimento/page.tsx':'''interface Lead {
  vendedor?: string; loja?: string; origem?: string; minutos_aguardando: number;
}
<div><td className="p-3">{mins(l.minutos_aguardando)}</td><td className="p-3"><a className="text-primary underline" href="/triagem">Distribuir</a></td></div>''',
 'workers/aurox-whatsapp/push-dispatcher.mjs':'''export function startPushDispatcher(base){
  const secret=process.env.PUSH_DISPATCH_SECRET||'';
  function tick(){}
  setInterval(()=>{void tick();},30000).unref();
}''',
 'workers/aurox-whatsapp/Dockerfile':'''FROM node:22-bookworm-slim
COPY index.mjs ./
CMD ["node","index.mjs"]'''
 }
 for p,v in fixtures.items():
  (r/p).parent.mkdir(parents=True,exist_ok=True)
  (r/p).write_text(v,encoding='utf8')
 out=prepare(r)
 assert len(out)==len(FILES)+2
 assert "interval '10 seconds'" in out[MODULE]
 assert "interval '10 minutes'" not in out[MODULE]
 assert "interval '1 minute'" not in out[MODULE]
 assert 'export async function virarLead' in out[MODULE]
 assert 'export async function expirar' in out[MODULE]
 assert 'await expirar' in out['app/api/triagem/route.ts']
 assert "await expirar(null,true)" in out[CRON]
 assert 'setInterval(()=>{void triagemTick();},5000)' in out['workers/aurox-whatsapp/push-dispatcher.mjs']
 assert 'segundos_aguardando' in out['app/(dashboard)/atendimento/page.tsx']
 assert 'COPY index.mjs push-dispatcher.mjs ./' in out['workers/aurox-whatsapp/Dockerfile']
 for f,content in out.items():
  (r/f).parent.mkdir(parents=True,exist_ok=True)
  (r/f).write_text(content,encoding='utf8')
 # Sintaxe do worker e das novas rotas/módulos; não exige dependências do projeto.
 import subprocess
 subprocess.run(['node','--check',str(r/'workers/aurox-whatsapp/push-dispatcher.mjs')],check=True)
 check_js = r/'check_ts.cjs'
 check_js.write_text("""const ts = require('typescript');const fs = require('fs');const files=process.argv.slice(2);for(const file of files){const src=fs.readFileSync(file,'utf8');const out=ts.transpileModule(src,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.Preserve},reportDiagnostics:true});const issues=out.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error)||[];if(issues.length){console.error(file,issues);process.exitCode=1}}""",encoding='utf8')
 subprocess.run(['node',str(check_js)]+[str(r/x) for x in (MODULE,CRON,'app/api/triagem/route.ts')],check=True)
 print('PASSOU: transformação, extração do módulo, 10s todos os canais, cron protegido, worker 5s, UI segundos, Docker')
 print('Fixture:',r)

#!/usr/bin/env python3
"""Instalador conservador: valida antes de escrever, salva backup fora do Git e recusa alterações conflitantes."""
from __future__ import annotations
import hashlib,sys,shutil,re,datetime
from pathlib import Path
BASE=Path(__file__).resolve().parent
PAYLOAD=BASE/'payload'
SHA={
'components/sidebar-nav.tsx':'2df21fa2a97f0aca8ec5dc5e063e4be5f6a8e530',
'components/bottom-nav.tsx':'cdb16b266f7dc418ac0ef8b2134c70b78f7495ca',
'app/api/equipe/route.ts':'bf931e0faa2ac0ca9d19ff220e37a0957b761187',
'app/api/leads/stats/route.ts':'5ea1fa331d345f6c9224d1e66cf3ed4468f6b229',
'app/(dashboard)/documental/page.tsx':'3a7cdf80e99e470ca5a15eb551e4ea174fb8e23c',
'app/api/ranking/route.ts':'f052bcc98b948f1bcf652fc55b091744f66347ff',
'app/api/processos/route.ts':'423b4e4d7d46486ffd8c5cddae31037ef9cf1e42',
}

def gitblob(text:str)->str:
 data=text.replace('\r\n','\n').encode('utf-8');return hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()

def replace(s:str,old:str,new:str,path:str)->str:
 if s.count(old)!=1:raise ValueError(f'{path}: trecho esperado ausente ou duplicado ({old[:95]!r}). Não sobrescrevi mudanças locais.')
 return s.replace(old,new,1)

def transform(path:str,s:str)->str:
 if path=='app/api/leads/route.ts':
  s=replace(s,"const lojaParam = searchParams.get('loja');", "const lojaParam = searchParams.get('loja');\n    const empresaSelecionada = Number(searchParams.get('empresa_id'));",path)
  s=replace(s,"""      add('l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = ?)', u.empresa_id);
    }

    // RBAC""","""      params.push(u.empresa_id);
      const tenantParam=params.length;
      where.push(`(l.empresa_id=$${tenantParam} OR (l.empresa_id IS NULL AND l.vendedor_id IN
        (SELECT id FROM public.vendedores WHERE empresa_id=$${tenantParam})))`);
      where.push(`l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id=$${tenantParam})`);
    } else if (Number.isSafeInteger(empresaSelecionada) && empresaSelecionada > 0) {
      params.push(empresaSelecionada);
      const tenantParam=params.length;
      where.push(`(l.empresa_id=$${tenantParam} OR (l.empresa_id IS NULL AND l.vendedor_id IN
        (SELECT id FROM public.vendedores WHERE empresa_id=$${tenantParam})))`);
      where.push(`l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id=$${tenantParam})`);
    } else if (lojaParam) {
      return NextResponse.json({error:'Selecione a empresa antes da loja'},{status:400});
    }

    // RBAC""",path)
  s=replace(s,"""    if (filtro === 'responderam') where.push('COALESCE(l.respondeu, FALSE) = TRUE');""","""    // Cadastro recusado ou arquivado fica exclusivamente no Follow Up.
    where.push(`(l.followup_status='na_fila' OR (l.followup_status IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.fichas_credito f WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
      AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)')))`);
    if (filtro === 'responderam') where.push('COALESCE(l.respondeu, FALSE) = TRUE');""",path)
  return s
 if path=='app/(dashboard)/painel/page.tsx':
  s=replace(s,"""  const qc = useQueryClient();
  const uid = user?.id ?? 0;""","""  const qc = useQueryClient();
  const fav = useFavoritos();
  const superadmin = String(user?.tipo||'')==='superadmin';
  const [empresa,setEmpresa] = useState('');
  const empresasQuery = useQuery({queryKey:['painel-empresas'],enabled:superadmin,
    queryFn:async()=> (await api.get('/integracoes/empresas')).data as {id:number;nome:string}[]});
  useEffect(()=>{if(superadmin&&empresasQuery.data?.length)setEmpresa(old=>old||String(empresasQuery.data![0].id));},[superadmin,empresasQuery.data]);
  const lojasQuery = useQuery({queryKey:['painel-lojas',empresa,user?.empresa_id],
    enabled:!!user&&(!superadmin||!!empresa)&&['admin','marketing','superadmin'].includes(String(user.tipo)),
    queryFn:async()=> (await api.get('/lojas-opcoes',{params:{empresa_id:superadmin?empresa:undefined}})).data as {id:number;codigo:string;nome:string}[]});
  const ready = !!user&&(!superadmin||!!empresa);
  const uid = user?.id ?? 0;""",path)
  s=replace(s,"""    queryKey: ['leads', filtro, periodo, loja, vendedorId],
    queryFn: () =>
      leadsService.list({
        filtro,
        periodo,
        loja: loja || undefined,
        vendedor_id: vendedorId || undefined,
      }),
    refetchInterval: 5000,""","""    queryKey: ['leads', user?.id, user?.empresa_id, empresa, filtro, periodo, loja, vendedorId],
    enabled: ready,
    queryFn: () =>
      leadsService.list({
        filtro,periodo,loja: loja || undefined,vendedor_id: vendedorId || undefined,
        empresa_id: superadmin ? Number(empresa) : undefined,
      }),
    refetchInterval: 5000,""",path)
  s=replace(s,"""    queryKey: ['stats', periodo],
    queryFn: () => leadsService.stats({ periodo }),
    refetchInterval: 10000,""","""    queryKey: ['stats', user?.id,user?.empresa_id,empresa,periodo,loja,vendedorId],
    enabled: ready,
    queryFn: () => leadsService.stats({ periodo, loja:loja||undefined,vendedor_id:vendedorId||undefined,
      empresa_id:superadmin?Number(empresa):undefined }),
    refetchInterval: 10000,""",path)
  i=s.index('  const daLista = {');j=s.index('  const filteredLeads = useMemo',i)
  if i<0 or j<0:raise ValueError('painel: indicadores não encontrados')
  s=s[:i]+"""  // Nunca usar contadores anteriores ou de outra loja como fallback visual.
  const totalLeads = stats?.total_leads ?? '—';
  const totalResp = stats?.total_responderam ?? '—';
  const totalFichas = stats?.total_fichas ?? '—';
  const totalAprov = stats?.total_aprovados ?? '—';
  const totalVend = stats?.total_vendidos ?? '—';

"""+s[j:]
  s=replace(s,"""      <header>
        <h1 className="text-4xl font-bold tracking-tight">""","""      <header>
        {superadmin&&<label className="mb-4 block max-w-sm text-sm">Empresa
          <select value={empresa} onChange={e=>{setEmpresa(e.target.value);setLoja('');setVendedorId('');}}
            className="mt-1 w-full rounded-lg border bg-card p-2.5">
            <option value="">Selecione a empresa</option>
            {(empresasQuery.data||[]).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>}
        <h1 className="text-4xl font-bold tracking-tight">""",path)
  s=replace(s,"""                  onChange={(e) => setLoja(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="381">381</option>
                  <option value="764">764</option>
                  <option value="NINA">NINA</option>""","""                  onChange={(e) => {setLoja(e.target.value);setVendedorId('');}}
                >
                  <option value="">Todas</option>
                  {(lojasQuery.data||[]).map(x=><option key={x.id} value={x.codigo}>{x.nome} ({x.codigo})</option>)}""",path)
  s=replace(s,"""              <VendedorSelect
                loja={user?.tipo === 'gerente' ? user.loja || undefined : loja}
                value={vendedorId}""","""              <VendedorSelect
                loja={user?.tipo === 'gerente' ? user.loja || undefined : loja}
                empresaId={superadmin?empresa:undefined}
                value={vendedorId}""",path)
  s=replace(s,"""            <ActionRow
              icon={<ListPlus className="h-5 w-5" />}
              label="Adicionar à lista""","""            <ActionRow
              icon={<FolderHeart className="h-5 w-5" />}
              label="Mover para Follow Up"
              onClick={async()=>{try{await api.patch('/follow-up',{
                lead_id:Number(menuLead.id),acao:'mover',empresa_id:superadmin?Number(empresa):undefined,
                motivo:'Retirado do painel inicial pelo vendedor/gestor'});
                toast.success('Lead movido para Follow Up');setMenuLead(null);
                await qc.invalidateQueries({queryKey:['leads']});await qc.invalidateQueries({queryKey:['stats']});
              }catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível mover');}}}
            />
            <ActionRow
              icon={<ListPlus className="h-5 w-5" />}
              label="Adicionar à lista""",path)
  s=replace(s,"""  Info, Heart, ListPlus, Trash2, Calendar, X, Plus, Pin,""","""  Info, Heart, ListPlus, Trash2, Calendar, X, Plus, Pin, FolderHeart,""",path)
  s=replace(s,"""function VendedorSelect({
  loja,
  value,""","""function VendedorSelect({
  loja,
  empresaId,
  value,""",path)
  s=replace(s,"""  loja?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ['vendedores-filtro', loja],
    queryFn: async () => (await api.get('/equipe')).data,
  });""","""  loja?: string;
  empresaId?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ['vendedores-filtro', empresaId,loja],
    enabled:empresaId!=='' ,
    queryFn: async () => (await api.get('/equipe',{params:{empresa_id:empresaId||undefined,loja:loja||undefined}})).data,
  });""",path)
  return s
 if path=='types/index.ts':
  s=replace(s,"""  vendedor_id?: string;
  filtro?:""","""  vendedor_id?: string;
  empresa_id?: number;
  filtro?:""",path)
  s=replace(s,"""  busca?: string;
  vendedor_id?: number;
}""","""  busca?: string;
}""",path)
  return s
 if path=='app/login/page.tsx':
  return replace(s,"""            </form>
            <p className="mt-7""","""              <div className="text-right"><Link href="/recuperar-senha" className="text-sm text-violet-200 underline underline-offset-4">Esqueci minha senha</Link></div>
            </form>
            <p className="mt-7""",path)
 if path=='app/(dashboard)/gestao-usuarios/page.tsx':
  s=replace(s,""" const [nome,setNome]=useState('');const [login,setLogin]=useState('');const [senha,setSenha]=useState('');""",""" const [nome,setNome]=useState('');const [login,setLogin]=useState('');const [email,setEmail]=useState('');const [senha,setSenha]=useState('');""",path)
  s=replace(s,"""  await api.post('/gestao-usuarios',{nome,login,senha,tipo:cargo,loja,empresa_id:Number(empresa)});
  toast.success('Usuário cadastrado');setNome('');setLogin('');setSenha('');""","""  await api.post('/gestao-usuarios',{nome,login,email,senha,tipo:cargo,loja,empresa_id:Number(empresa)});
  toast.success('Usuário cadastrado');setNome('');setLogin('');setEmail('');setSenha('');""",path)
  s=replace(s,"""    <label className="text-sm">Cargo<select""","""    <label className="text-sm">E-mail para recuperação<Input type="email" className="mt-1" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={200} placeholder="usuario@empresa.com.br"/></label>
    <label className="text-sm">Cargo<select""",path)
  return s
 if path=='app/api/gestao-usuarios/route.ts':
  s=replace(s,""" const senha=String(body.senha||'');const cargo=String(body.tipo||'').trim().toLowerCase();""",""" const senha=String(body.senha||'');const cargo=String(body.tipo||'').trim().toLowerCase();
 const email=String(body.email||'').trim().toLowerCase().slice(0,200);""",path)
  s=replace(s,""" if(nome.length<2||nome.length>140||!/^[a-zA-Z0-9._@-]{3,80}$/.test(login)||senha.length<8||senha.length>150||!loja||loja.length>80)""",""" if(nome.length<2||nome.length>140||!/^[a-zA-Z0-9._@-]{3,80}$/.test(login)||!/^\\S+@\\S+\\.\\S+$/.test(email)||senha.length<8||senha.length>150||!loja||loja.length>80)""",path)
  s=replace(s,"""  const created=await client.query(`INSERT INTO public.usuarios(nome,login,senha_hash,tipo,loja,empresa_id,vendedor_id,ativo,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,'ativo') RETURNING id,nome,login,tipo,loja,empresa_id,vendedor_id,ativo`,
    [nome,login,hashPassword(senha),cargo,loja,empresaId,vendedorId]);""","""  const created=await client.query(`INSERT INTO public.usuarios(nome,login,email,senha_hash,tipo,loja,empresa_id,vendedor_id,ativo,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'ativo') RETURNING id,nome,login,tipo,loja,empresa_id,vendedor_id,ativo`,
    [nome,login,email,hashPassword(senha),cargo,loja,empresaId,vendedorId]);""",path)
  return s
 if path=='lib/session.ts':
  s=replace(s,"""      empresa_ativa: boolean | null;
    }>(""","""      empresa_ativa: boolean | null;
      senha_alterada_em: string | null;
    }>(""",path)
  s=replace(s,"""         COALESCE(e.ativo, TRUE) AS empresa_ativa
       FROM public.usuarios u""","""         COALESCE(e.ativo, TRUE) AS empresa_ativa,
         NULLIF(TO_JSONB(u)->>'senha_alterada_em','') AS senha_alterada_em
       FROM public.usuarios u""",path)
  s=replace(s,"""    if (!row.ativo) return null;
    if (!STATUS_LOGIN_OK.has""","""    if (!row.ativo) return null;
    if (row.senha_alterada_em) {
      const issued = Number((u as SessionUser & {iat?:number}).iat||0);
      if (!issued || issued <= Math.floor(new Date(row.senha_alterada_em).getTime()/1000)) return null;
    }
    if (!STATUS_LOGIN_OK.has""",path)
  return s
 if path=='workers/aurox-whatsapp/push-dispatcher.mjs':
  return replace(s,"""  setInterval(()=>{void tick();},30000).unref();
}""","""  setInterval(()=>{void tick();},30000).unref();
  // Follow Up: fila backend com consentimento, horário comercial e cadência transacional.
  let followRunning=false;
  async function followUp(){
    if(followRunning)return;followRunning=true;
    try{
      const res=await fetch(`${base}/api/cron/follow-up`,{
        headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(30000),cache:'no-store',
      });
      if(!res.ok && res.status!==404)console.warn('[Aurox Follow Up] despacho HTTP',res.status);
    }catch(e){console.warn('[Aurox Follow Up] fila indisponível',e?.message||'erro');}
    finally{followRunning=false;}
  }
  setTimeout(()=>void followUp(),15000).unref();
  setInterval(()=>void followUp(),30000).unref();
}""",path)
 if path=='workers/aurox-whatsapp/Dockerfile':
  if 'COPY index.mjs push-dispatcher.mjs ./' in s:return s
  return replace(s,'COPY index.mjs ./','COPY index.mjs push-dispatcher.mjs ./',path)
 raise RuntimeError(f'Arquivo não tratado: {path}')

def main():
 if len(sys.argv)<2:sys.exit('Uso: python aplicar_aurox.py C:\\caminho\\do\\MANU [--check]')
 repo=Path(sys.argv[1]).resolve();check='--check'in sys.argv[2:]
 if not (repo/'package.json').exists() or not (repo/'app/api/leads/route.ts').exists():sys.exit(f'Não parece ser a pasta do MANU: {repo}')
 originals:dict[str,bytes|None]={};updates:dict[str,bytes]={}
 for path in list(SHA)+[
  'app/api/leads/route.ts','app/(dashboard)/painel/page.tsx','types/index.ts',
  'app/login/page.tsx','app/(dashboard)/gestao-usuarios/page.tsx','app/api/gestao-usuarios/route.ts',
  'lib/session.ts','workers/aurox-whatsapp/push-dispatcher.mjs','workers/aurox-whatsapp/Dockerfile']:
  filename=repo/path
  if not filename.exists():sys.exit(f'Arquivo obrigatório não encontrado: {path}')
  raw=filename.read_bytes();originals[path]=raw
  s=raw.decode('utf-8-sig').replace('\r\n','\n')
  if path in SHA:
   existing=gitblob(s)
   if existing!=SHA[path]:sys.exit(f'Arquivo modificado desde a revisão: {path} ({existing}). Operação cancelada para preservar suas alterações.')
   if path=='app/(dashboard)/documental/page.tsx':new="import {redirect} from 'next/navigation';\nexport default function Documental(){redirect('/processos');}\n"
   else:new=(PAYLOAD/path).read_text(encoding='utf-8')
  else:
   try:new=transform(path,s)
   except ValueError as e:sys.exit(str(e))
  updates[path]=new.encode('utf-8')
 for f in PAYLOAD.rglob('*'):
  if not f.is_file():continue
  p=f.relative_to(PAYLOAD).as_posix()
  if p in updates:continue
  if (repo/p).exists():sys.exit(f'Novo arquivo já existe, operação cancelada: {p}')
  updates[p]=f.read_bytes();originals[p]=None
 print(f'{len(updates)} arquivos verificados. '+('Nenhuma alteração realizada (check).' if check else 'Preparando backup.'))
 if check:return
 backup=repo.parent/f'{repo.name}_BACKUP_AUROX_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}'
 for p,blob in originals.items():
  if blob is not None:
   f=backup/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(blob)
 for p,blob in updates.items():
  f=repo/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(blob)
 print(f'Alterações aplicadas. Backup fora do repositório: {backup}')
 print('PRÓXIMO: execute migration em homologação, rode npx tsc --noEmit e npm run build. Nunca publique antes de testar.')
if __name__=='__main__':main()

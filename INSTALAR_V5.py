#!/usr/bin/env python3
"""Instalador defensivo do AUROX V5. --check só valida, sem escrever.
Verifica SHAs dos arquivos críticos; faz backup e não executa SQL/publicação.
"""
from __future__ import annotations
import argparse, datetime, hashlib, sys
from pathlib import Path
BASE=Path(__file__).resolve().parent
P=BASE/'payload'; A=BASE/'assets'
KNOWN={
 'app/(dashboard)/estoque/page.tsx':'c24d5d2dff2f9d5d8b8b7fcecb1f4adbefcf7517',
 'app/(dashboard)/anuncios/page.tsx':'ef676a09e3c49963b9e7b97838d02ac151de9ce4',
 'app/api/anuncios/route.ts':'5639da38ffae3d854500f3f2064e4a5a00583113',
 'app/api/estoque/route.ts':'3c06a804108169a2041322e7a58934de19b1783f',
 'app/api/estoque/fotos/route.ts':'0abe503fdc12db01bf93845e0ac6cb2d9e0b522c',
 'app/api/oficina/route.ts':'6dfcb4286fa269336863c26f0acfb68113b3005a',
 'app/(dashboard)/oficina/page.tsx':'71a6b2f726c4897f2e85cbdb1b150d77ae957c1f',
 
 'app/(dashboard)/faturamento/page.tsx':'5b4dd4f17fafed7543bfd7b80421d35972b87650',
 'app/api/faturamento/liberar/route.ts':'d029142b28b310a85890fed8084666d20b30ab45',
 'app/api/processos/route.ts':'919a121c5efce208d4b9043d840fb312f3b058d5',
 'app/(dashboard)/processos/page.tsx':'3b67e188a8db3ed5d1e02458c8d39007310f194d',
 'app/(dashboard)/estoque/cadastrar/page.tsx':'0895c7dd74368f312a63bc95119341fddfc2c7f6',
}
# We intentionally do not accept arbitrary altered files on audited routes.
# For paths affected by the V4 patch, verify its well-known code signature as alternative.

def blob_sha(b:bytes)->str:
 return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def one(s:str,old:str,new:str,path:str)->str:
 n=s.count(old)
 if n!=1:raise ValueError(f'{path}: ponto de alteração ausente/ambíguo ({n}): {old[:75]!r}')
 return s.replace(old,new,1)

def estoque_page(s:str)->str:
 p='app/(dashboard)/estoque/page.tsx'
 if "import Link from 'next/link';" not in s:s=one(s,"import { nomeVeiculo } from '@/lib/nome-veiculo';","import { nomeVeiculo } from '@/lib/nome-veiculo';\nimport Link from 'next/link';",p)
 if 'href="/estoque/cadastrar"' not in s:
  start='      {canEdit && (\n        <form className="space-y-3 rounded-xl border bg-card p-4"'
  end='      )}\n\n      <div className="flex flex-wrap gap-3">'
  i=s.find(start);j=s.find(end,i)
  if i<0 or j<0:raise ValueError(f'{p}: formulário antigo não identificado')
  s=s[:i]+s[j+len('      )}\n\n'):]
  s=s.replace("  const [novoCarro, setNovoCarro] = useState({ marca: '', modelo: '', ano: '', placa: '', preco: '', cor: '', patio: '', empresa_id: '' });\n",'')
 else:
  # Quando a V4 já substituiu o formulário, tirar o segundo botão duplicado.
  start='      {canEdit && (\n        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 sm:p-5">'
  end='      )}\n\n      <div className="flex flex-wrap gap-3">'
  i=s.find(start);j=s.find(end,i)
  if i>=0 and j>=0:s=s[:i]+s[j+len('      )}\n\n'):]
 # Botão expresso, no alto do Estoque; edição por item no modal.
 if 'Adicionar veículo · cadastro completo' not in s:
  s=one(s,'      </header>','''      </header>
      {canEdit&&<div className="flex flex-wrap gap-2">
        <Link href="/estoque/cadastrar" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:opacity-90">+ Adicionar veículo · cadastro completo</Link>
        <Link href="/anuncios" className="inline-flex items-center rounded-lg border px-4 py-3 text-sm hover:bg-muted">Ver na aba Anúncios</Link>
      </div>}''',p)
 if 'Editar veículo</Link>' not in s:
  s=one(s,'              <div className="flex items-start justify-between">','''              {canEdit&&<Link href={`/estoque/cadastrar?editar=${c.id}`} onClick={e=>e.stopPropagation()}
                className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Editar veículo</Link>}
              <div className="flex items-start justify-between">''',p)
 if 'Editar ficha completa do veículo' not in s:
  s=one(s,'            {loadingFotos ? (','''            {canEdit&&<div className="mb-3 flex flex-wrap gap-2">
              <Link href={`/estoque/cadastrar?editar=${sel.id}`} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Editar ficha completa do veículo</Link>
              <Link href="/anuncios" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Ver em Anúncios</Link>
            </div>}
            {loadingFotos ? (''',p)
 return s

def anuncios_page(s:str)->str:
 p='app/(dashboard)/anuncios/page.tsx'
 if "import Link from 'next/link';" not in s:
  s=one(s,"'use client';","'use client';\nimport Link from 'next/link';",p)
 if 'Criar veículo no Estoque' not in s:
  s=one(s,'      <div className="flex flex-wrap gap-2">','''      <div className="flex flex-wrap gap-2">
        <Link href="/estoque/cadastrar" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">+ Criar veículo no Estoque</Link>''',p)
 if 'Editar ficha completa (Estoque ↔ Anúncios)' not in s:
  s=one(s,'<h2 className="font-bold text-lg">Veículo · anunciar</h2>','''<h2 className="font-bold text-lg">Veículo · anunciar</h2>
              <Link href={`/estoque/cadastrar?editar=${sel.id}`} className="rounded-lg border px-3 py-2 text-xs hover:bg-muted">Editar ficha completa (Estoque ↔ Anúncios)</Link>''',p)
 return s

def anuncios_api(s:str)->str:
 p='app/api/anuncios/route.ts'
 if 'aurox_detalhes, empresa_id' not in s:
  s=one(s,'anunciado_em, anuncios_meta, empresa_id,','anunciado_em, anuncios_meta, aurox_detalhes, empresa_id,',p)
 if 'Espelho do cadastro completo' not in s:
  anchor='  if (!fields.length) return NextResponse.json({ error: \'nada para atualizar\' }, { status: 400 });'
  s=one(s,anchor,'''  // Espelho do cadastro completo: o anúncio edita as mesmas colunas físicas do estoque
  // e sincroniza KM/carroceria no JSONB usado pela ficha detalhada.
  const espelho: Record<string, unknown> = {};
  if (body.km !== undefined) espelho.km = body.km == null || body.km === '' ? null : Number(body.km);
  if (body.carroceria !== undefined) espelho.carroceria = body.carroceria || null;
  if (Object.keys(espelho).length) {
    params.push(JSON.stringify(espelho));
    fields.push(`aurox_detalhes=COALESCE(aurox_detalhes,'{}'::jsonb) || $${params.length}::jsonb`);
  }
  // Espelho do cadastro completo — nenhuma publicação é acionada aqui.
'''+anchor,p)
 if "status_estoque, status FROM public.estoque_carros" not in s:
  s=one(s,"SELECT empresa_id FROM public.estoque_carros WHERE id=$1","SELECT empresa_id,status_estoque,status FROM public.estoque_carros WHERE id=$1",p)
  s=one(s,"  const fields: string[] = [];",'''  if (String(owner.rows[0].status_estoque||'').toLowerCase()==='inativo'||/vendid/i.test(String(owner.rows[0].status||'')))
    return NextResponse.json({error:'Veículo vendido ou inativo. Ficha bloqueada para alterações comerciais.'},{status:409});
  const fields: string[] = [];''',p)
 return s

def estoque_api(s:str)->str:
 p='app/api/estoque/route.ts'
 if "from '@/lib/aurox-veiculo-cadastro'" not in s:
  s=one(s,"import { variantesBusca } from '@/lib/fuzzy';","import { variantesBusca } from '@/lib/fuzzy';\nimport { getPool } from '@/lib/db';\nimport { prepararVeiculo } from '@/lib/aurox-veiculo-cadastro';",p)
 # Quando faturamento libera, o veículo sai do estoque disponível. A aba Anúncios usa o mesmo critério.
 if "COALESCE(status_estoque,'ativo') <> 'inativo'" not in s:
  s=one(s,"let where = '1=1';","let where = \"COALESCE(status_estoque,'ativo') <> 'inativo'\";",p)
  s=one(s,"let where2 = '1=1';","let where2 = \"COALESCE(status_estoque,'ativo') <> 'inativo'\";",p)
 a=s.find('/** Cadastro manual do veiculo - papéis de gestao, isolado por empresa. */')
 if a<0:a=s.find('/** Cadastro manual de veículo; registro e auditoria na mesma transação')
 if a<0:raise ValueError(f'{p}: POST inesperado')
 # Mantém GET existente, substitui POST com versão auditada para gravar JSON e colunas refletidas em Anúncios.
 return s[:a]+(A/'estoque_post_v5.ts').read_text('utf-8')

def fotos_api(s:str)->str:
 p='app/api/estoque/fotos/route.ts'
 if "import { getPool } from '@/lib/db';" not in s:s=one(s,"import { query } from '@/lib/db';","import { query, getPool } from '@/lib/db';",p)
 if 'export async function PATCH' not in s:s+='\n'+(A/'fotos_patch.ts').read_text('utf-8')
 return s

def oficina_api(s:str)->str:
 p='app/api/oficina/route.ts'
 if "from '@/lib/concluir-oficina'" not in s:s=one(s,"import { notificar } from '@/lib/notify';","import { notificar } from '@/lib/notify';\nimport { concluirOficina } from '@/lib/concluir-oficina';",p)
 if 'const concluidos = ' not in s:
  s=one(s,"    let where = '1=1';",'''    const concluidos = new URL(req.url).searchParams.get('concluidos') === '1';
    let where = concluidos ? 'COALESCE(pronto,FALSE)=TRUE' : 'COALESCE(pronto,FALSE)=FALSE';''',p)
 start='    // estoque\n    let estoqueId: number | null = null;'
 end='    const row = await queryOne(\n      `\n      INSERT INTO public.oficina_carros ('
 i=s.find(start);j=s.find(end,i)
 if i>=0 and j>=0:
  s=s[:i]+'''    // Oficina é um registro de serviço; não insere veículo no estoque antes de estar pronto.
    // Se o veículo já existe nesta empresa, guarda apenas o vínculo sem modificar o estoque.
    const est = await queryOne<{id:number;status:string}>(`SELECT id,status FROM public.estoque_carros
      WHERE REGEXP_REPLACE(UPPER(COALESCE(placa,'')),'[^A-Z0-9]','','g')=$1 AND empresa_id=$2 ORDER BY id DESC LIMIT 1`,
      [placa,empresaId]);
    let estoqueId:number|null=est?.id??null;
    const recal=Boolean(est&&/vendid/i.test(String(est.status||'')));
    const preco=b.valor_carro!=null?Number(b.valor_carro):null;

'''+s[j:]
 elif '// Oficina é um registro de serviço' not in s:raise ValueError(f'{p}: inserção antecipada de estoque não reconhecida')
 if 'if (b.pronto === true) return concluirOficina(u, b);' not in s:
  marker='    if (!b.id) return NextResponse.json({ error: \'id obrigatório\' }, { status: 400 });'
  s=one(s,marker,'''    if (b.pronto === true) return concluirOficina(u, b);
    if (b.pronto === false && !['admin','gerente','marketing','superadmin'].includes(u.tipo))
      return NextResponse.json({error:'Somente gestores podem reabrir um veículo concluído'},{status:403});
'''+marker,p)
 i=s.find('    // pronto vai para o estoque (ativo); anúncio não liga sozinho')
 j=s.find('    return NextResponse.json(row);',i)
 if i>=0 and j>=0:s=s[:i]+'''    // Atualizações de mecânica/lataria não podem mudar o estoque. A passagem
    // para Estoque/Anúncios ocorre somente em concluirOficina, com transação.

'''+s[j:]
 elif 'Atualizações de mecânica/lataria' not in s:raise ValueError(f'{p}: legado de atualização de estoque não identificado')
 return s

def oficina_page(s:str)->str:
 p='app/(dashboard)/oficina/page.tsx'
 if 'mostrarConcluidos' not in s:
  s=one(s,"  const [busca, setBusca] = useState('');",'''  const [busca, setBusca] = useState('');
  const [mostrarConcluidos,setMostrarConcluidos]=useState(false);
  const podeConcluir=['admin','gerente','marketing','superadmin'].includes(user?.tipo||'');''',p)
  s=one(s,"queryKey: ['oficina', busca],","queryKey: ['oficina', busca, mostrarConcluidos],",p)
  s=one(s,"{ params: { busca: busca || undefined } }","{ params: { busca: busca || undefined, concluidos:mostrarConcluidos?'1':undefined } }",p)
  s=one(s,'Pronto há mais de 4 dias sai automaticamente. Placa nova entra no estoque.',
    'Ao marcar Pronto, o veículo sai da lista ativa da Oficina e fica disponível em Estoque e Anúncios (sem publicar em portais).',p)
  # Cabeçalho possui busca logo após fechamento; inserir controle antes do campo de busca.
  marker='      <div className="flex flex-wrap gap-3">'
  s=one(s,marker,'''      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={()=>setMostrarConcluidos(x=>!x)}>{mostrarConcluidos?'Voltar à oficina ativa':'Ver veículos concluídos'}</Button>''',p)
  s=one(s,'onCheckedChange={(v) => salvar(c.id, { pronto: v })}',
    'disabled={!podeConcluir||!!c.pronto||mostrarConcluidos}\n                       onCheckedChange={(v) => {if(v&&podeConcluir)void salvar(c.id,{pronto:true});}}',p)
  s=one(s,"       toast.success('Salvo');", "       toast.success(patch.pronto===true?'Veículo concluído: enviado para Estoque e Anúncios.':'Salvo');",p) if "       toast.success('Salvo');" in s else s
 return s

def faturamento_api(s:str)->str:
 p='app/api/faturamento/route.ts'
 if 'AS liberado' not in s:
  s=one(s,'f.created_at, f.loja, f.empresa_id,','f.created_at, f.loja, f.empresa_id, COALESCE(f.liberado,FALSE) AS liberado,',p)
 return s

def faturamento_page(s:str)->str:
 p='app/(dashboard)/faturamento/page.tsx'
 if 'liberarDocumentoV5' not in s:
  s=one(s,'  function set(k:string,v:string){', '''  const [liberandoId,setLiberandoId]=useState<number|null>(null);
  async function liberarDocumentoV5(f:any){
    if(!confirm(`Liberar ${f.marca||''} ${f.modelo||''} · ${f.placa||''} para Transferências? Isso também baixará o veículo do estoque disponível.`))return;
    setLiberandoId(Number(f.id));
    try{
      const {data}=await api.post('/faturamento/liberar',{id:Number(f.id),empresa_id:Number(f.empresa_id||empresaId)});
      toast.success(data?.mensagem||'Veículo liberado para Transferências');
      if(aberto?.id===f.id)setAberto({...aberto,liberado:true});
      await qc.invalidateQueries({queryKey:['faturamento']});
    }catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível liberar o documento');}
    finally{setLiberandoId(null);}
  }
  function set(k:string,v:string){''',p)
  s=one(s,"<p className=\"mt-1 text-xs text-muted-foreground\">{f.status||'emitido'}</p></div>",
    '''<p className="mt-1 text-xs text-muted-foreground">{f.liberado?'Em Transferências':f.status||'emitido'}</p>
        {['superadmin','admin','gerente','marketing','documentista','documento','elfenai','elfenaí'].includes(String(user?.tipo||'').toLowerCase())&&
          <Button size="sm" variant="outline" className="mt-2" disabled={liberandoId===f.id}
            onClick={e=>{e.stopPropagation();void liberarDocumentoV5(f);}}>
             {liberandoId===f.id?'Processando…':f.liberado?'Revalidar transferência':'Liberar para Transferências'}
          </Button>}</div>''',p)
  start='            {!aberto.liberado&&<Button variant="outline" onClick={async()=>{'
  end='            }}>Liberar carro</Button>}'
  i=s.find(start);j=s.find(end,i)
  if i<0 or j<0:raise ValueError(f'{p}: botão antigo de liberação não localizado')
  s=s[:i]+'''            <Button variant="outline" disabled={liberandoId===aberto.id}
              onClick={()=>void liberarDocumentoV5(aberto)}>{aberto.liberado?'Revalidar transferência':'Liberar para Transferências'}</Button>
            {aberto.liberado&&<a className="rounded-lg border px-3 py-2 text-sm" href="/processos">Ver em Transferências</a>}
'''+s[j+len(end):]
 return s


def processos_api(s:str)->str:
 p='app/api/processos/route.ts'
 if 'Apenas liberar no faturamento' not in s:
  start='  // Criação de processos idempotente por empresa, nunca cruza placa de outro locatário.'
  end='  const {rows}=await query(`SELECT p.id'
  i=s.find(start);j=s.find(end,i)
  if i<0 or j<0:raise ValueError(f'{p}: consulta com criação automática não encontrada')
  s=s[:i]+'  // Apenas liberar no faturamento pode criar a transferência. Consultar é somente leitura.\n'+s[j:]
 if 'p.faturamento_id IS NOT NULL AND fat2.id=p.faturamento_id' not in s:
  old="""     ((p.ficha_id IS NOT NULL AND fat2.ficha_id=p.ficha_id)
       OR (p.lead_id IS NOT NULL AND fat2.lead_id=p.lead_id)
       OR (COALESCE(p.placa,'')<>'' AND UPPER(REGEXP_REPLACE(COALESCE(fat2.placa,''),'[^A-Z0-9]','','g'))=
        UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))))"""
  new="""     ((p.faturamento_id IS NOT NULL AND fat2.id=p.faturamento_id)
      OR (p.faturamento_id IS NULL AND (
       (p.ficha_id IS NOT NULL AND fat2.ficha_id=p.ficha_id)
        OR (p.lead_id IS NOT NULL AND fat2.lead_id=p.lead_id)
        OR (COALESCE(p.placa,'')<>'' AND UPPER(REGEXP_REPLACE(COALESCE(fat2.placa,''),'[^A-Z0-9]','','g'))=
         UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))))))"""
  s=one(s,old,new,p)
 return s

def processos_page(s:str)->str:
 p='app/(dashboard)/processos/page.tsx'
 if 'Não foi possível consultar esta empresa' not in s:
  s=one(s,'{error && <p className="text-rose-400">Erro ao carregar.</p>}', '{error && <p className="text-rose-400">Não foi possível consultar esta empresa. Confira a migration de Transferências e os Logs da Vercel.</p>}',p)
  s=one(s,'{!isLoading && lista.length === 0 && (','{!isLoading && !error && lista.length === 0 && (',p)
 if 'empresaId: number' not in s:
  s=one(s,'async function toggle(id: number, field: string, value: boolean)', 'async function toggle(id: number, empresaId: number, field: string, value: boolean)',p)
  s=one(s,"await api.patch('/processos', { id, [field]: value });","await api.patch('/processos', { id, empresa_id: empresaId, [field]: value });",p)
  s=one(s,'async function setStatus(id: number, status: string)', 'async function setStatus(id: number, empresaId: number, status: string)',p)
  s=one(s,"await api.patch('/processos', { id, status });","await api.patch('/processos', { id, empresa_id: empresaId, status });",p)
  s=one(s,'onChange={(e) => setStatus(p.id, e.target.value)}','onChange={(e) => setStatus(p.id,Number(p.empresa_id),e.target.value)}',p)
  s=one(s,'onCheckedChange={(v) => toggle(p.id, e.key, !!v)}','onCheckedChange={(v) => toggle(p.id,Number(p.empresa_id),e.key, !!v)}',p)
 return s

TRANSFORMS={
 'app/(dashboard)/estoque/page.tsx':estoque_page,
 'app/(dashboard)/anuncios/page.tsx':anuncios_page,
 'app/api/anuncios/route.ts':anuncios_api,
 'app/api/estoque/route.ts':estoque_api,
 'app/api/estoque/fotos/route.ts':fotos_api,
 'app/api/oficina/route.ts':oficina_api,
 'app/(dashboard)/oficina/page.tsx':oficina_page,
 'app/api/faturamento/route.ts':faturamento_api,
 'app/(dashboard)/faturamento/page.tsx':faturamento_page,
 'app/api/processos/route.ts':processos_api,
 'app/(dashboard)/processos/page.tsx':processos_page,
}

def main()->int:
 parser=argparse.ArgumentParser();parser.add_argument('projeto',type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 repo=args.projeto.resolve()
 if not (repo/'package.json').is_file() or not (repo/'app/api/estoque/route.ts').is_file():
  print('ERRO: selecione a pasta do projeto MANU (com package.json).');return 2
 changes:dict[str,bytes]={};previous:dict[str,bytes|None]={}
 try:
  for rel,fn in TRANSFORMS.items():
   path=repo/rel
   if not path.is_file():raise ValueError(f'Arquivo base inexistente: {rel}')
   raw=path.read_bytes();sha=blob_sha(raw)
   # Aceita estado original auditado ou V4 no Estoque e cadastro; demais arquivos críticos devem coincidir.
   expected=KNOWN.get(rel)
   if expected and sha!=expected:
    if rel=='app/(dashboard)/estoque/page.tsx' and 'href="/estoque/cadastrar"' in raw.decode('utf-8-sig'):pass
    elif rel=='app/api/estoque/route.ts' and "from '@/lib/aurox-veiculo-cadastro'" in raw.decode('utf-8-sig'):pass
    else:raise ValueError(f'{rel}: arquivo local diferente do auditado (SHA={sha}). Faça integração manual sem sobrescrever.')
   s=raw.decode('utf-8-sig').replace('\r\n','\n');new=fn(s).encode('utf-8')
   if new!=raw:changes[rel]=new;previous[rel]=raw
  # Rotas/páginas geradas integralmente e migration.
  for path in P.rglob('*'):
   if not path.is_file():continue
   rel=path.relative_to(P).as_posix();new=path.read_bytes();dest=repo/rel
   if dest.exists():
    raw=dest.read_bytes()
    if raw==new:continue
    expected=KNOWN.get(rel)
    if rel=='app/(dashboard)/estoque/cadastrar/page.tsx' and blob_sha(raw)==expected:
     pass
    elif rel=='app/api/faturamento/liberar/route.ts' and blob_sha(raw)==expected:pass
    else:raise ValueError(f'{rel}: já existe com conteúdo diferente; faça revisão manual.')
    previous[rel]=raw
   else:previous[rel]=None
   changes[rel]=new
  if not changes:print('V5 já está instalada.');return 0
  print(f'Pré-validação OK: {len(changes)} arquivos. '+('Somente conferência (--check).' if args.check else 'Aplicando com backup.'))
  for rel in sorted(changes):print(' -',rel)
  if args.check:return 0
  backup=repo.parent/(repo.name+'_BACKUP_AUROX_V5_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
  done=[]
  try:
   for rel,old in previous.items():
    if old is not None:
     dst=backup/rel;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(old)
   for rel,new in changes.items():
    dest=repo/rel;dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_suffix(dest.suffix+'.aurox-v5-tmp');tmp.write_bytes(new);tmp.replace(dest);done.append(rel)
  except Exception:
   for rel in reversed(done):
    old=previous.get(rel);dst=repo/rel
    if old is None:dst.unlink(missing_ok=True)
    else:dst.write_bytes(old)
   raise
  print('Arquivos atualizados. Backup:',backup)
  print('Aplique migration SQL depois de testar em homologação; execute npx tsc --noEmit e npm run build. Faça commit e deploy por conta própria.')
  return 0
 except Exception as exc:
  print('ERRO na pré-validação:',exc);return 1

if __name__=='__main__':sys.exit(main())

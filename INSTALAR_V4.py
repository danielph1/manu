#!/usr/bin/env python3
"""AUROX V4: pré-validação, backup e aplicação atômica best-effort. Não modifica banco ou GitHub."""
import argparse, datetime, hashlib, re
from pathlib import Path
BASE=Path(__file__).resolve().parent
P=BASE/'payload';ASSETS=BASE/'assets'
V2_FOLLOW_SHA='a2b86ff9ffc293339121a201b59294d82e3914ba'
V2_PAGE_SHA='73bfedf1a776b4665b3e5414e2cb7e1ac9406f2d'
V2_GESTAO_SHA='cc2a0759305c78302a9c06ce239ee2b15d67a89e'
V2_CAMP_SHA='29afd112b8663bf5cb3f4d2d630115357b7abe52'

def sha(content:bytes):return hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
def replace_unique(s,old,new,name):
 if s.count(old)!=1:raise ValueError(f'{name}: marcador esperado ocorreu {s.count(old)} vezes; revisão manual necessária')
 return s.replace(old,new,1)

def update_estoque(s):
 p='app/(dashboard)/estoque/page.tsx'
 if 'href="/estoque/cadastrar"' in s:return s
 if "import Link from 'next/link';" not in s:s=replace_unique(s,"import { nomeVeiculo } from '@/lib/nome-veiculo';","import { nomeVeiculo } from '@/lib/nome-veiculo';\nimport Link from 'next/link';",p)
 start='      {canEdit && (\n        <form className="space-y-3 rounded-xl border bg-card p-4"'
 end='      )}\n\n      <div className="flex flex-wrap gap-3">'
 i=s.find(start);j=s.find(end,i)
 if i<0 or j<0:raise ValueError(f'{p}: formulário compacto não identificado')
 new='''      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 sm:p-5">
          <div><h2 className="font-semibold">Cadastrar veículo</h2><p className="mt-1 text-xs text-muted-foreground">Página completa com fotos, dados, preços, observações e opcionais.</p></div>
          <Link href="/estoque/cadastrar" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">+ Cadastrar veículo</Link>
        </div>
      )}

      <div className="flex flex-wrap gap-3">'''
 s=s[:i]+new+s[j+len(end):]
 s=s.replace("  const [novoCarro, setNovoCarro] = useState({ marca: '', modelo: '', ano: '', placa: '', preco: '', cor: '', patio: '', empresa_id: '' });\n",'')
 return s

def update_estoque_route(s):
 p='app/api/estoque/route.ts'
 if "from '@/lib/aurox-veiculo-cadastro'" not in s:
  s=replace_unique(s,"import { variantesBusca } from '@/lib/fuzzy';","import { variantesBusca } from '@/lib/fuzzy';\nimport { getPool } from '@/lib/db';\nimport { prepararVeiculo } from '@/lib/aurox-veiculo-cadastro';",p)
 start=s.find('/** Cadastro manual do veiculo - papéis de gestao, isolado por empresa. */')
 if start<0:start=s.find('/** Cadastro manual de veículo; registro e auditoria na mesma transação')
 if start<0:raise ValueError(f'{p}: trecho de cadastro incompatível')
 fragment=(ASSETS/'estoque_post_base.ts').read_text('utf-8')
 return s[:start]+fragment

def update_profile(s):
 p='app/(dashboard)/minha-conta/page.tsx'
 if "import { CompletarCadastro }" not in s:
  s=replace_unique(s,"import { Lang, LANG_LABELS } from '@/lib/i18n';","import { Lang, LANG_LABELS } from '@/lib/i18n';\nimport { CompletarCadastro } from '@/components/completar-cadastro';",p)
 if '<CompletarCadastro' not in s:
  anchor='    </div>\n  );\n}'
  if anchor not in s:raise ValueError(f'{p}: final da tela não identificado')
  s=s.replace(anchor,'      <CompletarCadastro />\n'+anchor,1)
 # Dados pessoais são mantidos em uma única seção: a nova área de complementação.
 old='        <div><Label>{t(\'account.email\')}</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editLogin} /></div>'
 if old in s:s=s.replace(old,'        <p className="text-xs text-muted-foreground">CPF e e-mail: preencha ou atualize na seção Completar cadastro abaixo.</p>',1)
 s=s.replace('await api.patch(\'/conta\', { telefone, email, nome, idioma });','await api.patch(\'/conta\', { telefone, nome, idioma });')
 return s

def update_login(s):
 if 'href="/recuperar-senha"' in s:return s
 return replace_unique(s,'            </form>','''            </form>
            <div className="mt-4 text-right"><Link href="/recuperar-senha" className="inline-flex rounded-lg border border-violet-300/30 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/10">Esqueci minha senha · Recuperar acesso</Link></div>''','app/login/page.tsx')

def update_user_api(s):
 # Os campos de CPF, nascimento e e-mail são preenchidos pelo titular após o cadastro inicial.
 p='app/api/gestao-usuarios/route.ts'
 if "E-mail válido obrigatório para recuperar senha" in s:
  s=s.replace(" if(!/^\\S+@\\S+\\.\\S+$/.test(email))return NextResponse.json({error:'E-mail válido obrigatório para recuperar senha'},{status:400});\n",'')
 if 'CARGOS_IDENTIDADE.has(cargo)&&(' in s:
  a=s.find(' if(CARGOS_IDENTIDADE.has(cargo)&&(');b=s.find(' if(nome.length<2||',a)
  if a<0 or b<0:raise ValueError(f'{p}: validação de identidade divergente')
  s=s[:a]+s[b:]
 # Quando já houver INSERT V3, não registrar CPF/nascimento no cadastro inicial.
 s=s.replace('CARGOS_IDENTIDADE.has(cargo)?cpf:null,CARGOS_IDENTIDADE.has(cargo)?nascimento:null','null,null')
 return s

def update_followup(s):
 old_sha=sha(s.encode('utf-8'))
 wanted=(P/'app/api/follow-up/route.ts').read_text('utf-8')
 if s==wanted:return s
 if old_sha!=V2_FOLLOW_SHA:raise ValueError('Follow Up API: versão local diferente da V2 auditada; não sobrescrever')
 return wanted

def update_followup_page(s):
 wanted=(P/'app/(dashboard)/follow-up/page.tsx').read_text('utf-8')
 if s==wanted:return s
 if sha(s.encode('utf-8'))!=V2_PAGE_SHA:raise ValueError('Follow Up UI: versão local diferente da V2 auditada; não sobrescrever')
 return wanted

def update_campanhas(s):
 wanted=(P/'app/api/follow-up/campanhas/route.ts').read_text('utf-8')
 if s==wanted:return s
 if sha(s.encode('utf-8'))!=V2_CAMP_SHA:raise ValueError('Campanhas: versão local diferente da V2 auditada')
 return wanted

def update_usuarios_page(s):
 wanted=(P/'app/(dashboard)/gestao-usuarios/page.tsx').read_text('utf-8')
 if s==wanted:return s
 if sha(s.encode('utf-8'))==V2_GESTAO_SHA or ("pedeIdentidade=CARGOS_IDENTIDADE.has(cargo)" in s and "api.post('/gestao-usuarios'" in s):return wanted
 raise ValueError('Gestão de usuários: a versão local foi personalizada; é necessário integrar sem substituir')

PATCH={
 'app/(dashboard)/estoque/page.tsx':update_estoque,
 'app/api/estoque/route.ts':update_estoque_route,
 'app/(dashboard)/minha-conta/page.tsx':update_profile,
 'app/login/page.tsx':update_login,
 'app/api/gestao-usuarios/route.ts':update_user_api,
 'app/api/follow-up/route.ts':update_followup,
 'app/api/follow-up/campanhas/route.ts':update_campanhas,
 'app/(dashboard)/follow-up/page.tsx':update_followup_page,
 'app/(dashboard)/gestao-usuarios/page.tsx':update_usuarios_page,
}
# Novos arquivos ou substituição somente de uma versão V3 auditada.
FORCE_V3={
 'app/(dashboard)/estoque/cadastrar/page.tsx',
 'lib/aurox-veiculo-cadastro.ts',
}

def main():
 a=argparse.ArgumentParser();a.add_argument('projeto',type=Path);a.add_argument('--check',action='store_true');args=a.parse_args();repo=args.projeto.resolve()
 if not (repo/'package.json').exists() or not (repo/'app/api/follow-up/route.ts').exists():
  print('ERRO: projeto MANU com Follow Up V2 não encontrado. Instale V1 e V2 primeiro.');return 2
 changes={};old_files={}
 try:
  for rel,fn in PATCH.items():
   f=repo/rel
   if not f.exists():raise ValueError(f'Arquivo obrigatório ausente: {rel}')
   original=f.read_bytes();before=original.decode('utf-8-sig').replace('\r\n','\n');after=fn(before)
   if after!=before:changes[rel]=after.encode();old_files[rel]=original
  for f in P.rglob('*'):
   if not f.is_file():continue
   rel=f.relative_to(P).as_posix()
   if rel in PATCH:continue
   wanted=f.read_bytes();dest=repo/rel
   if dest.exists():
    original=dest.read_bytes()
    if original==wanted:continue
    if rel not in FORCE_V3:raise ValueError(f'Conflito no arquivo existente: {rel}')
    # versões anteriores V3 permitidas somente com assinatura de código conhecida.
    current=original.decode('utf-8-sig')
    if rel.endswith('estoque/cadastrar/page.tsx') and 'const CARACTERISTICAS = [' not in current:raise ValueError(f'{rel}: versão desconhecida')
    if rel.endswith('aurox-veiculo-cadastro.ts') and 'export const CAMPOS_OPCIONAIS' not in current:raise ValueError(f'{rel}: versão desconhecida')
    old_files[rel]=original
   else:old_files[rel]=None
   changes[rel]=wanted
  for f in ASSETS.rglob('*'):
   if not f.is_file() or f.name=='estoque_post_base.ts':continue
   rel=f.relative_to(ASSETS).as_posix();dest=repo/rel
   if dest.exists():continue
   changes[rel]=f.read_bytes();old_files[rel]=None
  if not changes:
   print('Nenhuma mudança: V4 já instalada.');return 0
  print(f"Pré-validação OK: {len(changes)} arquivos. {'Sem escrita (--check)' if args.check else 'Aplicando com backup'}")
  for name in changes:print('  ',name)
  if args.check:return 0
  backup=repo.parent/(repo.name+'_BACKUP_AUROX_V4_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
  done=[]
  try:
   for rel,before in old_files.items():
    if before is None:continue
    f=backup/rel;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(before)
   for rel,new in changes.items():
    f=repo/rel;f.parent.mkdir(parents=True,exist_ok=True)
    tmp=f.with_name(f.name+'.aurox-v4-tmp');tmp.write_bytes(new);tmp.replace(f);done.append(rel)
  except Exception:
   for rel in reversed(done):
    f=repo/rel;old=old_files.get(rel)
    if old is None:f.unlink(missing_ok=True)
    else:f.write_bytes(old)
   raise
  print('Alterações salvas. Backup:',backup)
  print('AGORA: migrations SQL em homologação, npm run build, testes por empresa, commit e deploy. Nada foi publicado automaticamente.')
  return 0
 except Exception as exc:print('ERRO:',exc,'\nPré-validação interrompida; confira a versão local antes de instalar.');return 1

if __name__=='__main__':raise SystemExit(main())

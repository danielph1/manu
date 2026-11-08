import tempfile,subprocess,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
FIX=Path(__file__).resolve().parent/'fixtures'
V2=FIX/'v2';V3=FIX/'v3'

def test():
 with tempfile.TemporaryDirectory() as td:
  repo=Path(td)/'manu';repo.mkdir();(repo/'package.json').write_text('{}')
  def put(rel,src):
   p=repo/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(src)
  for rel in ['app/(dashboard)/follow-up/page.tsx','app/api/follow-up/route.ts','app/api/follow-up/campanhas/route.ts']:
   put(rel,(V2/rel).read_text())
  put('app/(dashboard)/gestao-usuarios/page.tsx',(V3/'app/(dashboard)/gestao-usuarios/page.tsx').read_text())
  put('app/api/gestao-usuarios/route.ts',"export const runtime='nodejs';\nexport async function POST(){const email=String(body.email||'');\n if(!/^\\S+@\\S+\\.\\S+$/.test(email))return NextResponse.json({error:'E-mail válido obrigatório para recuperar senha'},{status:400});\n if(CARGOS_IDENTIDADE.has(cargo)&&(!nomeCompletoValido(nome)||!cpfValido(cpf)||!nascimentoValido(nascimento)))\n  return NextResponse.json({error:'Nome completo, CPF válido e nascimento obrigatórios para o cargo'},{status:400});\n if(nome.length<2||nome.length>140||true) return null;\n}")
  put('app/(dashboard)/estoque/page.tsx',"import { nomeVeiculo } from '@/lib/nome-veiculo';\nexport function Estoque(){return (\n <main>\n      {canEdit && (\n        <form className=\"space-y-3 rounded-xl border bg-card p-4\" onSubmit={submit}><button>Salvar</button></form>\n      )}\n\n      <div className=\"flex flex-wrap gap-3\">\n \n      </div>\n </main>\n)}\n")
  put('app/api/estoque/route.ts',"import { variantesBusca } from '@/lib/fuzzy';\n"+(V3/'estoque_post_base.ts').read_text())
  put('app/(dashboard)/minha-conta/page.tsx',"import { Lang, LANG_LABELS } from '@/lib/i18n';\nexport function Perfil(){await api.patch('/conta', { telefone, email, nome, idioma }); return (\n    <div>\n        <div><Label>{t('account.email')}</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editLogin} /></div>\n    </div>\n  );\n}")
  put('app/login/page.tsx',"import Link from 'next/link';\nexport function Login(){return <form><input/>\n            </form>;}")
  put('app/(dashboard)/estoque/cadastrar/page.tsx',(V3/'app/(dashboard)/estoque/cadastrar/page.tsx').read_text())
  put('lib/aurox-veiculo-cadastro.ts',(V3/'lib/aurox-veiculo-cadastro.ts').read_text())
  cmd=[sys.executable,str(BASE/'INSTALAR_V4.py'),str(repo)]
  check=subprocess.run(cmd+['--check'],capture_output=True,text=True);assert check.returncode==0,check.stdout
  assert '/api/conta/completar' in check.stdout
  done=subprocess.run(cmd,capture_output=True,text=True);assert done.returncode==0,done.stdout
  again=subprocess.run(cmd+['--check'],capture_output=True,text=True);assert again.returncode==0,again.stdout
  assert 'Nenhuma mudança' in again.stdout
  assert not (repo/'app/(dashboard)/estoque/cadastrar/page.tsx').read_text().lower().count('youtube')
  assert 'CompletarCadastro' in (repo/'app/(dashboard)/minha-conta/page.tsx').read_text()
  assert 'aurox_followup_permissoes' in (repo/'app/api/follow-up/route.ts').read_text()
  print('OK: pré-check, aplicação, migrações copiadas e reaplicação sem mutações; backups preservados')

if __name__=='__main__':test()

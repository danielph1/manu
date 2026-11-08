"""Testes locais de transformação (não testam Supabase nem build Next)."""
from pathlib import Path
import importlib.util, tempfile
P=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',P/'INSTALAR_AUROX_V3.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def test_usuario():
 s="""import { hashPassword } from '@/lib/password';
import { podeCriarCargo, podeGerenciarUsuarios, CARGOS_CADASTRAVEIS } from '@/lib/hierarquia-usuarios';
const inferiores=CARGOS_CADASTRAVEIS.filter(tipo=>podeCriarCargo(actor.tipo,tipo));
const usuarios=empresaId?(await query(`SELECT u.id,u.nome,u.login,u.tipo,u.loja
 FROM public.usuarios u`,[empresaId])).rows:[];
export async function POST(){
 const nome=String(body.nome||'').trim();const login=String(body.login||'').trim().toLowerCase();
 const senha=String(body.senha||'');const cargo=String(body.tipo||'').trim().toLowerCase();
 const loja=String(body.loja||'').trim().toUpperCase();
 if(nome.length<2||nome.length>140||error)return;
  const created=await client.query(`INSERT INTO public.usuarios(nome,login,senha_hash,tipo,loja,empresa_id,vendedor_id,ativo,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,'ativo') RETURNING id,nome,login,tipo,loja,empresa_id,vendedor_id,ativo`,
    [nome,login,hashPassword(senha),cargo,loja,empresaId,vendedorId]);
  await client.query('COMMIT');return NextResponse.json(created.rows[0],{status:201});
}
// Desativar/reativar conta
export async function PATCH(){
 const t=await client.query(`SELECT id,LOWER(TRIM(tipo)) tipo,empresa_id,vendedor_id FROM public.usuarios WHERE id=$1 FOR UPDATE`,[targetId]);
 if(!actor||!alvo||!podeCriarCargo(actor.tipo,alvo.tipo)||Number(actor.id)===targetId || (actor.tipo!=='superadmin'&&Number(actor.empresa_id)!==Number(alvo.empresa_id))){await client.query('ROLLBACK');return DENY();}
  await client.query(`UPDATE public.usuarios SET ativo=$1 WHERE id=$2`,[body.ativo,targetId]);
  await client.query('COMMIT');return NextResponse.json({ok:true});
}
"""
 transformed=mod.amend_usuario_route(s)
 assert 'cpf,data_nascimento' in transformed
 assert 'cpfValido(cpf)' in transformed
 assert 'podeAdministrarConta(actor.tipo,alvo.tipo)' in transformed
 assert "'documento','elfenai'" in transformed
 assert 'aurox_auditoria_alteracoes' in transformed
 return 'usuários'

def test_estoque():
 s="""import { variantesBusca } from '@/lib/fuzzy';
export async function GET() {return null;}
/** Cadastro manual do veiculo - papéis de gestao, isolado por empresa. */
export async function POST() { return null; }
"""
 t=mod.amend_estoque_route(s)
 assert 'prepararVeiculo' in t and 'aurox_detalhes' in t
 assert 'export async function GET()' in t
 assert 'dados.placa){' in t  # só confere duplicidade quando placa existir
 return 'estoque backend'

def test_pagina():
 s="""import { nomeVeiculo } from '@/lib/nome-veiculo';
  const [novoCarro, setNovoCarro] = useState({ marca: '', modelo: '', ano: '', placa: '', preco: '', cor: '', patio: '', empresa_id: '' });
  return (
      {canEdit && (
        <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={()=>{}}>
          <h2>Antigo</h2>
        </form>
      )}

      <div className="flex flex-wrap gap-3">Outro conteúdo</div>
  );
"""
 t=mod.amend_estoque_page(s)
 assert 'href="/estoque/cadastrar"' in t
 assert '<form' not in t and 'novoCarro' not in t
 assert 'Outro conteúdo' in t
 return 'estoque UI'

def test_hierarquia():
 s="""export const NIVEIS: Record<string,number>={
 superadmin: 1,
  vendedor: 4,
};
export const CARGOS_CADASTRAVEIS = ['admin','gerente','marketing','vendedor'] as const;
export function podeGerenciarUsuarios(tipo:string){return true;}
"""
 t=mod.amend_hierarquia(s)
 assert 'documentista: 4' in t and 'documento: 4' in t and 'elfenai: 4' in t
 assert 'podeAdministrarConta' in t
 return 'cargos legados'

def test_preflight():
 with tempfile.TemporaryDirectory() as td:
  p=Path(td);(p/'package.json').write_text('{}');route=p/'app/api/estoque/route.ts';route.parent.mkdir(parents=True)
  route.write_text('// arquivo divergente')
  before=route.read_bytes();result=mod.main([str(p),'--check'])
  assert result!=0 and route.read_bytes()==before
 return 'pré-validação sem escrita'

if __name__=='__main__':
 for f in [test_usuario,test_estoque,test_pagina,test_hierarquia,test_preflight]:print('OK:',f())

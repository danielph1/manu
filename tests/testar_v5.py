import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import INSTALAR_V5 as m
ROOT=Path(__file__).resolve().parents[1]
class TestV5(unittest.TestCase):
 def test_editor_has_only_persisted_common_record(self):
  s=(ROOT/'payload/app/(dashboard)/estoque/cadastrar/page.tsx').read_text()
  for v in ['/estoque/${id}',".get('editar')",'/estoque/fotos','Fotos do veículo','Opcionais','Características','preco_classificados','portais_detalhes','setFotosSalvas','Salvar alterações']:
   self.assertIn(v,s,v)
  self.assertNotIn('Vídeo (YouTube)',s)
  self.assertIn('bottom-24',s)
 def test_stock_button_replace_compact_form(self):
  s="""import { nomeVeiculo } from '@/lib/nome-veiculo';
  const [novoCarro, setNovoCarro] = useState({ marca: '', modelo: '', ano: '', placa: '', preco: '', cor: '', patio: '', empresa_id: '' });
      </header>
      {canEdit && (
        <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={e=>e.preventDefault()}>
        </form>
      )}

      <div className="flex flex-wrap gap-3">
              <div className="flex items-start justify-between">
            {loadingFotos ? (
  """
  t=m.estoque_page(s)
  self.assertIn('Adicionar veículo · cadastro completo',t)
  self.assertIn('Editar ficha completa do veículo',t)
  self.assertIn('Editar veículo</Link>',t)
  self.assertNotIn('<form className="space-y-3 rounded-xl',t)
  self.assertIn("import Link from 'next/link'",t)
 def test_processes_query_cannot_create_transfer(self):
  s="""  // Criação de processos idempotente por empresa, nunca cruza placa de outro locatário.
  if(empresaId)await query(`INSERT INTO public.processos_transferencia (id) SELECT 1`);
  const {rows}=await query(`SELECT p.id
   FROM public.processos_transferencia p
   LEFT JOIN LATERAL (SELECT fat2.* FROM public.faturamentos fat2
     WHERE fat2.empresa_id=p.empresa_id AND
     ((p.ficha_id IS NOT NULL AND fat2.ficha_id=p.ficha_id)
       OR (p.lead_id IS NOT NULL AND fat2.lead_id=p.lead_id)
       OR (COALESCE(p.placa,'')<>'' AND UPPER(REGEXP_REPLACE(COALESCE(fat2.placa,''),'[^A-Z0-9]','','g'))=
        UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))))
     ORDER BY fat2.id DESC LIMIT 1) fat ON TRUE
   `)
  """
  t=m.processos_api(s)
  self.assertNotIn('if(empresaId)await query(',t)
  self.assertIn('p.faturamento_id IS NOT NULL AND fat2.id=p.faturamento_id',t)
  seg=t[t.index('((p.faturamento_id'):t.index('ORDER BY fat2')]
  self.assertEqual(seg.count('('),seg.count(')'))
 def test_office_moves_only_on_ready(self):
  s="""import { notificar } from '@/lib/notify';
    let where = '1=1';
    // estoque
    let estoqueId: number | null = null;
    const est=await queryOne('test');
    const preco=b.valor_carro;
    let recal=false;
    const row = await queryOne(
      `
      INSERT INTO public.oficina_carros (x) VALUES(1)`,[]);
    if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    // pronto vai para o estoque (ativo); anúncio não liga sozinho
    try { await query('fake'); } catch { }
    // sync pátio estoque
    if(b.onde_esta)await query('fake');
    return NextResponse.json(row);
  """
  t=m.oficina_api(s)
  self.assertIn('concluirOficina(u, b)',t)
  self.assertIn('COALESCE(pronto,FALSE)=FALSE',t)
  self.assertNotIn("await query('fake')",t)
  self.assertIn('não insere veículo no estoque antes',t)
 def test_release_uses_invoice_and_tenant(self):
  s=(ROOT/'payload/app/api/faturamento/liberar/route.ts').read_text()
  for v in ['id=$1 AND empresa_id=$2 FOR UPDATE','faturamento_id=$2','auditarAlteracao(db','COMMIT','status_estoque=\'inativo\'']:
   self.assertIn(v,s)
  self.assertNotIn('cria/atualiza processo de transferência com dados do veículo',s)
 def test_api_role_and_company_scoping(self):
  s=(ROOT/'payload/app/api/estoque/[id]/route.ts').read_text()
  for v in ['EDITORES','empresa_id','FOR UPDATE','auditarAlteracao','prepararVeiculo','aurox_detalhes']:
   self.assertIn(v,s)
 def test_version_guard_and_check(self):
  s=(ROOT/'INSTALAR_V5.py').read_text()
  self.assertIn("args.check",s)
  self.assertIn('sha!=expected',s)
  self.assertIn('backup',s)
  self.assertNotIn('/mnt/data/aurox_implementacao_v4',s)
if __name__=='__main__':unittest.main(verbosity=2)

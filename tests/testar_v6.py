import sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import ajustes_v6 as v6
class V6(unittest.TestCase):
 def test_form_company_shared_without_video(self):
  s=v6.change_stock_form((ROOT/'versoes/V5/payload/app/(dashboard)/estoque/cadastrar/page.tsx').read_text())
  self.assertIn('Localização / pátio (opcional)',s)
  self.assertNotIn('Loja responsável *',s)
  self.assertNotIn('if(!dados.patio',s)
  self.assertNotIn('Vídeo (YouTube)',s)
  for text in ['Opcionais','Características','Preço','Fotos do veículo']:
   self.assertIn(text,s)
 def test_edit_company_not_store(self):
  s=v6.change_stock_edit((ROOT/'versoes/V5/payload/app/api/estoque/[id]/route.ts').read_text())
  self.assertIn('empresaId !== numero(a.user.empresa_id)',s)
  self.assertNotIn('Loja não pertence à empresa',s)
  self.assertIn("const patio = String(raw.patio || '').trim().slice(0,100)",s)
 def test_stock_post_ignores_store_filter(self):
  frag=(ROOT/'versoes/V5/assets/estoque_post_v5.ts').read_text()
  base="""    const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
    if (!isSuperAdmin(u)) {
      if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
      params.push(u.empresa_id);
      where += ` AND empresa_id = $${params.length}`;
    }
      if (!isSuperAdmin(u)) {
        if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
        params2.push(u.empresa_id);
        where2 += ` AND empresa_id = $${params2.length}`;
      }
"""
  s=v6.change_stock_post(base+frag)
  self.assertIn('empresaConsulta',s)
  self.assertNotIn('Loja responsável obrigatória',s)
  self.assertNotIn('SELECT codigo FROM public.lojas',s)
  self.assertIn('SELECT id FROM public.empresas',s)
 def test_user_scoping_and_no_company_switch(self):
  role="export function podeGerenciarUsuarios(tipo:string){return ['superadmin','admin','marketing'].includes(String(tipo||'').toLowerCase());}"
  self.assertIn("'documentista'",v6.change_user_roles(role))
  page=(ROOT/'versoes/V4/payload/app/(dashboard)/gestao-usuarios/page.tsx').read_text()
  out=v6.change_user_page(page)
  self.assertIn('opcoes.length>0',out)
  self.assertIn('Apenas superadmin escolhe a empresa',out)
  self.assertIn('isSuper?<label',out)
 def test_followup_v4_bundled(self):
  s=(ROOT/'versoes/V4/payload/app/(dashboard)/follow-up/page.tsx').read_text()
  for word in ["type View='carteira'|'permissoes'|'campanhas'|'historico'", 'salvarConsentimento','criarCampanha']:
   self.assertIn(word,s)
 def test_adverts_selector_no_duplicate_button(self):
  source="""'use client';
  const ok = ['admin', 'marketing', 'superadmin', 'gerente'].includes(tipo);
  const carregar = useCallback(async () => {
        params: { busca, status, ordem, carroceria },
  }, [busca, status, ordem, carroceria]);
  useEffect(() => {
    if (!isLoading && ok) carregar();
  },[ok]);
      <div className="flex flex-wrap gap-2">
        <Link href="/estoque/cadastrar" className="example">Criar veículo no Estoque</Link>
      </div>
      <div className="flex flex-wrap gap-2">
      </div>
"""
  s=v6.change_advert_page(source)
  self.assertIn('Empresa dos anúncios',s)
  self.assertIn('empresa_id:isSuper?empresaVista:undefined',s)
  self.assertIn('<Link href="/estoque/cadastrar" className="example">',s)
 def test_stock_page_explicit_super_company(self):
  source="""import { useMemo, useState } from 'react';
  const canEdit = podeEditarFotos(user?.tipo as string | undefined);
    queryKey: ['estoque', q],
        const r = await api.get('/estoque', { params: { busca: q || undefined } });
      {canEdit&&<div className="flex flex-wrap gap-2">
  """
  s=v6.change_stock_page(source)
  self.assertIn('Empresa do estoque',s)
  self.assertIn('empresa_id: isSuper?empresaVista:undefined',s)
  self.assertIn('enabled: !isSuper||!!empresaVista',s)
 def test_adverts_get_scopes_super(self):
  source="""  if (!isSuperAdmin(u)) {
    if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
    params.push(u.empresa_id);
    where += ` AND empresa_id = $${params.length}`;
  }"""
  s=v6.change_advert_api(source)
  self.assertIn("Number(sp.get('empresa_id'))",s)
  self.assertIn('params.push(empresaConsulta)',s)
if __name__=='__main__':unittest.main(verbosity=2)

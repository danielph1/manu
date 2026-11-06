#!/usr/bin/env python3
"""Aplica v1 do painel com verificações, backup e sem alterar outras rotas.
Uso: python aplicar_desempenho.py C:\\caminho\\para\\manu
"""
from pathlib import Path
import sys, shutil, datetime, os

ROOT=Path(__file__).resolve().parent
SRC=ROOT/'files'
FILES=[
 'lib/desempenho/analise.ts',
 'app/api/desempenho/route.ts',
 'app/(dashboard)/desempenho/page.tsx',
 'tests/desempenho.test.cjs',
 'supabase/migrations/202611060005_desempenho_indices.sql',
]
NAV='components/sidebar-nav.tsx'
MET='app/(dashboard)/metricas/page.tsx'
NAV_NEEDLE="    { href: '/metricas', label: t('nav.metricas'), icon: BarChart3, show: Role.verMetricas(user) || isSuper },"
NAV_ADD="    { href: '/desempenho', label: 'Desempenho', icon: BarChart3, show: ['admin','marketing','gerente','superadmin'].includes(tipo) },"
MET_NEEDLE='      <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={()=>r.refetch()}><RefreshCw size={16}/> Atualizar</button>'
MET_ADD='      <Link href="/desempenho" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">Desempenho por vendedor e origem</Link>\n'


def read(path): return path.read_text(encoding='utf-8')
def main():
    if len(sys.argv)!=2:
        print('Uso: python aplicar_desempenho.py "C:\\pasta\\do\\manu"');return 2
    project=Path(sys.argv[1]).expanduser().resolve()
    if not (project/'package.json').is_file() or not (project/'app').is_dir():
        print('ERRO: pasta informada nao parece ser a raiz do projeto MANU.');return 2
    changes={}
    for rel in FILES:
        file=project/rel
        content=read(SRC/rel)
        if file.exists() and read(file)!=content:
            print(f'ERRO: {rel} ja existe com modificacoes. Backup manual/reconciliacao necessarios.');return 2
        if not file.exists():changes[rel]=content
    for rel in [NAV,MET]:
        if not (project/rel).is_file():
            print(f'ERRO: nao encontrei {rel}. Nada foi modificado.');return 2
    nav=read(project/NAV)
    if "href: '/desempenho'" not in nav:
        if nav.count(NAV_NEEDLE)!=1:
            print('ERRO: sidebar mudou desde a versao auditada. Nenhum arquivo foi alterado.');return 2
        changes[NAV]=nav.replace(NAV_NEEDLE,NAV_NEEDLE+'\n'+NAV_ADD)
    met=read(project/MET)
    if 'href="/desempenho"' not in met:
        if met.count(MET_NEEDLE)!=1:
            print('ERRO: pagina de metricas mudou desde a versao auditada. Nada foi alterado.');return 2
        changed=met.replace(MET_NEEDLE,MET_ADD+MET_NEEDLE)
        if "import Link from 'next/link';" not in changed:
            changed=changed.replace("'use client';","'use client';\nimport Link from 'next/link';",1)
        changes[MET]=changed
    if not changes:
        print('Tudo ja foi aplicado. Nenhuma mudanca necessaria.');return 0
    backup=project/'.aurox-backups'/('desempenho-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,exist_ok=False)
    for rel in changes:
        f=project/rel
        if f.exists():
            dest=backup/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
    # As precondicoes sao validadas antes de escrever; backups de cada arquivo substituido ja existem.
    written=[]
    try:
        for rel,content in changes.items():
            f=project/rel;f.parent.mkdir(parents=True,exist_ok=True)
            temp=f.with_suffix(f.suffix+'.aurox-tmp')
            temp.write_text(content,encoding='utf-8',newline='\n')
            os.replace(temp,f);written.append(rel)
    except Exception as e:
        print('Falha durante a escrita:',e,'\nBackup em:',backup)
        for rel in reversed(written):
            f=project/rel;b=backup/rel
            if b.exists():shutil.copy2(b,f)
            elif f.exists():f.unlink()
        return 1
    print('Instalado com sucesso:',len(written),'arquivos. Backup:',backup)
    print('Proximos passos: node --test tests/desempenho.test.cjs ; npx tsc --noEmit ; npm run build ; homologacao ; git commit/push')
    return 0
if __name__=='__main__':raise SystemExit(main())

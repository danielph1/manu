#!/usr/bin/env python3
"""AUROX: padroniza 10s de triagem e reconfigura conexões serverless.

Executar com Python 3.9+. Valida todos os arquivos primeiro, cria backup antes
 de escrever. Aceita tanto o MANU antigo quanto o hotfix triagem 10s anterior.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

from aplicar_triagem_10s import prepare as preparar_triagem, MODULE, CRON

HERE = Path(__file__).resolve().parent
DB_PATH = 'lib/db.ts'
PACKAGE_PATH = 'package.json'
ORIGINAL_DB_BLOB_SHA = 'f68c252c4c2556cfdd565ff0457036adb373cf02'


def blob_sha(text: str) -> str:
    raw = text.encode('utf-8')
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise ValueError(f'{label}: esperado exatamente um trecho, encontrados {n}. Nada foi alterado.')
    return text.replace(old, new)


def garantias_empresa(helper: str) -> str:
    """Persistir tenant real do vendedor na transação de triagem (nunca cross-tenant)."""
    sql_old = '''(nome_lead,telefone,email,produto_interesse,observacao,vendedor_id,data_lead,atribuido_em,rotacionar)
       VALUES($1,$2,$3,$4,$5,$6,now(),now(),TRUE) RETURNING id'''
    sql_new = '''(nome_lead,telefone,email,produto_interesse,observacao,vendedor_id,data_lead,atribuido_em,rotacionar,empresa_id)
       VALUES($1,$2,$3,$4,$5,$6,now(),now(),TRUE,$7) RETURNING id'''
    old_args = '''[t.nome,t.telefone,t.email,t.interesse,`[${t.origem}] ${t.mensagem||''}`.trim(),vendedorId],'''
    new_args = '''[t.nome,t.telefone,t.email,t.interesse,`[${t.origem}] ${t.mensagem||''}`.trim(),vendedorId,Number(v.empresa_id)],'''
    if sql_new in helper and new_args in helper:
        return helper
    helper = replace_exact(helper, sql_old, sql_new, 'Vínculo de empresa no INSERT de leads')
    helper = replace_exact(helper, old_args, new_args, 'Vínculo de empresa no parâmetro de leads')
    return helper


def preparar(root: Path) -> dict[str, str]:
    if not (root/'package.json').is_file() or not (root/'app/api/triagem/route.ts').is_file():
        raise ValueError('Diretório não parece ser a raiz do MANU (package.json e triagem ausentes).')
    db_path = root/DB_PATH
    if not db_path.is_file():
        raise FileNotFoundError(f'Arquivo obrigatório ausente: {db_path}')
    atual = db_path.read_text(encoding='utf-8-sig')
    novo = (HERE/'lib_db_novo.ts').read_text(encoding='utf-8')
    edits: dict[str, str] = {}
    if atual != novo:
        if blob_sha(atual) != ORIGINAL_DB_BLOB_SHA:
            raise ValueError(
                'lib/db.ts difere da versão auditada do GitHub. '
                'Instalação interrompida por segurança. Envie o arquivo atual para atualizar a correção sem perder mudanças.'
            )
        edits[DB_PATH] = novo

    modulo_existe = (root/MODULE).exists()
    cron_existe = (root/CRON).exists()
    if modulo_existe != cron_existe:
        raise ValueError('Triagem parcialmente instalada (helper ou cron ausente). Nenhum arquivo será sobrescrito.')

    if modulo_existe:
        helper = (root/MODULE).read_text(encoding='utf-8-sig')
        cron = (root/CRON).read_text(encoding='utf-8-sig')
        worker = (root/'workers/aurox-whatsapp/push-dispatcher.mjs').read_text(encoding='utf-8-sig')
        rota = (root/'app/api/triagem/route.ts').read_text(encoding='utf-8-sig')
        if not all([
            "interval '10 seconds'" in helper,
            "interval '10 minutes'" not in helper,
            'export async function expirar' in helper,
            'export async function virarLead' in helper,
            'await expirar(null,true)' in cron,
            'triagemTick' in worker,
            'import { expirar, virarLead }' in rota,
        ]):
            raise ValueError('Hotfix de triagem existente é incompatível; não foi sobrescrito.')
        atualizado = garantias_empresa(helper)
        if atualizado != helper:
            edits[MODULE] = atualizado
    else:
        triagem = preparar_triagem(root)
        triagem[MODULE] = garantias_empresa(triagem[MODULE])
        edits.update({p:s for p,s in triagem.items() if not (root/p).exists() or (root/p).read_text(encoding='utf-8-sig')!=s})

    # Declara dependência oficial do lifecycle da Vercel. Yarn lock deve ser
    # regenerado pelo usuário com yarn install; não envia um lock inventado.
    package_path = root/PACKAGE_PATH
    package_text = package_path.read_text(encoding='utf-8-sig')
    import json
    try:
        package_obj = json.loads(package_text)
    except json.JSONDecodeError as e:
        raise ValueError(f'package.json inválido: {e}')
    deps = package_obj.get('dependencies')
    if not isinstance(deps, dict):
        raise ValueError('package.json sem dependencies; instalação interrompida')
    current = deps.get('@vercel/functions')
    if current not in (None, '3.11.0'):
        raise ValueError('Versão local de @vercel/functions difere da auditada; revisão manual necessária')
    if current is None:
        import re
        hit = re.search(r'"dependencies"\s*:\s*\{', package_text)
        if not hit:
            raise ValueError('package.json sem bloco dependencies editável')
        package_new = package_text[:hit.end()]+'\n    "@vercel/functions": "3.11.0",'+package_text[hit.end():]
        json.loads(package_new)  # valida antes de gravar
        edits[PACKAGE_PATH] = package_new

    # Script opcional para conferir 20 consultas simultâneas no ambiente de teste.
    test_path='scripts/testar-pool-20.mjs'
    test_code=(HERE/'TESTAR_20_CONCORRENTES.mjs').read_text(encoding='utf-8')
    test_target=root/test_path
    if test_target.is_file():
        if test_target.read_text(encoding='utf-8-sig')!=test_code:
            raise ValueError('O teste scripts/testar-pool-20.mjs existe com outro conteúdo. Pare e revise.')
    else:
        edits[test_path]=test_code

    for p, text in edits.items():
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f'Conteúdo inválido gerado para {p}')
    return edits


def instalar(root: Path, check: bool) -> None:
    edits = preparar(root)
    if not edits:
        print('Já está atualizado. Nenhum arquivo precisa mudar.');return
    print('Alterações planejadas:')
    for p in sorted(edits):print(' -',p)
    if check:
        print('\nCHECK OK — nenhum arquivo foi alterado. Confira as variáveis do Supabase antes do deploy.')
        return

    stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = root/'.manu-backups'/('triagem-pooler-'+stamp)
    existing = [p for p in edits if (root/p).exists()]
    written=[]
    try:
        for p in existing:
            source=root/p; target=backup/p
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
        for p, content in edits.items():
            target=root/p
            target.parent.mkdir(parents=True,exist_ok=True)
            fd, tmp=tempfile.mkstemp(prefix='.aurox-new-',dir=target.parent)
            try:
                with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as f:f.write(content)
                os.replace(tmp,target)
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
            written.append(p)
    except Exception:
        for p in written:
            if p in existing:shutil.copy2(backup/p,root/p)
            else:(root/p).unlink(missing_ok=True)
        raise
    print('\nINSTALAÇÃO LOCAL OK. Backup:',backup)
    print('ATENÇÃO: antes do deploy, configure DATABASE_POOLER_URL da porta 6543 na Vercel.')
    print('Execute yarn install (atualize yarn.lock), npx tsc --noEmit, npm run build e reinicie o worker.')


if __name__=='__main__':
    if len(sys.argv) not in (2,3) or (len(sys.argv)==3 and sys.argv[2]!='--check'):
        print('Uso: py -3 INSTALAR_AUROX_TRIAGEM_POOL.py "C:\\manuSiteOficialOriginal" [--check]')
        sys.exit(2)
    try:
        instalar(Path(sys.argv[1]).expanduser().resolve(),check=len(sys.argv)==3)
    except Exception as e:
        print('INSTALAÇÃO INTERROMPIDA:',e)
        sys.exit(1)

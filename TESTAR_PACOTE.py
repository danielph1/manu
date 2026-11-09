#!/usr/bin/env python3
"""Testes locais sem acessar Supabase, Vercel ou segredos reais."""
import ast
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
from INSTALAR_AUROX_TRIAGEM_POOL import preparar, instalar, blob_sha, ORIGINAL_DB_BLOB_SHA, MODULE, CRON

HERE=Path(__file__).parent
src=ast.parse((HERE/'testar_triagem_original.py').read_text(encoding='utf8'))
fixtures=None
for node in ast.walk(src):
 if isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='fixtures' for x in node.targets):
  fixtures=ast.literal_eval(node.value)
  break
assert fixtures and len(fixtures)>=6
# O fixture antigo era propositalmente mínimo. Adiciona apenas o trecho SQL
# real usado para testar a persistência de empresa_id sem banco em execução.
route=fixtures['app/api/triagem/route.ts']
route=route.replace('  return triagemId;', """  const {rows:[lead]}=await client.query(
      `INSERT INTO public.leads
        (nome_lead,telefone,email,produto_interesse,observacao,vendedor_id,data_lead,atribuido_em,rotacionar)
       VALUES($1,$2,$3,$4,$5,$6,now(),now(),TRUE) RETURNING id`,
      [t.nome,t.telefone,t.email,t.interesse,`[${t.origem}] ${t.mensagem||''}`.trim(),vendedorId],
    );
  return Number(lead.id);""")
fixtures['app/api/triagem/route.ts']=route
assert blob_sha((HERE/'test_fixture_db_original.ts').read_text(encoding='utf8'))==ORIGINAL_DB_BLOB_SHA

with TemporaryDirectory() as d:
 root=Path(d)
 for p,content in fixtures.items():
  f=root/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(content,encoding='utf8')
 (root/'package.json').write_text('{"name":"manu-fixture","dependencies":{"pg":"^8.23.1"}}')
 db=root/'lib/db.ts';db.parent.mkdir(parents=True,exist_ok=True);db.write_text((HERE/'test_fixture_db_original.ts').read_text(encoding='utf8'),encoding='utf8')
 edits=preparar(root)
 assert len(edits)>=8,edits.keys()
 assert "interval '10 seconds'" in edits[MODULE]
 assert "interval '10 minutes'" not in edits[MODULE]
 assert "interval '1 minute'" not in edits[MODULE]
 assert 'rotacionar,empresa_id)' in edits[MODULE]
 assert 'Number(v.empresa_id)' in edits[MODULE]
 assert 'triagemTick' in edits['workers/aurox-whatsapp/push-dispatcher.mjs']
 assert 'PUSH_DISPATCH_SECRET' in edits[CRON]
 assert 'DATABASE_POOLER_URL' in edits['lib/db.ts']
 assert 'max: limite(\'PG_POOL_MAX\', 2, 1, 4)' in edits['lib/db.ts']
 assert 'idleTimeoutMillis: limite' in edits['lib/db.ts']
 assert 'allowExitOnIdle: true' in edits['lib/db.ts']
 assert 'attachDatabasePool(pool)' in edits['lib/db.ts']
 assert '"@vercel/functions": "3.11.0"' in edits['package.json']
 for p,content in edits.items():
  f=root/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(content,encoding='utf8')
 # Novo pacote detecta os arquivos já atualizados.
 assert preparar(root)=={}
 # Não sobrescreve mudanças alheias no módulo de conexão.
 db.write_text('const editado=true;')
 try: preparar(root)
 except ValueError as ex:assert 'lib/db.ts difere' in str(ex)
 else:raise AssertionError('Aceitou substituir alteração incompatível')
 db.write_text((HERE/'lib_db_novo.ts').read_text(encoding='utf8'))
 assert preparar(root)=={}
 subprocess.run(['node','--check',str(root/'workers/aurox-whatsapp/push-dispatcher.mjs')],check=True)
 # Transpila TS (sintaxe) sem exigir dependências do app.
 test=HERE/'verificar_sintaxe.cjs'
 subprocess.run(['node',str(test),str(root/'lib/db.ts'),str(root/MODULE),str(root/CRON),str(root/'app/api/triagem/route.ts')],check=True)
 print('PASSOU: 10s, cron, worker, empresa, pool max2, idle 5s, attachDatabasePool, bloqueio de sobrescrita')

subprocess.run(['node',str(HERE/'TESTAR_DB_POOL.cjs')],check=True)
print('TODOS OS TESTES LOCAIS PASSARAM')

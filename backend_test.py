#!/usr/bin/env python3
"""
Backend API Test Suite for Project Manu
Tests all backend endpoints with RBAC validation
"""
import requests
import json
import sys
from typing import Optional, Dict, Any

# Base URL from .env
BASE_URL = "https://rest-client-nextjs.preview.emergentagent.com/api"

# Test credentials
VENDEDOR_1 = {"login": "armando", "senha": "123456"}  # vendedor_id=2, loja=381
VENDEDOR_2 = {"login": "fred", "senha": "123456"}     # vendedor_id=11, loja=381

# Global state
tokens = {}
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(name: str, passed: bool, message: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if message:
        print(f"   {message}")
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {message}")

def test_login():
    """Test 1: POST /api/auth/login"""
    print("\n=== Testing POST /api/auth/login ===")
    
    # Test 1.1: Valid login - armando
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=VENDEDOR_1, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "access_token" in data and "user" in data:
                tokens["armando"] = data["access_token"]
                user = data["user"]
                if user.get("vendedor_id") == 2 and user.get("loja") == "381":
                    log_test("Login armando válido", True, f"Token recebido, vendedor_id=2, loja=381")
                else:
                    log_test("Login armando válido", False, f"Dados incorretos: {user}")
            else:
                log_test("Login armando válido", False, f"Resposta sem token/user: {data}")
        else:
            log_test("Login armando válido", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("Login armando válido", False, f"Erro: {str(e)}")
    
    # Test 1.2: Valid login - fred
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=VENDEDOR_2, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "access_token" in data:
                tokens["fred"] = data["access_token"]
                log_test("Login fred válido", True, "Token recebido")
            else:
                log_test("Login fred válido", False, f"Resposta sem token: {data}")
        else:
            log_test("Login fred válido", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("Login fred válido", False, f"Erro: {str(e)}")
    
    # Test 1.3: Invalid login - wrong password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"login": "armando", "senha": "wrongpass"}, timeout=10)
        if resp.status_code == 401:
            log_test("Login senha errada retorna 401", True)
        else:
            log_test("Login senha errada retorna 401", False, f"Status {resp.status_code} (esperado 401)")
    except Exception as e:
        log_test("Login senha errada retorna 401", False, f"Erro: {str(e)}")
    
    # Test 1.4: Invalid login - user not found
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"login": "usuarioinexistente", "senha": "123456"}, timeout=10)
        if resp.status_code == 401:
            log_test("Login usuário inexistente retorna 401", True)
        else:
            log_test("Login usuário inexistente retorna 401", False, f"Status {resp.status_code} (esperado 401)")
    except Exception as e:
        log_test("Login usuário inexistente retorna 401", False, f"Erro: {str(e)}")
    
    # Test 1.5: Missing password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={"login": "armando"}, timeout=10)
        if resp.status_code in [400, 401]:
            log_test("Login sem senha retorna erro", True, f"Status {resp.status_code}")
        else:
            log_test("Login sem senha retorna erro", False, f"Status {resp.status_code} (esperado 400/401)")
    except Exception as e:
        log_test("Login sem senha retorna erro", False, f"Erro: {str(e)}")

def test_auth_me():
    """Test 2: GET /api/auth/me"""
    print("\n=== Testing GET /api/auth/me ===")
    
    # Test 2.1: Without token
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        if resp.status_code == 401:
            log_test("GET /auth/me sem token retorna 401", True)
        else:
            log_test("GET /auth/me sem token retorna 401", False, f"Status {resp.status_code} (esperado 401)")
    except Exception as e:
        log_test("GET /auth/me sem token retorna 401", False, f"Erro: {str(e)}")
    
    # Test 2.2: With valid token
    if "armando" in tokens:
        try:
            headers = {"Authorization": f"Bearer {tokens['armando']}"}
            resp = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("login") == "armando":
                    log_test("GET /auth/me com token válido", True, f"User: {data.get('login')}")
                else:
                    log_test("GET /auth/me com token válido", False, f"Dados incorretos: {data}")
            else:
                log_test("GET /auth/me com token válido", False, f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            log_test("GET /auth/me com token válido", False, f"Erro: {str(e)}")

def test_leads_rbac():
    """Test 3: GET /api/leads with RBAC"""
    print("\n=== Testing GET /api/leads (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("GET /api/leads RBAC", False, "Token armando não disponível")
        return
    
    # Test 3.1: Vendedor sees only own leads
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads", headers=headers, timeout=10)
        if resp.status_code == 200:
            leads = resp.json()
            if isinstance(leads, list):
                # Check all leads have vendedor_id=2
                wrong_leads = [l for l in leads if l.get("vendedor_id") != 2]
                if len(wrong_leads) == 0:
                    log_test("Vendedor armando vê apenas leads próprios", True, f"Total: {len(leads)} leads, todos com vendedor_id=2")
                else:
                    log_test("Vendedor armando vê apenas leads próprios", False, f"Encontrados {len(wrong_leads)} leads de outros vendedores")
            else:
                log_test("Vendedor armando vê apenas leads próprios", False, f"Resposta não é array: {type(leads)}")
        else:
            log_test("Vendedor armando vê apenas leads próprios", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("Vendedor armando vê apenas leads próprios", False, f"Erro: {str(e)}")
    
    # Test 3.2: Query params - filtro
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads?filtro=todos", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("GET /api/leads?filtro=todos", True)
        else:
            log_test("GET /api/leads?filtro=todos", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /api/leads?filtro=todos", False, f"Erro: {str(e)}")
    
    # Test 3.3: Query params - periodo
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads?periodo=semana", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("GET /api/leads?periodo=semana", True)
        else:
            log_test("GET /api/leads?periodo=semana", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /api/leads?periodo=semana", False, f"Erro: {str(e)}")
    
    # Test 3.4: Query params - busca
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads?busca=silva", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_test("GET /api/leads?busca=silva", True)
        else:
            log_test("GET /api/leads?busca=silva", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /api/leads?busca=silva", False, f"Erro: {str(e)}")

def test_leads_stats():
    """Test 4: GET /api/leads/stats"""
    print("\n=== Testing GET /api/leads/stats ===")
    
    if "armando" not in tokens:
        log_test("GET /api/leads/stats", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads/stats", headers=headers, timeout=10)
        if resp.status_code == 200:
            stats = resp.json()
            required_fields = ["total_leads", "responderam", "fichas_geradas", "aprovados", "vendidos"]
            missing = [f for f in required_fields if f not in stats]
            if len(missing) == 0:
                log_test("GET /api/leads/stats retorna campos corretos", True, f"Stats: {stats}")
            else:
                log_test("GET /api/leads/stats retorna campos corretos", False, f"Campos faltando: {missing}")
        else:
            log_test("GET /api/leads/stats", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("GET /api/leads/stats", False, f"Erro: {str(e)}")

def test_leads_individual():
    """Test 5: GET /api/leads/:id"""
    print("\n=== Testing GET /api/leads/:id ===")
    
    if "armando" not in tokens:
        log_test("GET /api/leads/:id", False, "Token armando não disponível")
        return
    
    # First get a lead ID
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads?limit=1", headers=headers, timeout=10)
        if resp.status_code == 200:
            leads = resp.json()
            if len(leads) > 0:
                lead_id = leads[0]["id"]
                # Now get individual lead
                resp2 = requests.get(f"{BASE_URL}/leads/{lead_id}", headers=headers, timeout=10)
                if resp2.status_code == 200:
                    lead = resp2.json()
                    if lead.get("id") == lead_id:
                        log_test("GET /api/leads/:id retorna lead correto", True, f"Lead ID: {lead_id}")
                    else:
                        log_test("GET /api/leads/:id retorna lead correto", False, f"ID não corresponde")
                else:
                    log_test("GET /api/leads/:id", False, f"Status {resp2.status_code}")
            else:
                log_test("GET /api/leads/:id", False, "Nenhum lead disponível para teste")
        else:
            log_test("GET /api/leads/:id", False, f"Erro ao buscar leads: {resp.status_code}")
    except Exception as e:
        log_test("GET /api/leads/:id", False, f"Erro: {str(e)}")

def test_leads_update_rbac():
    """Test 6: PUT /api/leads/:id with RBAC"""
    print("\n=== Testing PUT /api/leads/:id (RBAC) ===")
    
    if "armando" not in tokens or "fred" not in tokens:
        log_test("PUT /api/leads/:id RBAC", False, "Tokens não disponíveis")
        return
    
    # Get a lead from armando
    try:
        headers_armando = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/leads?limit=1", headers=headers_armando, timeout=10)
        if resp.status_code == 200:
            leads = resp.json()
            if len(leads) > 0:
                lead_id = leads[0]["id"]
                
                # Test 6.1: Armando can edit own lead
                update_data = {"observacao": "Teste de edição pelo próprio vendedor"}
                resp2 = requests.put(f"{BASE_URL}/leads/{lead_id}", headers=headers_armando, json=update_data, timeout=10)
                if resp2.status_code == 200:
                    log_test("Vendedor edita lead próprio (200 OK)", True)
                else:
                    log_test("Vendedor edita lead próprio (200 OK)", False, f"Status {resp2.status_code}: {resp2.text}")
                
                # Test 6.2: Fred cannot edit armando's lead
                headers_fred = {"Authorization": f"Bearer {tokens['fred']}"}
                resp3 = requests.put(f"{BASE_URL}/leads/{lead_id}", headers=headers_fred, json=update_data, timeout=10)
                if resp3.status_code == 403:
                    log_test("Vendedor NÃO edita lead de outro (403)", True)
                else:
                    log_test("Vendedor NÃO edita lead de outro (403)", False, f"Status {resp3.status_code} (esperado 403)")
            else:
                log_test("PUT /api/leads/:id RBAC", False, "Nenhum lead disponível")
        else:
            log_test("PUT /api/leads/:id RBAC", False, f"Erro ao buscar leads: {resp.status_code}")
    except Exception as e:
        log_test("PUT /api/leads/:id RBAC", False, f"Erro: {str(e)}")

def test_leads_gerou_ficha():
    """Test 7: PUT /api/leads/:id with gerou_ficha=true creates ficha"""
    print("\n=== Testing PUT /api/leads/:id (gerou_ficha=true) ===")
    
    if "armando" not in tokens:
        log_test("gerou_ficha cria ficha_credito", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        
        # Create a new lead first
        new_lead = {
            "nome_lead": "João Silva Teste Ficha",
            "telefone": "11999887766",
            "cpf": "12345678901",
            "produto_interesse": "Carro Teste",
            "gerou_ficha": False
        }
        resp = requests.post(f"{BASE_URL}/leads", headers=headers, json=new_lead, timeout=10)
        if resp.status_code == 200:
            lead = resp.json()
            lead_id = lead["id"]
            
            # Now update to gerou_ficha=true
            resp2 = requests.put(f"{BASE_URL}/leads/{lead_id}", headers=headers, json={"gerou_ficha": True}, timeout=10)
            if resp2.status_code == 200:
                # Check if ficha was created
                resp3 = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=10)
                if resp3.status_code == 200:
                    fichas = resp3.json()
                    ficha_created = any(f.get("lead_id") == lead_id for f in fichas)
                    if ficha_created:
                        log_test("gerou_ficha=true cria registro em fichas_credito", True, f"Lead ID: {lead_id}")
                    else:
                        log_test("gerou_ficha=true cria registro em fichas_credito", False, f"Ficha não encontrada para lead {lead_id}")
                else:
                    log_test("gerou_ficha=true cria registro em fichas_credito", False, f"Erro ao buscar fichas: {resp3.status_code}")
            else:
                log_test("gerou_ficha=true cria registro em fichas_credito", False, f"Erro ao atualizar lead: {resp2.status_code}")
        else:
            log_test("gerou_ficha=true cria registro em fichas_credito", False, f"Erro ao criar lead: {resp.status_code}")
    except Exception as e:
        log_test("gerou_ficha=true cria registro em fichas_credito", False, f"Erro: {str(e)}")

def test_leads_delete_rbac():
    """Test 8: DELETE /api/leads/:id (only gerente/admin)"""
    print("\n=== Testing DELETE /api/leads/:id (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("DELETE /api/leads/:id RBAC", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        
        # Create a lead to delete
        new_lead = {
            "nome_lead": "Lead para Deletar",
            "telefone": "11999887766"
        }
        resp = requests.post(f"{BASE_URL}/leads", headers=headers, json=new_lead, timeout=10)
        if resp.status_code == 200:
            lead = resp.json()
            lead_id = lead["id"]
            
            # Try to delete as vendedor (should fail)
            resp2 = requests.delete(f"{BASE_URL}/leads/{lead_id}", headers=headers, timeout=10)
            if resp2.status_code == 403:
                log_test("Vendedor NÃO pode deletar lead (403)", True)
            else:
                log_test("Vendedor NÃO pode deletar lead (403)", False, f"Status {resp2.status_code} (esperado 403)")
        else:
            log_test("DELETE /api/leads/:id RBAC", False, f"Erro ao criar lead: {resp.status_code}")
    except Exception as e:
        log_test("DELETE /api/leads/:id RBAC", False, f"Erro: {str(e)}")

def test_fichas_rbac():
    """Test 9: GET /api/fichas with RBAC"""
    print("\n=== Testing GET /api/fichas (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("GET /api/fichas RBAC", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=10)
        if resp.status_code == 200:
            fichas = resp.json()
            if isinstance(fichas, list):
                # Check all fichas have vendedor_id=2
                wrong_fichas = [f for f in fichas if f.get("vendedor_id") != 2]
                if len(wrong_fichas) == 0:
                    log_test("Vendedor vê apenas fichas próprias", True, f"Total: {len(fichas)} fichas")
                else:
                    log_test("Vendedor vê apenas fichas próprias", False, f"Encontradas {len(wrong_fichas)} fichas de outros vendedores")
                
                # Check response includes derived fields
                if len(fichas) > 0:
                    first = fichas[0]
                    has_fields = all(k in first for k in ["lead_nome", "em_loja", "comprou", "bancos"])
                    if has_fields:
                        log_test("GET /api/fichas inclui campos derivados", True, "lead_nome, em_loja, comprou, bancos")
                    else:
                        log_test("GET /api/fichas inclui campos derivados", False, f"Campos faltando em: {first.keys()}")
            else:
                log_test("GET /api/fichas RBAC", False, f"Resposta não é array: {type(fichas)}")
        else:
            log_test("GET /api/fichas RBAC", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("GET /api/fichas RBAC", False, f"Erro: {str(e)}")

def test_fichas_individual():
    """Test 10: GET /api/fichas/:id"""
    print("\n=== Testing GET /api/fichas/:id ===")
    
    if "armando" not in tokens:
        log_test("GET /api/fichas/:id", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=10)
        if resp.status_code == 200:
            fichas = resp.json()
            if len(fichas) > 0:
                ficha_id = fichas[0]["id"]
                resp2 = requests.get(f"{BASE_URL}/fichas/{ficha_id}", headers=headers, timeout=10)
                if resp2.status_code == 200:
                    ficha = resp2.json()
                    has_relations = "lead" in ficha and "bancos" in ficha and "avalistas" in ficha
                    if has_relations:
                        log_test("GET /api/fichas/:id inclui lead+bancos+avalistas", True)
                    else:
                        log_test("GET /api/fichas/:id inclui lead+bancos+avalistas", False, f"Campos faltando: {ficha.keys()}")
                else:
                    log_test("GET /api/fichas/:id", False, f"Status {resp2.status_code}")
            else:
                log_test("GET /api/fichas/:id", False, "Nenhuma ficha disponível")
        else:
            log_test("GET /api/fichas/:id", False, f"Erro ao buscar fichas: {resp.status_code}")
    except Exception as e:
        log_test("GET /api/fichas/:id", False, f"Erro: {str(e)}")

def test_fichas_update_rbac():
    """Test 11: PUT /api/fichas/:id (only elfenai/gerente/admin)"""
    print("\n=== Testing PUT /api/fichas/:id (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("PUT /api/fichas/:id RBAC", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=10)
        if resp.status_code == 200:
            fichas = resp.json()
            if len(fichas) > 0:
                ficha_id = fichas[0]["id"]
                update_data = {"status_geral": "pendente"}
                resp2 = requests.put(f"{BASE_URL}/fichas/{ficha_id}", headers=headers, json=update_data, timeout=10)
                if resp2.status_code == 403:
                    log_test("Vendedor NÃO pode editar ficha (403)", True)
                else:
                    log_test("Vendedor NÃO pode editar ficha (403)", False, f"Status {resp2.status_code} (esperado 403)")
            else:
                log_test("PUT /api/fichas/:id RBAC", False, "Nenhuma ficha disponível")
        else:
            log_test("PUT /api/fichas/:id RBAC", False, f"Erro ao buscar fichas: {resp.status_code}")
    except Exception as e:
        log_test("PUT /api/fichas/:id RBAC", False, f"Erro: {str(e)}")

def test_metricas_rbac():
    """Test 12: GET /api/metricas (only gerente/admin)"""
    print("\n=== Testing GET /api/metricas (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("GET /api/metricas RBAC", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/metricas", headers=headers, timeout=10)
        if resp.status_code == 403:
            log_test("Vendedor NÃO acessa métricas (403)", True)
        else:
            log_test("Vendedor NÃO acessa métricas (403)", False, f"Status {resp.status_code} (esperado 403)")
    except Exception as e:
        log_test("GET /api/metricas RBAC", False, f"Erro: {str(e)}")

def test_documental():
    """Test 13: GET /api/documental"""
    print("\n=== Testing GET /api/documental ===")
    
    if "armando" not in tokens:
        log_test("GET /api/documental", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/documental", headers=headers, timeout=10)
        if resp.status_code == 200:
            docs = resp.json()
            if isinstance(docs, list):
                log_test("GET /api/documental retorna lista", True, f"Total: {len(docs)} documentos")
                # Vendedor should only see own
                if len(docs) > 0:
                    wrong_docs = [d for d in docs if d.get("vendedor_id") != 2]
                    if len(wrong_docs) == 0:
                        log_test("Vendedor vê apenas documentos próprios", True)
                    else:
                        log_test("Vendedor vê apenas documentos próprios", False, f"Encontrados {len(wrong_docs)} de outros vendedores")
            else:
                log_test("GET /api/documental", False, f"Resposta não é array: {type(docs)}")
        else:
            log_test("GET /api/documental", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("GET /api/documental", False, f"Erro: {str(e)}")

def test_documental_toggle_rbac():
    """Test 14: POST /api/documental/toggle (only gerente/documento)"""
    print("\n=== Testing POST /api/documental/toggle (RBAC) ===")
    
    if "armando" not in tokens:
        log_test("POST /api/documental/toggle RBAC", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        toggle_data = {
            "ficha_id": 1,
            "field": "gravame",
            "value": True
        }
        resp = requests.post(f"{BASE_URL}/documental/toggle", headers=headers, json=toggle_data, timeout=10)
        if resp.status_code == 403:
            log_test("Vendedor NÃO pode toggle documental (403)", True)
        else:
            log_test("Vendedor NÃO pode toggle documental (403)", False, f"Status {resp.status_code} (esperado 403)")
    except Exception as e:
        log_test("POST /api/documental/toggle RBAC", False, f"Erro: {str(e)}")

def test_vendedores():
    """Test 15: GET /api/vendedores"""
    print("\n=== Testing GET /api/vendedores ===")
    
    if "armando" not in tokens:
        log_test("GET /api/vendedores", False, "Token armando não disponível")
        return
    
    try:
        headers = {"Authorization": f"Bearer {tokens['armando']}"}
        resp = requests.get(f"{BASE_URL}/vendedores", headers=headers, timeout=10)
        if resp.status_code == 200:
            vendedores = resp.json()
            if isinstance(vendedores, list):
                log_test("GET /api/vendedores retorna lista", True, f"Total: {len(vendedores)} vendedores")
            else:
                log_test("GET /api/vendedores", False, f"Resposta não é array: {type(vendedores)}")
        else:
            log_test("GET /api/vendedores", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("GET /api/vendedores", False, f"Erro: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("RESUMO DOS TESTES")
    print("="*60)
    print(f"✅ Passou: {test_results['passed']}")
    print(f"❌ Falhou: {test_results['failed']}")
    print(f"Total: {test_results['passed'] + test_results['failed']}")
    
    if test_results['errors']:
        print("\n❌ ERROS ENCONTRADOS:")
        for error in test_results['errors']:
            print(f"  - {error}")
    
    print("="*60)
    
    # Return exit code
    return 0 if test_results['failed'] == 0 else 1

def main():
    """Run all tests"""
    print("="*60)
    print("INICIANDO TESTES DO BACKEND - PROJECT MANU")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Credenciais: armando/123456, fred/123456")
    print("="*60)
    
    # Run tests in order
    test_login()
    test_auth_me()
    test_leads_rbac()
    test_leads_stats()
    test_leads_individual()
    test_leads_update_rbac()
    test_leads_gerou_ficha()
    test_leads_delete_rbac()
    test_fichas_rbac()
    test_fichas_individual()
    test_fichas_update_rbac()
    test_metricas_rbac()
    test_documental()
    test_documental_toggle_rbac()
    test_vendedores()
    
    # Print summary
    exit_code = print_summary()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()

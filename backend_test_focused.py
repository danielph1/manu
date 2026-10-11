#!/usr/bin/env python3
"""
Focused Backend API Test - Tests critical endpoints with delays to avoid server overload
"""
import requests
import json
import time

BASE_URL = "https://rest-client-nextjs.preview.emergentagent.com/api"
VENDEDOR_1 = {"login": "armando", "senha": "123456"}

def test_with_delay(name, func, delay=2):
    """Run test with delay"""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print('='*60)
    try:
        result = func()
        time.sleep(delay)
        return result
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        time.sleep(delay)
        return False

def test_login():
    """Test login and get token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json=VENDEDOR_1, timeout=15)
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Login successful - vendedor_id: {data['user'].get('vendedor_id')}")
        return data["access_token"]
    else:
        print(f"❌ Login failed: {resp.status_code}")
        return None

def test_leads_with_params(token):
    """Test GET /api/leads with query params"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test filtro
    resp = requests.get(f"{BASE_URL}/leads?filtro=todos", headers=headers, timeout=15)
    print(f"GET /api/leads?filtro=todos: {resp.status_code}")
    
    time.sleep(1)
    
    # Test periodo
    resp = requests.get(f"{BASE_URL}/leads?periodo=semana", headers=headers, timeout=15)
    print(f"GET /api/leads?periodo=semana: {resp.status_code}")
    
    time.sleep(1)
    
    # Test busca
    resp = requests.get(f"{BASE_URL}/leads?busca=silva", headers=headers, timeout=15)
    print(f"GET /api/leads?busca=silva: {resp.status_code}")
    
    return True

def test_leads_stats(token):
    """Test GET /api/leads/stats"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/leads/stats", headers=headers, timeout=15)
    if resp.status_code == 200:
        stats = resp.json()
        print(f"✅ Stats: {stats}")
        return True
    else:
        print(f"❌ Failed: {resp.status_code}")
        return False

def test_lead_crud(token):
    """Test lead CRUD operations"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get existing leads first
    resp = requests.get(f"{BASE_URL}/leads?limit=1", headers=headers, timeout=15)
    if resp.status_code != 200:
        print(f"❌ Failed to get leads: {resp.status_code}")
        return False
    
    leads = resp.json()
    if len(leads) == 0:
        print("⚠️  No leads available for testing")
        return False
    
    lead_id = leads[0]["id"]
    print(f"✅ Got lead ID: {lead_id}")
    
    time.sleep(1)
    
    # Test GET individual lead
    resp = requests.get(f"{BASE_URL}/leads/{lead_id}", headers=headers, timeout=15)
    print(f"GET /api/leads/{lead_id}: {resp.status_code}")
    
    time.sleep(1)
    
    # Test PUT (update)
    update_data = {"observacao": "Teste de atualização"}
    resp = requests.put(f"{BASE_URL}/leads/{lead_id}", headers=headers, json=update_data, timeout=15)
    print(f"PUT /api/leads/{lead_id}: {resp.status_code}")
    
    time.sleep(1)
    
    # Test POST (create new lead)
    new_lead = {
        "nome_lead": "Maria Santos Teste",
        "telefone": "11988776655",
        "cpf": "98765432100",
        "produto_interesse": "Carro Teste"
    }
    resp = requests.post(f"{BASE_URL}/leads", headers=headers, json=new_lead, timeout=15)
    print(f"POST /api/leads (create): {resp.status_code}")
    if resp.status_code == 200:
        new_lead_data = resp.json()
        new_lead_id = new_lead_data["id"]
        print(f"✅ Created lead ID: {new_lead_id}")
        
        time.sleep(1)
        
        # Test gerou_ficha=true
        resp = requests.put(f"{BASE_URL}/leads/{new_lead_id}", headers=headers, json={"gerou_ficha": True}, timeout=15)
        print(f"PUT /api/leads/{new_lead_id} (gerou_ficha=true): {resp.status_code}")
        
        time.sleep(2)
        
        # Check if ficha was created
        resp = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=15)
        if resp.status_code == 200:
            fichas = resp.json()
            ficha_found = any(f.get("lead_id") == new_lead_id for f in fichas)
            if ficha_found:
                print(f"✅ Ficha created for lead {new_lead_id}")
            else:
                print(f"❌ Ficha NOT found for lead {new_lead_id}")
        
        return True
    else:
        print(f"❌ Failed to create lead")
        return False

def test_fichas(token):
    """Test fichas endpoints"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test GET fichas
    resp = requests.get(f"{BASE_URL}/fichas", headers=headers, timeout=15)
    print(f"GET /api/fichas: {resp.status_code}")
    
    if resp.status_code == 200:
        fichas = resp.json()
        print(f"✅ Found {len(fichas)} fichas")
        
        if len(fichas) > 0:
            ficha_id = fichas[0]["id"]
            time.sleep(1)
            
            # Test GET individual ficha
            resp = requests.get(f"{BASE_URL}/fichas/{ficha_id}", headers=headers, timeout=15)
            print(f"GET /api/fichas/{ficha_id}: {resp.status_code}")
            
            time.sleep(1)
            
            # Test PUT (should fail for vendedor)
            resp = requests.put(f"{BASE_URL}/fichas/{ficha_id}", headers=headers, json={"status_geral": "pendente"}, timeout=15)
            print(f"PUT /api/fichas/{ficha_id} (vendedor - should be 403): {resp.status_code}")
        
        return True
    else:
        print(f"❌ Failed to get fichas")
        return False

def main():
    print("="*60)
    print("FOCUSED BACKEND TEST - PROJECT MANU")
    print("="*60)
    
    # Test 1: Login
    token = test_with_delay("Login", test_login, 3)
    if not token:
        print("\n❌ Cannot continue without token")
        return
    
    # Test 2: Leads with query params
    test_with_delay("Leads with query params", lambda: test_leads_with_params(token), 3)
    
    # Test 3: Leads stats
    test_with_delay("Leads stats", lambda: test_leads_stats(token), 3)
    
    # Test 4: Lead CRUD
    test_with_delay("Lead CRUD operations", lambda: test_lead_crud(token), 3)
    
    # Test 5: Fichas
    test_with_delay("Fichas endpoints", lambda: test_fichas(token), 3)
    
    print("\n" + "="*60)
    print("FOCUSED TEST COMPLETE")
    print("="*60)

if __name__ == "__main__":
    main()

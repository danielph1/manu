#!/usr/bin/env python3
"""
Exemplo de worker baseado em passivebot/facebook-marketplace-scraper.
Roda no SEU PC ou VPS (não na Vercel). Requer Playwright + login Facebook.

Uso:
  export MANU_API=https://manu-manu-automoveis.vercel.app
  export MARKETPLACE_SCRAPER_SECRET=seu_segredo_igual_ao_vercel
  export BUSCA_ID=123
  python marketplace_scraper_exemplo.py

Adapte a URL do Marketplace para Rio:
  https://www.facebook.com/marketplace/rio/search?query=aceito%20troca

ATENÇÃO: scraping do Facebook viola os Termos de Serviço da Meta e pode
resultar em bloqueio da conta. Use por sua conta e risco, com volume baixo.
"""
import os, json, time, requests
from urllib.parse import quote

# Opcional: Playwright
# from playwright.sync_api import sync_playwright
# from bs4 import BeautifulSoup

MANU_API = os.environ.get("MANU_API", "https://manu-manu-automoveis.vercel.app").rstrip("/")
SECRET = os.environ.get("MARKETPLACE_SCRAPER_SECRET", "")
BUSCA_ID = os.environ.get("BUSCA_ID")
QUERY = os.environ.get("QUERY", "aceito troca")
CIDADE = os.environ.get("CIDADE", "rio")  # slug marketplace

def post_items(items):
    r = requests.post(
        f"{MANU_API}/api/marketplace/anuncios",
        headers={
            "Content-Type": "application/json",
            "x-manu-scraper-secret": SECRET,
        },
        json={"busca_id": int(BUSCA_ID) if BUSCA_ID else None, "query": QUERY, "items": items},
        timeout=60,
    )
    print(r.status_code, r.text[:500])
    r.raise_for_status()

def scrape_placeholder():
    """Substitua pelo Playwright do repositório passivebot, mudando a cidade para 'rio'."""
    # URL alvo (exemplo):
    url = f"https://www.facebook.com/marketplace/{CIDADE}/search?query={quote(QUERY)}"
    print("Abra/adapte o scraper para:", url)
    # Retorne lista no formato:
    return [
        # {
        #   "titulo": "...",
        #   "preco": "R$ 45.000",
        #   "localizacao": "Rio de Janeiro",
        #   "url": "https://www.facebook.com/marketplace/item/...",
        #   "imagem_url": "https://...",
        # }
    ]

if __name__ == "__main__":
    if not SECRET:
        raise SystemExit("Defina MARKETPLACE_SCRAPER_SECRET")
    items = scrape_placeholder()
    if not items:
        print("Nenhum item — implemente o scrape com Playwright (ver app.py do passivebot).")
    else:
        post_items(items)

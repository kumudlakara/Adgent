"""
Data loading and product query logic backed by nvidia-catalog/catalog.json.

The catalog contains 86 real products scraped from the NVIDIA marketplace:
- Brands: ASUS, GIGABYTE, MSI, NVIDIA, PNY, ZOTAC
- GPU models: RTX 3060, RTX 4060, RTX 4070 Ti, RTX 5050 – RTX 5090
- Each product has real image URLs, retailer links, availability, and pricing.
"""

import json
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).parent.parent / "nvidia-catalog" / "catalog.json"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_data() -> dict:
    with DATA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def load_products() -> list[dict]:
    return load_data()["products"]


# ---------------------------------------------------------------------------
# Pricing helpers
# ---------------------------------------------------------------------------

def _effective_price(p: dict) -> float:
    """Best available price: lowest retail → list → MSRP."""
    return p.get("lowestRetailPrice") or p.get("listPrice") or p.get("msrp") or 0.0


def _format_price(p: dict) -> str:
    price = _effective_price(p)
    currency = p.get("currency", "USD")
    return f"${price:.2f} {currency}"


# ---------------------------------------------------------------------------
# Product summary (safe subset of fields for list / search results)
# ---------------------------------------------------------------------------

def _summary(p: dict) -> dict:
    return {
        "productId": p.get("productId"),
        "sku": p.get("sku"),
        "title": p.get("title"),
        "displayName": p.get("displayName"),
        "brand": p.get("brand"),
        "gpu": p.get("gpu"),
        "price": _format_price(p),
        "msrp": p.get("msrp"),
        "listPrice": p.get("listPrice"),
        "lowestRetailPrice": p.get("lowestRetailPrice"),
        "currency": p.get("currency", "USD"),
        "availability": p.get("availability"),
        "isAvailable": p.get("isAvailable", False),
        "isBestSeller": p.get("isBestSeller", False),
        "isFeatured": p.get("isFeatured", False),
        "isFounderEdition": p.get("isFounderEdition", False),
        "hasActiveOffer": p.get("hasActiveOffer", False),
        "offerText": p.get("offerText"),
        "imageUrl": p.get("imageUrl"),
        "marketplaceUrl": p.get("marketplaceUrl"),
    }


# ---------------------------------------------------------------------------
# Catalog queries
# ---------------------------------------------------------------------------

def get_all_products() -> list[dict]:
    return [_summary(p) for p in load_products()]


def find_product(query: str) -> Optional[dict]:
    """
    Return the best-matching full product record for a query string.
    Priority: exact SKU → exact displayName → substring in title/displayName → GPU model family.
    """
    q = query.lower().strip()
    products = load_products()

    for p in products:
        if p.get("sku", "").lower() == q:
            return p

    for p in products:
        if p.get("displayName", "").lower() == q:
            return p

    for p in products:
        name = p.get("title", "") + " " + p.get("displayName", "")
        if q in name.lower():
            return p

    for p in products:
        if q in p.get("gpu", "").lower():
            return p

    return None


def search_products(query: str) -> list[dict]:
    """Full-text search across title, brand, GPU model, offer text, and spec values."""
    q = query.lower()
    results = []
    for p in load_products():
        blob = " ".join([
            p.get("title", ""),
            p.get("displayName", ""),
            p.get("brand", ""),
            p.get("gpu", ""),
            p.get("offerText", "") or "",
            " ".join(str(v) for v in (p.get("specs") or {}).values()),
        ]).lower()
        if q in blob:
            results.append(_summary(p))
    return results


def filter_products(
    min_price: float = 0.0,
    max_price: float = float("inf"),
    brand: Optional[str] = None,
    gpu_model: Optional[str] = None,
    in_stock_only: bool = False,
    best_sellers_only: bool = False,
    with_offers_only: bool = False,
) -> list[dict]:
    results = []
    for p in load_products():
        price = _effective_price(p)
        if not (min_price <= price <= max_price):
            continue
        if brand and brand.lower() not in p.get("brand", "").lower():
            continue
        if gpu_model and gpu_model.lower() not in p.get("gpu", "").lower():
            continue
        if in_stock_only and not p.get("isAvailable", False):
            continue
        if best_sellers_only and not p.get("isBestSeller", False):
            continue
        if with_offers_only and not p.get("hasActiveOffer", False):
            continue
        results.append(_summary(p))
    return results


def compare_products(names: list[str]) -> dict:
    """Side-by-side comparison of specs, price, and availability."""
    found = []
    seen_ids = set()
    for name in names:
        p = find_product(name)
        if p and p.get("productId") not in seen_ids:
            found.append(p)
            seen_ids.add(p.get("productId"))

    if not found:
        return {"error": "No matching products found."}

    all_spec_keys: list[str] = []
    for p in found:
        for k in (p.get("specs") or {}):
            if k not in all_spec_keys:
                all_spec_keys.append(k)

    display_names = [p["displayName"] for p in found]
    comparison: dict = {
        "products": display_names,
        "brand": {p["displayName"]: p.get("brand") for p in found},
        "gpu_model": {p["displayName"]: p.get("gpu") for p in found},
        "msrp": {p["displayName"]: f"${p['msrp']:.2f}" if p.get("msrp") else "N/A" for p in found},
        "list_price": {p["displayName"]: f"${p['listPrice']:.2f}" if p.get("listPrice") else "N/A" for p in found},
        "availability": {p["displayName"]: p.get("availability", "unknown") for p in found},
        "image_urls": {p["displayName"]: p.get("imageUrl") for p in found},
        "marketplace_urls": {p["displayName"]: p.get("marketplaceUrl") for p in found},
        "specs": {},
    }
    for key in all_spec_keys:
        comparison["specs"][key] = {
            p["displayName"]: (p.get("specs") or {}).get(key, "—") for p in found
        }
    return comparison


# ---------------------------------------------------------------------------
# Retailer helpers
# ---------------------------------------------------------------------------

def get_retailers_for(product: dict) -> list[dict]:
    return product.get("retailers") or []


def find_cheapest_retailer(product: dict) -> Optional[dict]:
    available = [r for r in get_retailers_for(product) if r.get("isAvailable")]
    if not available:
        return None
    return min(available, key=lambda r: r.get("price") or float("inf"))


# ---------------------------------------------------------------------------
# Catalog metadata helpers
# ---------------------------------------------------------------------------

def get_unique_brands() -> list[str]:
    return sorted({p["brand"] for p in load_products() if p.get("brand")})


def get_unique_gpu_models() -> list[str]:
    return sorted({
        p["gpu"] for p in load_products()
        if p.get("gpu") and p["gpu"] != "NO GPU"
    })


def get_current_offers() -> list[dict]:
    return [_summary(p) for p in load_products() if p.get("hasActiveOffer")]


def get_founder_editions() -> list[dict]:
    return [_summary(p) for p in load_products() if p.get("isFounderEdition")]


def get_best_sellers() -> list[dict]:
    return [_summary(p) for p in load_products() if p.get("isBestSeller")]

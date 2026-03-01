"""
Data loading and product query logic backed by nike-catalog/catalog.json.

The catalog contains 681 real products scraped from the Nike GB store:
- Brand: Nike
- Categories: Shoes (men's footwear)
- Each product has real image URLs, product links, pricing, and colorway variants.
"""

import json
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).parent.parent / "nike-catalog" / "catalog.json"


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
    """Best available price: currentPrice → fullPrice."""
    return p.get("currentPrice") or p.get("fullPrice") or 0.0


def _format_price(p: dict) -> str:
    price = _effective_price(p)
    currency = p.get("currency", "GBP")
    symbol = "£" if currency == "GBP" else "$"
    return f"{symbol}{price:.2f} {currency}"


# ---------------------------------------------------------------------------
# Product summary (safe subset of fields for list / search results)
# ---------------------------------------------------------------------------

def _summary(p: dict) -> dict:
    return {
        "groupKey": p.get("groupKey"),
        "productCode": p.get("productCode"),
        "title": p.get("title"),
        "subtitle": p.get("subtitle"),
        "brand": p.get("brand", "Nike"),
        "category": p.get("category"),
        "gender": p.get("gender"),
        "colorDescription": p.get("colorDescription"),
        "simpleColor": p.get("simpleColor"),
        "price": _format_price(p),
        "currentPrice": p.get("currentPrice"),
        "fullPrice": p.get("fullPrice"),
        "currency": p.get("currency", "GBP"),
        "isOnSale": p.get("isOnSale", False),
        "discountPercent": p.get("discountPercent", 0),
        "isCustomizable": p.get("isCustomizable", False),
        "badge": p.get("badge"),
        "totalColorways": p.get("totalColorways", 1),
        "imageUrl": p.get("imageUrl"),
        "productUrl": p.get("productUrl"),
    }


# ---------------------------------------------------------------------------
# Catalog queries
# ---------------------------------------------------------------------------

def get_all_products() -> list[dict]:
    return [_summary(p) for p in load_products()]


def find_product(query: str) -> Optional[dict]:
    """
    Return the best-matching full product record for a query string.
    Priority: exact productCode → exact title → substring in title → color/subtitle match.
    """
    q = query.lower().strip()
    products = load_products()

    for p in products:
        if p.get("productCode", "").lower() == q:
            return p

    for p in products:
        if p.get("title", "").lower() == q:
            return p

    for p in products:
        if q in p.get("title", "").lower():
            return p

    for p in products:
        blob = " ".join([
            p.get("colorDescription", "") or "",
            p.get("simpleColor", "") or "",
            p.get("subtitle", "") or "",
        ]).lower()
        if q in blob:
            return p

    return None


def search_products(query: str) -> list[dict]:
    """Full-text search across title, color description, simple color, badge, and subtitle."""
    q = query.lower()
    results = []
    for p in load_products():
        blob = " ".join([
            p.get("title", ""),
            p.get("subtitle", "") or "",
            p.get("colorDescription", "") or "",
            p.get("simpleColor", "") or "",
            p.get("badge", "") or "",
            p.get("category", "") or "",
            p.get("gender", "") or "",
        ]).lower()
        if q in blob:
            results.append(_summary(p))
    return results


def filter_products(
    min_price: float = 0.0,
    max_price: float = float("inf"),
    color: Optional[str] = None,
    on_sale_only: bool = False,
    customizable_only: bool = False,
) -> list[dict]:
    results = []
    for p in load_products():
        price = _effective_price(p)
        if not (min_price <= price <= max_price):
            continue
        if color and color.lower() not in (p.get("simpleColor", "") or "").lower():
            continue
        if on_sale_only and not p.get("isOnSale", False):
            continue
        if customizable_only and not p.get("isCustomizable", False):
            continue
        results.append(_summary(p))
    return results


def compare_products(names: list[str]) -> dict:
    """Side-by-side comparison of price, color, availability of sale, and colorways."""
    found = []
    seen_keys = set()
    for name in names:
        p = find_product(name)
        if p and p.get("groupKey") not in seen_keys:
            found.append(p)
            seen_keys.add(p.get("groupKey"))

    if not found:
        return {"error": "No matching products found."}

    titles = [p["title"] for p in found]
    comparison: dict = {
        "products": titles,
        "brand": {p["title"]: p.get("brand", "Nike") for p in found},
        "category": {p["title"]: p.get("category") for p in found},
        "gender": {p["title"]: p.get("gender") for p in found},
        "color": {p["title"]: p.get("simpleColor") for p in found},
        "color_description": {p["title"]: p.get("colorDescription") for p in found},
        "current_price": {p["title"]: _format_price(p) for p in found},
        "full_price": {p["title"]: f"£{p['fullPrice']:.2f}" if p.get("fullPrice") else "N/A" for p in found},
        "on_sale": {p["title"]: "Yes" if p.get("isOnSale") else "No" for p in found},
        "discount": {p["title"]: f"{p.get('discountPercent', 0)}%" for p in found},
        "total_colorways": {p["title"]: str(p.get("totalColorways", 1)) for p in found},
        "customizable": {p["title"]: "Yes" if p.get("isCustomizable") else "No" for p in found},
        "image_urls": {p["title"]: p.get("imageUrl") for p in found},
        "product_urls": {p["title"]: p.get("productUrl") for p in found},
    }
    return comparison


# ---------------------------------------------------------------------------
# Colorway helpers
# ---------------------------------------------------------------------------

def get_colorways_for(product: dict) -> list[dict]:
    return product.get("colorways") or []


# ---------------------------------------------------------------------------
# Catalog metadata helpers
# ---------------------------------------------------------------------------

def get_unique_colors() -> list[str]:
    return sorted({
        p["simpleColor"] for p in load_products()
        if p.get("simpleColor")
    })


def get_sale_products() -> list[dict]:
    return [_summary(p) for p in load_products() if p.get("isOnSale")]


def get_customizable_products() -> list[dict]:
    return [_summary(p) for p in load_products() if p.get("isCustomizable")]

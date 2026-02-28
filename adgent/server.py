"""
Adgent HTTP server — listens on port 8787 (matches chrome-extension/background.js).

Run with:
    uv run python -m adgent.server

Endpoints:
    POST /api/ad-agent/query    — full agentic response to a user prompt
    POST /api/ad-agent/suggest  — fast suggestion chips for a product (on ad click)
    POST /api/campaign/launch   — write products.json for the chrome extension
    GET  /health
"""

import base64
import json
import re
import uvicorn
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import get_suggestions, run_query

CHROME_EXTENSION_DIR = Path(__file__).parent.parent / "chrome-extension"

app = FastAPI(title="Adgent API", version="0.1.0")

# Allow requests from the Chrome extension (chrome-extension://* and localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    prompt: str
    currentProduct: dict
    cookieProfile: dict = {}
    pageUrl: str | None = None
    timestamp: str | None = None


class SuggestRequest(BaseModel):
    currentProduct: dict


class CampaignLaunchRequest(BaseModel):
    product: dict
    thumbnailDataUrl: str | None = None
    targetSites: list[str] | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/ad-agent/query")
async def query(request: QueryRequest):
    """
    Run the full Claude + MCP agent for a user prompt.

    Returns:
        message   — agent's response text
        next_steps — list of {label, prompt} follow-up suggestions
    """
    try:
        result = await run_query(
            prompt=request.prompt,
            product=request.currentProduct,
            cookie_profile=request.cookieProfile,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/ad-agent/suggest")
async def suggest(request: SuggestRequest):
    """
    Return 4 question suggestions for the ad product shown to the user.
    Called when the user first opens/clicks an ad card.

    Returns:
        suggestions — list of {label, prompt}
    """
    try:
        suggestions = await get_suggestions(request.currentProduct)
        return {"suggestions": suggestions}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/campaign/launch")
async def campaign_launch(request: CampaignLaunchRequest):
    """
    Write (or prepend) a product entry to chrome-extension/products.json so
    the extension picks it up on the next page load.

    If `thumbnailDataUrl` is provided (base64 data URL), the image is saved to
    chrome-extension/images/<id>.<ext> and thumbnailUrl is set to the relative
    path so the extension can load it via chrome.runtime.getURL().

    The incoming product replaces any existing entry with the same id.
    """
    try:
        products_path = CHROME_EXTENSION_DIR / "products.json"
        new_product = dict(request.product)
        product_id = new_product.get("id") or "campaign-product"

        # ------------------------------------------------------------------
        # Save embedded image (data URL) to the extension's images/ folder
        # ------------------------------------------------------------------
        if request.thumbnailDataUrl:
            data_url = request.thumbnailDataUrl
            # Extract mime type and raw base64 payload
            match = re.match(r"data:image/([a-zA-Z0-9+.]+);base64,(.+)", data_url, re.DOTALL)
            if match:
                ext = match.group(1).lower().split("+")[0]  # e.g. "png", "jpeg", "webp"
                ext = "jpg" if ext == "jpeg" else ext
                raw_b64 = match.group(2)
                image_bytes = base64.b64decode(raw_b64)

                images_dir = CHROME_EXTENSION_DIR / "images"
                images_dir.mkdir(exist_ok=True)

                image_filename = f"{product_id}.{ext}"
                (images_dir / image_filename).write_bytes(image_bytes)

                # Relative path — content.js resolves it via chrome.runtime.getURL()
                new_product["thumbnailUrl"] = f"images/{image_filename}"

        # ------------------------------------------------------------------
        # Update products.json
        # ------------------------------------------------------------------
        existing: list = []
        if products_path.exists():
            try:
                existing = json.loads(products_path.read_text(encoding="utf-8"))
                if not isinstance(existing, list):
                    existing = []
            except Exception:
                existing = []

        # Replace existing entry with the same id, otherwise prepend
        existing = [p for p in existing if p.get("id") != product_id]
        products = [new_product] + existing

        products_path.write_text(
            json.dumps(products, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # ------------------------------------------------------------------
        # Write campaign.json with target sites
        # ------------------------------------------------------------------
        campaign_path = CHROME_EXTENSION_DIR / "campaign.json"
        target_sites = request.targetSites or ["reddit", "techcrunch"]
        campaign_path.write_text(
            json.dumps({"targetSites": target_sites}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        return {"status": "ok", "productsFile": str(products_path), "total": len(products)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("adgent.server:app", host="0.0.0.0", port=8787, reload=True)

"""
Adgent HTTP server — listens on port 8787 (matches chrome-extension/background.js).

Run with:
    uv run python -m adgent.server

Endpoints:
    POST /api/ad-agent/query    — full agentic response to a user prompt
    POST /api/ad-agent/suggest  — fast suggestion chips for a product (on ad click)
    GET  /health
"""

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agent import get_suggestions, run_query

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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("adgent.server:app", host="0.0.0.0", port=8787, reload=True)

"""
Adgent — Claude agent with MCP integration for NVIDIA GPU Store and Nike Shoe Store.

Handles two operations:
  run_query()      — full agentic loop (user prompt → MCP tools → structured response)
  get_suggestions() — lightweight suggestion generation (haiku, no MCP)

The correct MCP server (nvidia vs nike) is selected automatically from the product dict.
"""

import json
import re
from pathlib import Path

from anthropic import Anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

PROJECT_ROOT = Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Structured output tool — forces Claude to return machine-readable JSON
# ---------------------------------------------------------------------------

FINAL_RESPONSE_TOOL = {
    "name": "final_response",
    "description": (
        "Call this tool to deliver your final answer to the user. "
        "You MUST call this to end the conversation — never stop without calling it."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Your response to the user's question. Be concise and helpful.",
            },
            "next_steps": {
                "type": "array",
                "description": "2–3 follow-up actions the user might want to take next.",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "Short button label, 2–4 words.",
                        },
                        "prompt": {
                            "type": "string",
                            "description": "Full prompt text sent when the user clicks this button.",
                        },
                    },
                    "required": ["label", "prompt"],
                },
            },
            "product_image": {
                "type": "string",
                "description": (
                    "URL of a product image to display in the UI. "
                    "Use get_product_image() or get_product_details() to retrieve this. "
                    "Include whenever the user asks about a specific product."
                ),
            },
        },
        "required": ["message", "next_steps"],
    },
}


# ---------------------------------------------------------------------------
# Catalog detection
# ---------------------------------------------------------------------------

_NIKE_KEYWORDS = {"shoe", "sneaker", "dunk", "air force", "air max", "jordan",
                  "pegasus", "react", "blazer", "cortez", "vaporfly", "zoomx"}


def _detect_catalog(product: dict) -> str:
    """Return 'nike' or 'nvidia' based on product fields."""
    # Explicit catalog tag takes priority
    if product.get("catalog"):
        return product["catalog"]
    # Nike-specific structural fields
    if product.get("productType") == "FOOTWEAR" or product.get("groupKey") or product.get("productCode"):
        return "nike"
    # Keyword match on product name
    name = product.get("name", "").lower()
    if any(kw in name for kw in _NIKE_KEYWORDS):
        return "nike"
    return "nvidia"


# ---------------------------------------------------------------------------
# System prompt builders
# ---------------------------------------------------------------------------

def _nvidia_system_prompt(product: dict) -> str:
    name = product.get("name", "this GPU")
    price = product.get("price", "N/A")
    badge = product.get("badge") or ""
    thumb = product.get("thumbnailUrl", "")

    badge_line = f"  Badge: {badge}\n" if badge else ""
    thumb_line = f"  Ad thumbnail: {thumb}\n" if thumb else ""

    return (
        "You are Adgent, a helpful GPU shopping assistant embedded in a Reddit advertisement.\n\n"
        f"The user clicked on an ad for:\n"
        f"  Product: {name}\n"
        f"  Advertised price: {price}\n"
        f"{badge_line}"
        f"{thumb_line}\n"
        "You have access to the NVIDIA GPU Store — a real catalog of 86 products from ASUS, GIGABYTE, "
        "MSI, NVIDIA, PNY, and ZOTAC covering RTX 30, 40, and 50 series GPUs.\n\n"
        "Capabilities:\n"
        "- Search and filter the full catalog (by brand, GPU model, price, stock status)\n"
        "- Fetch real product images via get_product_image() or get_product_details()\n"
        "- Check live availability and compare prices across retailers\n"
        "- Show active deals and game bundles (e.g. Resident Evil Requiem bundles)\n"
        "- Compare multiple GPUs side-by-side\n"
        "- Direct users to retailer purchase links\n\n"
        "Guidelines:\n"
        "- Never guess specs, prices, or stock — always use a tool.\n"
        "- When discussing a specific product, call get_product_image() and include the URL "
        "  in final_response.product_image so it is displayed in the UI.\n"
        "- If the user wants to buy, point them directly to the retailer link.\n"
        "- Never suggest adding to cart or use any cart-related tools — there is no cart.\n"
        "- After answering, call `final_response` with message, next_steps (2–3), and product_image if relevant.\n"
        "- Always call `final_response` to finish.\n\n"
        "Response style:\n"
        "- Be direct and concise. Answer the question in 1–3 sentences or a short bullet list.\n"
        "- No filler phrases like 'Great question!' or 'Certainly!' — get straight to the point.\n"
        "- Use **bold** for key values (price, availability, spec names).\n"
        "- Use a short bullet list only when comparing multiple items or listing more than 2 facts.\n"
        "- Never use markdown tables — use a bullet list instead.\n"
        "- Never repeat the product name unnecessarily or summarise what you just said."
    )


def _nike_system_prompt(product: dict) -> str:
    name = product.get("name", "this shoe")
    price = product.get("price", "N/A")
    badge = product.get("badge") or ""
    thumb = product.get("thumbnailUrl", "")

    badge_line = f"  Badge: {badge}\n" if badge else ""
    thumb_line = f"  Ad thumbnail: {thumb}\n" if thumb else ""

    return (
        "You are Adgent, a helpful Nike shoe shopping assistant embedded in a Reddit advertisement.\n\n"
        f"The user clicked on an ad for:\n"
        f"  Product: {name}\n"
        f"  Advertised price: {price}\n"
        f"{badge_line}"
        f"{thumb_line}\n"
        "You have access to the Nike Shoe Store — a real catalog of 681 men's footwear products "
        "from the Nike GB store, including Air Force 1, Dunk, Air Max, Jordan, and many more. "
        "Prices are in GBP (£).\n\n"
        "Capabilities:\n"
        "- Search and filter the full catalog (by color, price, sale status, customizability)\n"
        "- Fetch real product images via get_product_image() or get_product_details()\n"
        "- Show all available colorways for a shoe via get_colorways()\n"
        "- Find current sale items and Nike By You customizable products\n"
        "- Compare multiple shoes side-by-side\n"
        "- Direct users to the Nike product page\n\n"
        "Guidelines:\n"
        "- Never guess prices or colors — always use a tool.\n"
        "- When discussing a specific product, call get_product_image() and include the URL "
        "  in final_response.product_image so it is displayed in the UI.\n"
        "- If the user wants to buy, point them directly to the product URL.\n"
        "- Never suggest adding to cart or use any cart-related tools — there is no cart.\n"
        "- After answering, call `final_response` with message, next_steps (2–3), and product_image if relevant.\n"
        "- Always call `final_response` to finish.\n\n"
        "Response style:\n"
        "- Be direct and concise. Answer the question in 1–3 sentences or a short bullet list.\n"
        "- No filler phrases like 'Great question!' or 'Certainly!' — get straight to the point.\n"
        "- Use **bold** for key values (price, color, availability).\n"
        "- Use a short bullet list only when comparing multiple items or listing more than 2 facts.\n"
        "- Never use markdown tables — use a bullet list instead.\n"
        "- Never repeat the product name unnecessarily or summarise what you just said."
    )


def build_system_prompt(product: dict, catalog: str) -> str:
    if catalog == "nike":
        return _nike_system_prompt(product)
    return _nvidia_system_prompt(product)


# ---------------------------------------------------------------------------
# Main agentic query loop
# ---------------------------------------------------------------------------

_MCP_MODULES = {
    "nvidia": "mcp_server.server",
    "nike": "nike_mcp_server.server",
}


async def run_query(prompt: str, product: dict, cookie_profile: dict) -> dict:
    """
    Run a full agentic loop:
      1. Detect catalog (nvidia / nike) from the product dict.
      2. Spawn the appropriate MCP server subprocess.
      3. Fetch available tools.
      4. Loop: call Claude → handle tool_use → call MCP → repeat.
      5. Return when Claude calls final_response.
    """
    catalog = _detect_catalog(product)
    mcp_module = _MCP_MODULES[catalog]

    server_params = StdioServerParameters(
        command="uv",
        args=["run", "python", "-m", mcp_module],
        cwd=str(PROJECT_ROOT),
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Build tool list: MCP tools + the structured final_response tool
            # Cart tools are excluded — purchasing is handled via direct retailer links.
            _CART_TOOLS = {"add_to_cart", "remove_from_cart", "update_cart_quantity", "view_cart", "checkout"}
            tools_response = await session.list_tools()
            tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema,
                }
                for t in tools_response.tools
                if t.name not in _CART_TOOLS
            ]
            tools.append(FINAL_RESPONSE_TOOL)

            client = Anthropic()
            messages = [{"role": "user", "content": prompt}]
            system = build_system_prompt(product, catalog)

            for _ in range(12):  # safety cap on iterations
                response = client.messages.create(
                    model="claude-opus-4-6",
                    max_tokens=2048,
                    system=system,
                    tools=tools,
                    messages=messages,
                )

                # Separate final_response from real MCP tool calls
                final_input = None
                mcp_tool_uses = []

                for block in response.content:
                    if block.type == "tool_use":
                        if block.name == "final_response":
                            final_input = block.input
                        else:
                            mcp_tool_uses.append(block)

                if final_input:
                    return {
                        "message": final_input.get("message", ""),
                        "next_steps": final_input.get("next_steps", []),
                        "product_image": final_input.get("product_image"),
                    }

                if response.stop_reason == "end_turn":
                    # Claude finished without using final_response — extract plain text
                    text = " ".join(
                        b.text for b in response.content if hasattr(b, "text")
                    )
                    return {"message": text, "next_steps": []}

                if not mcp_tool_uses:
                    break

                # Forward tool calls to the MCP server
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []

                for tool_use in mcp_tool_uses:
                    result = await session.call_tool(tool_use.name, tool_use.input)
                    content = " ".join(
                        c.text for c in (result.content or []) if hasattr(c, "text")
                    )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use.id,
                            "content": content,
                        }
                    )

                messages.append({"role": "user", "content": tool_results})

    return {"message": "I couldn't complete your request. Please try again.", "next_steps": []}


# ---------------------------------------------------------------------------
# Lightweight suggestion generator (no MCP, uses Haiku for speed)
# ---------------------------------------------------------------------------

_FALLBACK_SUGGESTIONS: dict[str, list[dict]] = {
    # NVIDIA GPU suggestions
    "rtx 5090": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5090."},
        {"label": "Check stock", "prompt": "Is the RTX 5090 in stock anywhere?"},
        {"label": "Compare vs 5080", "prompt": "Compare the RTX 5090 vs RTX 5080."},
        {"label": "Active deals", "prompt": "Are there any deals or bundles on the RTX 5090?"},
    ],
    "rtx 5080": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5080."},
        {"label": "Check stock", "prompt": "Is the RTX 5080 in stock anywhere?"},
        {"label": "Compare vs 5090", "prompt": "How does the RTX 5080 compare to the RTX 5090?"},
        {"label": "Best price", "prompt": "Where can I get the RTX 5080 at the best price?"},
    ],
    "rtx 5070 ti": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5070 Ti."},
        {"label": "Check retailers", "prompt": "Which retailer has the RTX 5070 Ti cheapest?"},
        {"label": "Compare vs 5080", "prompt": "How does the RTX 5070 Ti compare to the RTX 5080?"},
        {"label": "Active deals", "prompt": "Are there any deals or bundles on the RTX 5070 Ti?"},
    ],
    "rtx 5070": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5070."},
        {"label": "Check stock", "prompt": "Is the RTX 5070 in stock anywhere?"},
        {"label": "Compare vs 5080", "prompt": "How does the RTX 5070 compare to the RTX 5080?"},
        {"label": "Active deals", "prompt": "Are there any deals or bundles on the RTX 5070?"},
    ],
    "rtx 5060": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5060."},
        {"label": "Check stock", "prompt": "Is the RTX 5060 available to buy now?"},
        {"label": "Best price", "prompt": "Where can I get the RTX 5060 at the best price?"},
        {"label": "Compare models", "prompt": "How does the RTX 5060 compare to other RTX 50 cards?"},
    ],
    # Nike shoe suggestions
    "air force 1": [
        {"label": "See image", "prompt": "Show me the image of the Nike Air Force 1."},
        {"label": "All colorways", "prompt": "What colorways are available for the Nike Air Force 1?"},
        {"label": "Compare styles", "prompt": "Compare the Air Force 1 '07 vs Air Force 1 Low."},
        {"label": "On sale?", "prompt": "Is the Nike Air Force 1 currently on sale?"},
    ],
    "dunk": [
        {"label": "See image", "prompt": "Show me the image of the Nike Dunk."},
        {"label": "All colorways", "prompt": "What colorways are available for the Nike Dunk?"},
        {"label": "On sale?", "prompt": "Is the Nike Dunk currently on sale?"},
        {"label": "Compare styles", "prompt": "Compare the Nike Dunk Low vs Dunk High."},
    ],
    "air max": [
        {"label": "See image", "prompt": "Show me the image of the Nike Air Max."},
        {"label": "All colorways", "prompt": "What colorways are available for the Nike Air Max?"},
        {"label": "Compare models", "prompt": "What Air Max models are in the catalog?"},
        {"label": "On sale?", "prompt": "Are any Air Max shoes currently on sale?"},
    ],
    "jordan": [
        {"label": "See image", "prompt": "Show me the image of the Jordan shoe."},
        {"label": "All colorways", "prompt": "What colorways are available for this Jordan?"},
        {"label": "On sale?", "prompt": "Are any Jordan shoes currently on sale?"},
        {"label": "Compare models", "prompt": "What Jordan models are available in the catalog?"},
    ],
}

_DEFAULT_NVIDIA_SUGGESTIONS_TPL = [
    {"label": "Full specs", "prompt": "What are the full specifications of {name}?"},
    {"label": "Check stock", "prompt": "Is {name} in stock?"},
    {"label": "Best value", "prompt": "Which GPU gives the best value for money?"},
    {"label": "Active deals", "prompt": "Are there any deals or bundles on {name}?"},
]

_DEFAULT_NIKE_SUGGESTIONS_TPL = [
    {"label": "See image", "prompt": "Show me the image of {name}."},
    {"label": "All colorways", "prompt": "What colorways are available for {name}?"},
    {"label": "Sale items", "prompt": "Are there any Nike shoes on sale right now?"},
    {"label": "On sale?", "prompt": "Is {name} currently on sale?"},
]


async def get_suggestions(product: dict) -> list[dict]:
    """
    Generate 4 contextual question suggestions for the given product.
    Uses Haiku for low latency. Falls back to static suggestions on error.
    """
    catalog = _detect_catalog(product)
    name = product.get("name", "this shoe" if catalog == "nike" else "this GPU")

    # Check static fallback first (instant, no API call needed for known products)
    for key, suggestions in _FALLBACK_SUGGESTIONS.items():
        if key in name.lower():
            return suggestions

    # Use Haiku for dynamic generation
    try:
        client = Anthropic()
        if catalog == "nike":
            user_content = (
                f"Generate exactly 4 question suggestions a shopper might ask about the Nike {name} shoe "
                "in an ad. Return ONLY a JSON array, no markdown, no explanation:\n"
                '[{"label":"Short label (2-4 words)","prompt":"Full question?"}]\n'
                "Focus on: image/look, color options, sale/price, comparing styles."
            )
        else:
            user_content = (
                f"Generate exactly 4 question suggestions a shopper might ask about the {name} GPU "
                "in an ad. Return ONLY a JSON array, no markdown, no explanation:\n"
                '[{"label":"Short label (2-4 words)","prompt":"Full question?"}]\n'
                "Focus on: specs, stock availability, price comparison, active deals."
            )
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": user_content}],
        )
        text = response.content[0].text.strip()
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass

    # Static fallback
    tpl = _DEFAULT_NIKE_SUGGESTIONS_TPL if catalog == "nike" else _DEFAULT_NVIDIA_SUGGESTIONS_TPL
    return [
        {"label": s["label"], "prompt": s["prompt"].format(name=name)}
        for s in tpl
    ]

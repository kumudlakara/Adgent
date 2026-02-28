"""
Adgent — Claude agent with NVIDIA GPU Store MCP integration.

Handles two operations:
  run_query()      — full agentic loop (user prompt → MCP tools → structured response)
  get_suggestions() — lightweight suggestion generation (haiku, no MCP)
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
# System prompt builder
# ---------------------------------------------------------------------------

def build_system_prompt(product: dict) -> str:
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
        "- Manage the user's shopping cart and direct them to purchase links\n\n"
        "Guidelines:\n"
        "- Never guess specs, prices, or stock — always use a tool.\n"
        "- When discussing a specific product, call get_product_image() and include the URL "
        "  in final_response.product_image so it is displayed in the UI.\n"
        "- If the user wants to buy, use add_to_cart then point them to checkout or the retailer link.\n"
        "- After answering, call `final_response` with message, next_steps (2–3), and product_image if relevant.\n"
        "- Always call `final_response` to finish."
    )


# ---------------------------------------------------------------------------
# Main agentic query loop
# ---------------------------------------------------------------------------

async def run_query(prompt: str, product: dict, cookie_profile: dict) -> dict:
    """
    Run a full agentic loop:
      1. Spawn the MCP server subprocess.
      2. Fetch available tools.
      3. Loop: call Claude → handle tool_use → call MCP → repeat.
      4. Return when Claude calls final_response.
    """
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "python", "-m", "mcp_server.server"],
        cwd=str(PROJECT_ROOT),
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Build tool list: MCP tools + the structured final_response tool
            tools_response = await session.list_tools()
            tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema,
                }
                for t in tools_response.tools
            ]
            tools.append(FINAL_RESPONSE_TOOL)

            client = Anthropic()
            messages = [{"role": "user", "content": prompt}]
            system = build_system_prompt(product)

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
    "rtx 5090": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5090."},
        {"label": "Check stock", "prompt": "Is the RTX 5090 in stock anywhere?"},
        {"label": "Compare vs 5080", "prompt": "Compare the RTX 5090 vs RTX 5080."},
        {"label": "Add to cart", "prompt": "Add the NVIDIA RTX 5090 to my cart."},
    ],
    "rtx 5080": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5080."},
        {"label": "Check stock", "prompt": "Is the RTX 5080 in stock anywhere?"},
        {"label": "Compare vs 5090", "prompt": "How does the RTX 5080 compare to the RTX 5090?"},
        {"label": "Add to cart", "prompt": "Add the NVIDIA RTX 5080 to my cart."},
    ],
    "rtx 5070 ti": [
        {"label": "Full details", "prompt": "Show me the full details and image of the RTX 5070 Ti."},
        {"label": "Check retailers", "prompt": "Which retailer has the RTX 5070 Ti cheapest?"},
        {"label": "Compare vs 5080", "prompt": "How does the RTX 5070 Ti compare to the RTX 5080?"},
        {"label": "Add to cart", "prompt": "Add an RTX 5070 Ti to my cart."},
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
        {"label": "Add to cart", "prompt": "Add an RTX 5060 to my cart."},
    ],
}

_DEFAULT_SUGGESTIONS_TPL = [
    {"label": "Full specs", "prompt": "What are the full specifications of {name}?"},
    {"label": "Check stock", "prompt": "Is {name} in stock?"},
    {"label": "Best value", "prompt": "Which GPU gives the best value for money?"},
    {"label": "Add to cart", "prompt": "Add {name} to my cart"},
]


async def get_suggestions(product: dict) -> list[dict]:
    """
    Generate 4 contextual question suggestions for the given product.
    Uses Haiku for low latency. Falls back to static suggestions on error.
    """
    name = product.get("name", "this GPU")

    # Check static fallback first (instant, no API call needed for known products)
    for key, suggestions in _FALLBACK_SUGGESTIONS.items():
        if key in name.lower():
            return suggestions

    # Use Haiku for dynamic generation
    try:
        client = Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Generate exactly 4 question suggestions a shopper might ask about the {name} GPU "
                        "in an ad. Return ONLY a JSON array, no markdown, no explanation:\n"
                        '[{"label":"Short label (2-4 words)","prompt":"Full question?"}]\n'
                        "Focus on: specs, stock availability, price comparison, adding to cart."
                    ),
                }
            ],
        )
        text = response.content[0].text.strip()
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass

    # Static fallback
    return [
        {"label": s["label"], "prompt": s["prompt"].format(name=name)}
        for s in _DEFAULT_SUGGESTIONS_TPL
    ]

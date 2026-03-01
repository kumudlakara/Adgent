"""
Nike Shoe Store — MCP Server (backed by nike-catalog/catalog.json)

681 real products · Men's footwear · Nike GB store

Run with:
    uv run python -m nike_mcp_server.server

MCP client config:
    {
      "mcpServers": {
        "nike-store": {
          "command": "uv",
          "args": ["run", "python", "-m", "nike_mcp_server.server"],
          "cwd": "/path/to/Adgent"
        }
      }
    }
"""

import json
from mcp.server.fastmcp import FastMCP
from . import store, cart

mcp = FastMCP(
    "Nike Shoe Store",
    instructions=(
        "You are a helpful Nike shoe shopping assistant. Use the available tools to help "
        "users find, compare, and purchase Nike shoes. The catalog contains 681 real men's "
        "footwear products from the Nike GB store, including Air Force 1, Dunk, Air Max, "
        "Jordan, and many more. Products have real image URLs, product links, pricing in GBP, "
        "and colorway variants. Help users find their perfect pair."
    ),
)


# ---------------------------------------------------------------------------
# Discovery tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_products() -> str:
    """List all Nike shoe products in the catalog with name, color, price, and sale status."""
    products = store.get_all_products()
    lines = [f"Nike Shoe Catalog ({len(products)} products):\n"]
    for p in products:
        sale = " [Sale]" if p.get("isOnSale") else ""
        custom = " [Customizable]" if p.get("isCustomizable") else ""
        lines.append(
            f"  • {p['title']} ({p.get('simpleColor', 'N/A')})  —  {p['price']}{sale}{custom}"
        )
    return "\n".join(lines)


@mcp.tool()
def search_products(query: str) -> str:
    """
    Search Nike shoe products by keyword across title, color, badge, and category.

    Args:
        query: e.g. "Air Force 1", "Dunk", "white", "Jordan", "sale", "customizable"
    """
    results = store.search_products(query)
    if not results:
        return f"No products found for '{query}'."
    lines = [f"Search results for '{query}' ({len(results)} found):\n"]
    for p in results:
        sale = " [Sale]" if p.get("isOnSale") else ""
        lines.append(
            f"  • {p['title']} ({p.get('simpleColor', 'N/A')})  —  {p['price']}{sale}"
        )
    return "\n".join(lines)


@mcp.tool()
def get_product_details(name: str) -> str:
    """
    Get full details for a Nike shoe: title, color, pricing, colorways, and product link.

    Args:
        name: Product name, title, or product code (e.g. "Nike Air Force 1 '07",
              "Dunk Low", "IQ1119-011")
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found. Try list_products() or search_products()."

    sale_str = f"  (was £{p['fullPrice']:.2f}, {p.get('discountPercent', 0)}% off)" if p.get("isOnSale") else ""
    lines = [
        f"## {p['title']}",
        f"**Subtitle:** {p.get('subtitle', 'N/A')}",
        f"**Brand:** {p.get('brand', 'Nike')}",
        f"**Category:** {p.get('category', 'N/A')}",
        f"**Gender:** {p.get('gender', 'N/A')}",
        f"**Product Code:** {p.get('productCode', 'N/A')}",
        f"",
        f"**Price:** £{p['currentPrice']:.2f} GBP{sale_str}",
        f"**Color:** {p.get('colorDescription', 'N/A')} ({p.get('simpleColor', 'N/A')})",
    ]

    if p.get("isCustomizable"):
        lines.append("✏️ **Customizable** — design your own colorway")

    if p.get("badge"):
        lines.append(f"🏷️ **Badge:** {p['badge']}")

    colorways = store.get_colorways_for(p)
    if colorways:
        lines.append(f"\n**Available Colorways ({len(colorways)}):**")
        for cw in colorways:
            sale_note = " [Sale]" if cw.get("isOnSale") else ""
            lines.append(
                f"  • {cw.get('colorDescription', 'N/A')} ({cw.get('simpleColor', 'N/A')})"
                f"  —  £{cw.get('currentPrice', 0):.2f}{sale_note}"
            )
            if cw.get("productUrl"):
                lines.append(f"    Link: {cw['productUrl']}")

    if p.get("imageUrl"):
        lines.append(f"\n**Product Image:** {p['imageUrl']}")

    if p.get("productUrl"):
        lines.append(f"**Product URL:** {p['productUrl']}")

    return "\n".join(l for l in lines if l is not None)


@mcp.tool()
def get_product_image(name: str) -> str:
    """
    Get the product image URL for a Nike shoe. Use this to show the user a visual of the shoe.

    Args:
        name: Product name, title, or product code
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."
    img = p.get("imageUrl")
    if not img:
        return f"No image available for {p['title']}."
    return f"Image URL for {p['title']}: {img}"


@mcp.tool()
def get_colorways(name: str) -> str:
    """
    List all available color variants (colorways) for a Nike shoe.

    Args:
        name: Product name, title, or product code
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    colorways = store.get_colorways_for(p)
    if not colorways:
        return f"{p['title']} has only one colorway: {p.get('colorDescription', 'N/A')}."

    lines = [f"Colorways for {p['title']} ({len(colorways)} variants):\n"]
    for cw in colorways:
        sale_note = " [Sale]" if cw.get("isOnSale") else ""
        lines.append(
            f"  • {cw.get('colorDescription', 'N/A')} ({cw.get('simpleColor', 'N/A')})"
            f"  —  £{cw.get('currentPrice', 0):.2f}{sale_note}"
        )
        if cw.get("productUrl"):
            lines.append(f"    {cw['productUrl']}")
    return "\n".join(lines)


@mcp.tool()
def filter_products(
    min_price: float = 0.0,
    max_price: float = 99999.0,
    color: str = "",
    on_sale_only: bool = False,
    customizable_only: bool = False,
) -> str:
    """
    Filter Nike shoe products by price range, color, sale status, or customizability.

    Args:
        min_price:          Minimum price in GBP (default 0)
        max_price:          Maximum price in GBP (default no limit)
        color:              Filter by simple color — e.g. "White", "Black", "Red", "Grey" (empty = any)
        on_sale_only:       If true, only return products currently on sale
        customizable_only:  If true, only return Nike By You customizable products
    """
    results = store.filter_products(
        min_price=min_price,
        max_price=max_price,
        color=color.strip() or None,
        on_sale_only=on_sale_only,
        customizable_only=customizable_only,
    )
    if not results:
        return "No products match the given filters."

    lines = [f"Filtered results ({len(results)} products):\n"]
    for p in results:
        sale = " [Sale]" if p.get("isOnSale") else ""
        lines.append(
            f"  • {p['title']} ({p.get('simpleColor', 'N/A')})  —  {p['price']}{sale}"
        )
    return "\n".join(lines)


@mcp.tool()
def compare_products(names: list[str]) -> str:
    """
    Compare two or more Nike shoe products side-by-side: price, color, sale status, colorways.

    Args:
        names: List of product names or titles (e.g. ["Nike Air Force 1 '07", "Nike Dunk Low"])
    """
    result = store.compare_products(names)
    if "error" in result:
        return result["error"]

    product_names = result["products"]
    col = 32

    def row(label: str, values: dict) -> str:
        return f"{label:<28}" + "".join(f"{str(values.get(n, '—'))[:col-1]:<{col}}" for n in product_names)

    lines = [
        "Product Comparison\n",
        f"{'':28}" + "".join(f"{n[:col-1]:<{col}}" for n in product_names),
        row("Brand", result["brand"]),
        row("Category", result["category"]),
        row("Gender", result["gender"]),
        row("Color", result["color"]),
        row("Color Description", result["color_description"]),
        row("Current Price", result["current_price"]),
        row("Full Price", result["full_price"]),
        row("On Sale", result["on_sale"]),
        row("Discount", result["discount"]),
        row("Total Colorways", result["total_colorways"]),
        row("Customizable", result["customizable"]),
        "-" * (28 + col * len(product_names)),
    ]

    lines.append("\nProduct Images:")
    for name, url in result.get("image_urls", {}).items():
        lines.append(f"  {name}: {url or 'N/A'}")

    lines.append("\nProduct URLs:")
    for name, url in result.get("product_urls", {}).items():
        lines.append(f"  {name}: {url or 'N/A'}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Catalog metadata tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_colors() -> str:
    """List all available shoe colors in the Nike catalog."""
    colors = store.get_unique_colors()
    return "Available colors:\n" + "\n".join(f"  • {c}" for c in colors)


@mcp.tool()
def get_sale_items() -> str:
    """List all Nike shoe products that are currently on sale."""
    products = store.get_sale_products()
    if not products:
        return "No products currently on sale."
    lines = [f"Sale items ({len(products)} products):\n"]
    for p in products:
        discount = f" ({p.get('discountPercent', 0)}% off)" if p.get("discountPercent") else ""
        lines.append(
            f"  • {p['title']} ({p.get('simpleColor', 'N/A')})  —  {p['price']}{discount}"
        )
    return "\n".join(lines)


@mcp.tool()
def get_customizable_items() -> str:
    """List all Nike By You customizable shoe products."""
    products = store.get_customizable_products()
    if not products:
        return "No customizable products found."
    lines = [f"Customizable (Nike By You) products ({len(products)} products):\n"]
    for p in products:
        lines.append(
            f"  • {p['title']} ({p.get('simpleColor', 'N/A')})  —  {p['price']}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Cart tools  (in-memory, per-server-session)
# ---------------------------------------------------------------------------


@mcp.tool()
def add_to_cart(name: str, quantity: int = 1) -> str:
    """
    Add a Nike shoe to the shopping cart.

    Args:
        name:     Product name, title, or product code
        quantity: Number of pairs (default 1)
    """
    if quantity < 1:
        return "Quantity must be at least 1."

    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    price_val = store._effective_price(p)
    price_str = store._format_price(p)

    item = cart.add_item(
        name=p["title"],
        price=price_val,
        price_str=price_str,
        quantity=quantity,
    )
    return (
        f"Added {item.quantity}x {p['title']} to your cart. "
        f"Unit price: {price_str}."
    )


@mcp.tool()
def remove_from_cart(name: str) -> str:
    """
    Remove a shoe from the shopping cart entirely.

    Args:
        name: Product title as shown in the cart (partial match supported)
    """
    removed = cart.remove_item(name)
    if not removed:
        for item in cart.get_cart():
            if name.lower() in item.name.lower():
                cart.remove_item(item.name)
                return f"Removed {item.name} from your cart."
        return f"'{name}' was not found in your cart."
    return f"Removed '{name}' from your cart."


@mcp.tool()
def update_cart_quantity(name: str, quantity: int) -> str:
    """
    Update the quantity of a cart item. Set quantity to 0 to remove it.

    Args:
        name:     Product name (partial match)
        quantity: New quantity (0 to remove)
    """
    for item in cart.get_cart():
        if name.lower() in item.name.lower():
            cart.update_quantity(item.name, quantity)
            if quantity == 0:
                return f"Removed {item.name} from your cart."
            return f"Updated {item.name} quantity to {quantity}."
    return f"'{name}' not found in your cart."


@mcp.tool()
def view_cart() -> str:
    """Show all items currently in the shopping cart with subtotals and a grand total."""
    items = cart.get_cart()
    if not items:
        return "Your cart is empty."

    lines = ["Your Cart:\n"]
    for item in items:
        subtotal = item.price * item.quantity
        lines.append(
            f"  • {item.name}  ×{item.quantity}  "
            f"@ {item.price_str}  =  £{subtotal:,.2f}"
        )
    lines.append(f"\n  Total: £{cart.cart_total():,.2f} GBP")
    return "\n".join(lines)


@mcp.tool()
def checkout() -> str:
    """
    Process the order for all items in the shopping cart.
    Clears the cart and returns a purchase confirmation with product links.
    """
    items = cart.get_cart()
    if not items:
        return "Your cart is empty — nothing to checkout."

    order_lines = []
    product_links = []

    for item in items:
        subtotal = item.price * item.quantity
        order_lines.append(f"  • {item.name}  ×{item.quantity}  £{subtotal:,.2f}")
        p = store.find_product(item.name)
        if p and p.get("productUrl"):
            product_links.append(f"  Buy {item.name}: {p['productUrl']}")

    total = cart.cart_total()
    cart.clear()

    result = (
        "Order Confirmed!\n\n"
        "Items:\n" + "\n".join(order_lines) +
        f"\n\nTotal: £{total:,.2f} GBP\n"
        "Your Nike shoes will be dispatched within 3–5 business days.\n"
    )
    if product_links:
        result += "\nPurchase links:\n" + "\n".join(product_links)

    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="stdio")

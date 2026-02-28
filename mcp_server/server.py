"""
NVIDIA GPU Store — MCP Server (backed by nvidia-catalog/catalog.json)

86 real products · RTX 3060 – RTX 5090 · ASUS / GIGABYTE / MSI / NVIDIA / PNY / ZOTAC

Run with:
    uv run python -m mcp_server.server

MCP client config:
    {
      "mcpServers": {
        "nvidia-store": {
          "command": "uv",
          "args": ["run", "python", "-m", "mcp_server.server"],
          "cwd": "/path/to/Adgent"
        }
      }
    }
"""

import json
from mcp.server.fastmcp import FastMCP
from . import store, cart

mcp = FastMCP(
    "NVIDIA GPU Store",
    instructions=(
        "You are a helpful GPU shopping assistant. Use the available tools to help "
        "users find, compare, and purchase NVIDIA graphics cards. The catalog contains "
        "86 real products from ASUS, GIGABYTE, MSI, NVIDIA, PNY, and ZOTAC. "
        "Products have real image URLs, retailer links, and live availability data. "
        "Always check availability before recommending a purchase."
    ),
)


# ---------------------------------------------------------------------------
# Discovery tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_products() -> str:
    """List all GPU products in the catalog with name, GPU model, price, brand, and availability."""
    products = store.get_all_products()
    lines = [f"NVIDIA GPU Catalog ({len(products)} products):\n"]
    for p in products:
        avail = "✓ In stock" if p.get("isAvailable") else "✗ Out of stock"
        badge = " [Best Seller]" if p.get("isBestSeller") else ""
        offer = " [Deal]" if p.get("hasActiveOffer") else ""
        lines.append(
            f"  • {p['displayName']} ({p['brand']})  —  {p['price']}  —  {avail}{badge}{offer}"
        )
    return "\n".join(lines)


@mcp.tool()
def search_products(query: str) -> str:
    """
    Search GPU products by keyword across title, brand, GPU model, specs, and offer text.

    Args:
        query: e.g. "RTX 5090", "ASUS", "16GB", "Resident Evil", "Founder"
    """
    results = store.search_products(query)
    if not results:
        return f"No products found for '{query}'."
    lines = [f"Search results for '{query}' ({len(results)} found):\n"]
    for p in results:
        avail = "✓" if p.get("isAvailable") else "✗"
        lines.append(
            f"  {avail} {p['displayName']} ({p['brand']})  —  {p['price']}"
        )
    return "\n".join(lines)


@mcp.tool()
def get_product_details(name: str) -> str:
    """
    Get full details for a GPU: title, brand, GPU model, pricing, specs, image URL,
    active offers, and marketplace link.

    Args:
        name: Product name, display name, SKU, or GPU model (e.g. "NVIDIA RTX 5090",
              "ASUS RTX 5080", "RTX 5070 Ti")
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found. Try list_products() or search_products()."

    avail_str = "✓ Available — Buy Now" if p.get("isAvailable") else "✗ Out of Stock"
    lines = [
        f"## {p['title']}",
        f"**Display Name:** {p['displayName']}",
        f"**Brand:** {p['brand']}",
        f"**GPU Model:** {p['gpu']}",
        f"**SKU:** {p['sku']}",
        f"",
        f"**MSRP:** ${p['msrp']:.2f}" if p.get("msrp") else "",
        f"**List Price:** ${p['listPrice']:.2f}" if p.get("listPrice") else "",
        f"**Lowest Retail Price:** ${p['lowestRetailPrice']:.2f}" if p.get("lowestRetailPrice") else "",
        f"**Availability:** {avail_str}",
    ]

    if p.get("isBestSeller"):
        lines.append("🏆 **Best Seller**")
    if p.get("isFeatured"):
        lines.append("⭐ **Featured Product**")
    if p.get("isFounderEdition"):
        lines.append("🎖️ **NVIDIA Founder's Edition**")

    if p.get("hasActiveOffer"):
        lines.append(f"\n🎁 **Active Offer:** {p.get('offerText', '')}")

    specs = p.get("specs") or {}
    if specs:
        lines.append("\n**Specs:**")
        for k, v in specs.items():
            pretty_key = k.replace("_", " ").title()
            lines.append(f"  {pretty_key}: {v}")

    if p.get("imageUrl"):
        lines.append(f"\n**Product Image:** {p['imageUrl']}")

    if p.get("marketplaceUrl"):
        lines.append(f"**Marketplace URL:** {p['marketplaceUrl']}")

    retailers = store.get_retailers_for(p)
    if retailers:
        lines.append(f"\n**Available at {len(retailers)} retailer(s):**")
        for r in retailers:
            r_avail = "✓" if r.get("isAvailable") else "✗"
            price_str = f"${r['price']:.2f}" if r.get("price") else "N/A"
            lines.append(f"  {r_avail} {r['name']}  —  {price_str}")

    return "\n".join(l for l in lines if l is not None)


@mcp.tool()
def get_product_specs(name: str) -> str:
    """
    Get the technical specifications for a GPU product.

    Args:
        name: Product name, display name, or GPU model
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    specs = p.get("specs") or {}
    if not specs:
        return f"{p['displayName']} has no detailed spec data in the catalog."

    lines = [f"Specs for {p['displayName']} ({p['brand']}):\n"]
    for k, v in specs.items():
        pretty_key = k.replace("_", " ").title()
        lines.append(f"  {pretty_key}: {v}")
    return "\n".join(lines)


@mcp.tool()
def get_product_image(name: str) -> str:
    """
    Get the product image URL for a GPU. Use this to show the user a visual of the card.

    Args:
        name: Product name, display name, or GPU model
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."
    img = p.get("imageUrl")
    if not img:
        return f"No image available for {p['displayName']}."
    return f"Image URL for {p['displayName']}: {img}"


@mcp.tool()
def filter_products(
    min_price: float = 0.0,
    max_price: float = 99999.0,
    brand: str = "",
    gpu_model: str = "",
    in_stock_only: bool = False,
    best_sellers_only: bool = False,
    with_offers_only: bool = False,
) -> str:
    """
    Filter GPU products by price range, brand, GPU model, stock, or deal status.

    Args:
        min_price:        Minimum price in USD (default 0)
        max_price:        Maximum price in USD (default no limit)
        brand:            Filter by brand — ASUS, GIGABYTE, MSI, NVIDIA, PNY, ZOTAC (empty = any)
        gpu_model:        Filter by GPU family — e.g. "RTX 5090", "RTX 5080", "RTX 5070" (empty = any)
        in_stock_only:    If true, only return currently available products
        best_sellers_only: If true, only return best-seller products
        with_offers_only: If true, only return products with an active deal/bundle offer
    """
    results = store.filter_products(
        min_price=min_price,
        max_price=max_price,
        brand=brand.strip() or None,
        gpu_model=gpu_model.strip() or None,
        in_stock_only=in_stock_only,
        best_sellers_only=best_sellers_only,
        with_offers_only=with_offers_only,
    )
    if not results:
        return "No products match the given filters."

    lines = [f"Filtered results ({len(results)} products):\n"]
    for p in results:
        avail = "✓" if p.get("isAvailable") else "✗"
        offer = " [Deal]" if p.get("hasActiveOffer") else ""
        lines.append(
            f"  {avail} {p['displayName']} ({p['brand']})  —  {p['price']}{offer}"
        )
    return "\n".join(lines)


@mcp.tool()
def compare_products(names: list[str]) -> str:
    """
    Compare two or more GPU products side-by-side: brand, GPU model, pricing, specs, availability.

    Args:
        names: List of product names or display names (e.g. ["NVIDIA RTX 5090", "ASUS RTX 5080"])
    """
    result = store.compare_products(names)
    if "error" in result:
        return result["error"]

    product_names = result["products"]
    col = 28

    def row(label: str, values: dict) -> str:
        return f"{label:<32}" + "".join(f"{str(values.get(n, '—'))[:col-1]:<{col}}" for n in product_names)

    lines = [
        "Product Comparison\n",
        f"{'':32}" + "".join(f"{n[:col-1]:<{col}}" for n in product_names),
        row("Brand", result["brand"]),
        row("GPU Model", result["gpu_model"]),
        row("MSRP", result["msrp"]),
        row("List Price", result["list_price"]),
        row("Availability", result["availability"]),
        "-" * (32 + col * len(product_names)),
    ]
    for spec_key, values in result["specs"].items():
        pretty = spec_key.replace("_", " ").title()
        lines.append(row(pretty, values))

    lines.append("\nProduct Images:")
    for name, url in result.get("image_urls", {}).items():
        lines.append(f"  {name}: {url or 'N/A'}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Availability & retailer tools
# ---------------------------------------------------------------------------


@mcp.tool()
def check_availability(name: str) -> str:
    """
    Check real-time availability for a GPU product across all retailers.

    Args:
        name: Product name, display name, or GPU model
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    overall = p.get("availability", "unknown")
    lines = [
        f"{p['displayName']} ({p['brand']})",
        f"Overall status: {'✓ Available' if p.get('isAvailable') else '✗ Out of Stock'} ({overall})",
    ]

    retailers = store.get_retailers_for(p)
    if not retailers:
        lines.append("No retailer data available.")
        return "\n".join(lines)

    lines.append(f"\nRetailer availability ({len(retailers)} retailer(s)):")
    for r in retailers:
        avail = "✓ In Stock" if r.get("isAvailable") else "✗ Out of Stock"
        price_str = f"${r['price']:.2f}" if r.get("price") else "N/A"
        lines.append(f"  {avail}  {r['name']}  —  {price_str}")

    cheapest = store.find_cheapest_retailer(p)
    if cheapest:
        lines.append(
            f"\n💰 Best price: {cheapest['name']} at ${cheapest['price']:.2f}"
        )
        if cheapest.get("purchaseLink"):
            lines.append(f"   Link: {cheapest['purchaseLink']}")

    return "\n".join(lines)


@mcp.tool()
def get_retailers(name: str) -> str:
    """
    List all retailers stocking a GPU product with their prices and purchase links.

    Args:
        name: Product name, display name, or GPU model
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    retailers = store.get_retailers_for(p)
    if not retailers:
        return f"No retailer data for {p['displayName']}."

    lines = [f"Retailers for {p['displayName']}:\n"]
    for r in retailers:
        avail = "✓ Available" if r.get("isAvailable") else "✗ Unavailable"
        price_str = f"${r['price']:.2f}" if r.get("price") else "N/A"
        link = r.get("purchaseLink") or r.get("directPurchaseLink") or "N/A"
        lines.append(f"  {avail}  {r['name']}")
        lines.append(f"    Price: {price_str}")
        lines.append(f"    Link:  {link}")
    return "\n".join(lines)


@mcp.tool()
def find_cheapest(name: str) -> str:
    """
    Find the cheapest available retailer for a GPU product.

    Args:
        name: Product name, display name, or GPU model
    """
    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    cheapest = store.find_cheapest_retailer(p)
    if not cheapest:
        return f"{p['displayName']} is currently unavailable at all tracked retailers."

    link = cheapest.get("purchaseLink") or cheapest.get("directPurchaseLink") or "N/A"
    return (
        f"Cheapest available price for {p['displayName']}:\n"
        f"  Retailer: {cheapest['name']}\n"
        f"  Price:    ${cheapest['price']:.2f}\n"
        f"  Link:     {link}"
    )


# ---------------------------------------------------------------------------
# Catalog metadata tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_brands() -> str:
    """List all GPU brands available in the catalog."""
    brands = store.get_unique_brands()
    return "Available brands:\n" + "\n".join(f"  • {b}" for b in brands)


@mcp.tool()
def list_gpu_models() -> str:
    """List all GPU model families available in the catalog."""
    models = store.get_unique_gpu_models()
    return "Available GPU models:\n" + "\n".join(f"  • {m}" for m in models)


@mcp.tool()
def get_current_offers() -> str:
    """List all GPU products that currently have an active promotional offer or game bundle."""
    offers = store.get_current_offers()
    if not offers:
        return "No active offers at the moment."
    lines = [f"Active offers ({len(offers)} products):\n"]
    for p in offers:
        avail = "✓" if p.get("isAvailable") else "✗"
        lines.append(
            f"  {avail} {p['displayName']} ({p['brand']})  —  {p['price']}"
        )
        if p.get("offerText"):
            lines.append(f"    🎁 {p['offerText']}")
    return "\n".join(lines)


@mcp.tool()
def get_best_sellers() -> str:
    """List all best-seller GPU products in the catalog."""
    products = store.get_best_sellers()
    if not products:
        return "No best sellers found."
    lines = [f"Best Sellers ({len(products)} products):\n"]
    for p in products:
        avail = "✓" if p.get("isAvailable") else "✗"
        lines.append(f"  {avail} {p['displayName']} ({p['brand']})  —  {p['price']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Cart tools  (in-memory, per-server-session)
# ---------------------------------------------------------------------------


@mcp.tool()
def add_to_cart(name: str, quantity: int = 1) -> str:
    """
    Add a GPU product to the shopping cart.

    Args:
        name:     Product name, display name, or GPU model
        quantity: Number of units (default 1)
    """
    if quantity < 1:
        return "Quantity must be at least 1."

    p = store.find_product(name)
    if not p:
        return f"Product '{name}' not found."

    if not p.get("isAvailable"):
        cheapest = store.find_cheapest_retailer(p)
        if not cheapest:
            return (
                f"{p['displayName']} is currently out of stock at all retailers. "
                "You can still add it to your cart to track it."
            )

    cheapest = store.find_cheapest_retailer(p)
    price_val = (
        cheapest["price"]
        if cheapest
        else (p.get("lowestRetailPrice") or p.get("listPrice") or p.get("msrp") or 0.0)
    )
    price_str = f"${price_val:.2f}"

    item = cart.add_item(
        name=p["displayName"],
        price=price_val,
        price_str=price_str,
        quantity=quantity,
    )
    avail_note = "" if p.get("isAvailable") else " (currently out of stock — added for tracking)"
    return (
        f"Added {item.quantity}x {p['displayName']} to your cart{avail_note}. "
        f"Unit price: {price_str}."
    )


@mcp.tool()
def remove_from_cart(name: str) -> str:
    """
    Remove a product from the shopping cart entirely.

    Args:
        name: Product display name as shown in the cart (partial match supported)
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
            f"@ {item.price_str}  =  ${subtotal:,.2f}"
        )
    lines.append(f"\n  Total: ${cart.cart_total():,.2f}")
    return "\n".join(lines)


@mcp.tool()
def checkout() -> str:
    """
    Process the order for all items in the shopping cart.
    Clears the cart and returns a purchase confirmation with retailer links where available.
    """
    items = cart.get_cart()
    if not items:
        return "Your cart is empty — nothing to checkout."

    order_lines = []
    retailer_links = []

    for item in items:
        subtotal = item.price * item.quantity
        order_lines.append(f"  • {item.name}  ×{item.quantity}  ${subtotal:,.2f}")
        # Lookup retailer link
        p = store.find_product(item.name)
        if p:
            cheapest = store.find_cheapest_retailer(p)
            if cheapest and cheapest.get("purchaseLink"):
                retailer_links.append(f"  Buy {item.name}: {cheapest['purchaseLink']}")
            elif p.get("marketplaceUrl"):
                retailer_links.append(f"  View {item.name}: {p['marketplaceUrl']}")

    total = cart.cart_total()
    cart.clear()

    result = (
        "Order Confirmed!\n\n"
        "Items:\n" + "\n".join(order_lines) +
        f"\n\nTotal: ${total:,.2f}\n"
        "Your GPUs will be dispatched within 1–3 business days.\n"
    )
    if retailer_links:
        result += "\nPurchase links:\n" + "\n".join(retailer_links)

    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="stdio")

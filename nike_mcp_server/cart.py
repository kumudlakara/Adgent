"""
In-memory shopping cart. State is per-process (resets on server restart).
"""

from dataclasses import dataclass


@dataclass
class CartItem:
    name: str
    price: float       # numeric, e.g. 119.99
    price_str: str     # formatted, e.g. "£119.99 GBP"
    quantity: int


_cart: dict[str, CartItem] = {}


def add_item(name: str, price: float, price_str: str, quantity: int = 1) -> CartItem:
    if name in _cart:
        _cart[name].quantity += quantity
    else:
        _cart[name] = CartItem(name=name, price=price, price_str=price_str, quantity=quantity)
    return _cart[name]


def remove_item(name: str) -> bool:
    if name in _cart:
        del _cart[name]
        return True
    return False


def update_quantity(name: str, quantity: int) -> bool:
    if name not in _cart:
        return False
    if quantity <= 0:
        del _cart[name]
    else:
        _cart[name].quantity = quantity
    return True


def get_cart() -> list[CartItem]:
    return list(_cart.values())


def cart_total() -> float:
    return sum(item.price * item.quantity for item in _cart.values())


def clear() -> None:
    _cart.clear()


def is_empty() -> bool:
    return len(_cart) == 0

"""演示数据：与 java/shop-api 的 DemoDataSeeder 完全一致。"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from shop.product.models import Product

DEMO_PRODUCTS: tuple[tuple[str, str, Decimal, int], ...] = (
    ("SKU-001", "机械键盘", Decimal("599.00"), 20),
    ("SKU-002", "人体工学椅", Decimal("1299.00"), 5),
    ("SKU-003", "限量版鼠标", Decimal("399.00"), 2),
)


def seed_demo_products(session: Session) -> int:
    """只在空表时插入，重复启动不会产生重复数据。返回插入条数。"""
    if session.scalar(select(Product.id).limit(1)) is not None:
        return 0
    session.add_all(
        Product(sku=sku, name=name, price=price, stock=stock)
        for sku, name, price, stock in DEMO_PRODUCTS
    )
    session.commit()
    return len(DEMO_PRODUCTS)

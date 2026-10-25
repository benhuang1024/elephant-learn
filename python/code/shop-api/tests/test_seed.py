from fastapi import FastAPI
from sqlalchemy import select

from shop.product.models import Product
from shop.seed import DEMO_PRODUCTS, seed_demo_products


def test_seed_is_idempotent(app: FastAPI) -> None:
    with app.state.db.session_factory() as session:
        assert seed_demo_products(session) == len(DEMO_PRODUCTS)
        assert seed_demo_products(session) == 0
        products = session.scalars(select(Product).order_by(Product.sku)).all()

    assert [product.sku for product in products] == ["SKU-001", "SKU-002", "SKU-003"]
    assert [product.stock for product in products] == [20, 5, 2]

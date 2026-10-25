from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shop.config import Settings
from shop.db import Base
from shop.main import create_app
from shop.product.models import Product

ADMIN = ("admin", "admin123")
CUSTOMER = ("customer", "customer123")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        db_url=f"sqlite+pysqlite:///{tmp_path / 'test.sqlite3'}",
        environment="test",
        seed_demo_data=False,
    )


@pytest.fixture
def app(settings: Settings) -> Iterator[FastAPI]:
    application = create_app(settings)
    Base.metadata.create_all(application.state.db.engine)
    yield application
    application.state.db.dispose()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def product_ids(app: FastAPI) -> list[int]:
    """与 java/shop-api 的演示数据一致：SKU-003 只剩 2 件，方便演示库存不足。"""
    with app.state.db.session_factory() as session:
        products = [
            Product(sku="SKU-001", name="机械键盘", price=Decimal("599.00"), stock=20),
            Product(sku="SKU-002", name="人体工学椅", price=Decimal("1299.00"), stock=5),
            Product(sku="SKU-003", name="限量版鼠标", price=Decimal("399.00"), stock=2),
        ]
        session.add_all(products)
        session.commit()
        return [product.id for product in products]


@pytest.fixture
def session(app: FastAPI) -> Iterator[Session]:
    with app.state.db.session_factory() as db_session:
        yield db_session

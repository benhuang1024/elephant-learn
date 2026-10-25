from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from catalog.models import Product


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def customer(db: Any) -> Any:
    return get_user_model().objects.create_user(username="customer", password="customer123")


@pytest.fixture
def admin_user(db: Any) -> Any:
    return get_user_model().objects.create_superuser(
        username="admin", email="admin@example.com", password="admin123"
    )


@pytest.fixture
def products(db: Any) -> Iterator[list[Product]]:
    created = [
        Product.objects.create(
            sku="SKU-001", name="机械键盘", price=Decimal("599.00"), stock=20
        ),
        Product.objects.create(
            sku="SKU-002", name="人体工学椅", price=Decimal("1299.00"), stock=5
        ),
        Product.objects.create(
            sku="SKU-003", name="限量版鼠标", price=Decimal("399.00"), stock=2
        ),
    ]
    yield created

from typing import Any

from django.contrib.admin.sites import site
from django.core.management import call_command
from django.test import Client

from catalog.models import Product


def test_product_is_registered_in_admin() -> None:
    assert site.is_registered(Product)


def test_admin_changelist_requires_staff(admin_user: Any) -> None:
    client = Client()
    assert client.get("/admin/catalog/product/").status_code == 302

    client.force_login(admin_user)
    response = client.get("/admin/catalog/product/")
    assert response.status_code == 200
    assert "Products" in response.content.decode() or "商品" in response.content.decode()


def test_admin_changelist_lists_products(admin_user: Any, products: list[Product]) -> None:
    client = Client()
    client.force_login(admin_user)
    response = client.get("/admin/catalog/product/")
    assert response.status_code == 200
    assert "SKU-001" in response.content.decode()


def test_seed_demo_is_idempotent(db: Any) -> None:
    call_command("seed_demo")
    call_command("seed_demo")

    assert Product.objects.count() == 3
    assert Product.objects.get(sku="SKU-001").stock == 20

    from django.contrib.auth import get_user_model

    user_model = get_user_model()
    admin = user_model.objects.get(username="admin")
    customer = user_model.objects.get(username="customer")
    assert admin.is_superuser and admin.is_staff
    assert admin.check_password("admin123")
    assert customer.check_password("customer123")

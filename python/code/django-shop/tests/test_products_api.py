from typing import Any

from rest_framework.test import APIClient


def test_health(api: APIClient) -> None:
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "UP"}


def test_list_is_public(api: APIClient, products: list[Any]) -> None:
    response = api.get("/api/products")
    assert response.status_code == 200
    assert {item["sku"] for item in response.json()} == {"SKU-001", "SKU-002", "SKU-003"}


def test_search_by_name(api: APIClient, products: list[Any]) -> None:
    response = api.get("/api/products", {"q": "键盘"})
    assert [item["sku"] for item in response.json()] == ["SKU-001"]


def test_create_requires_authentication(api: APIClient) -> None:
    response = api.post(
        "/api/products",
        {"sku": "SKU-100", "name": "显示器", "price": "1999.00", "stock": 3},
        format="json",
    )
    assert response.status_code == 401
    assert response["WWW-Authenticate"].startswith("Basic")


def test_create_and_update(api: APIClient, customer: Any) -> None:
    api.force_authenticate(user=customer)
    created = api.post(
        "/api/products",
        {"sku": "SKU-100", "name": "显示器", "price": "1999.00", "stock": 3},
        format="json",
    )
    assert created.status_code == 201
    # DRF 默认把 Decimal 序列化成字符串，避免 JS 精度问题
    assert created.json()["price"] == "1999.00"
    product_id = created.json()["id"]

    updated = api.patch(
        f"/api/products/{product_id}",
        {"stock": 8},
        format="json",
    )
    assert updated.status_code == 200
    assert updated.json()["stock"] == 8


def test_duplicate_sku_and_validation(api: APIClient, customer: Any, products: list[Any]) -> None:
    api.force_authenticate(user=customer)
    duplicate = api.post(
        "/api/products",
        {"sku": "SKU-001", "name": "重复", "price": "1.00", "stock": 1},
        format="json",
    )
    assert duplicate.status_code == 400
    assert "sku" in duplicate.json()

    invalid = api.post(
        "/api/products",
        {"sku": "SKU-200", "name": "", "price": "-1.00", "stock": 1},
        format="json",
    )
    assert invalid.status_code == 400
    assert set(invalid.json()) == {"name", "price"}


def test_delete_requires_admin(api: APIClient, customer: Any, admin_user: Any) -> None:
    api.force_authenticate(user=customer)
    assert api.delete("/api/products/999").status_code == 403

    api.force_authenticate(user=admin_user)
    assert api.delete("/api/products/999").status_code == 404

    created = api.post(
        "/api/products",
        {"sku": "SKU-300", "name": "待删除", "price": "1.00", "stock": 1},
        format="json",
    )
    assert created.status_code == 201
    deleted = api.delete(f"/api/products/{created.json()['id']}")
    assert deleted.status_code == 204


def test_missing_product_returns_404(api: APIClient, db: Any) -> None:
    assert api.get("/api/products/999").status_code == 404

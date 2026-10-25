from fastapi import FastAPI
from fastapi.testclient import TestClient

from shop.config import get_app_settings
from tests.conftest import ADMIN, CUSTOMER


def place_order(
    client: TestClient,
    product_id: int,
    quantity: int,
    *,
    customer: str = "ben",
) -> dict[str, object]:
    response = client.post(
        "/api/orders",
        auth=CUSTOMER,
        json={"customerName": customer, "items": [{"productId": product_id, "quantity": quantity}]},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_place_order_deducts_stock_and_bumps_version(
    client: TestClient, product_ids: list[int]
) -> None:
    product_id = product_ids[0]
    body = place_order(client, product_id, 2)

    assert body["customerName"] == "ben"
    assert body["status"] == "PENDING"
    assert body["total"] == 1198.0
    assert body["version"] == 0
    items = body["items"]
    assert isinstance(items, list)
    assert items[0] == {
        "productId": product_id,
        "sku": "SKU-001",
        "unitPrice": 599.0,
        "quantity": 2,
        "subtotal": 1198.0,
    }

    product = client.get(f"/api/products/{product_id}").json()
    assert product["stock"] == 18
    assert product["version"] == 1

    fetched = client.get(f"/api/orders/{body['id']}", auth=CUSTOMER)
    assert fetched.status_code == 200
    assert fetched.json()["total"] == 1198.0

    listed = client.get("/api/orders", auth=CUSTOMER)
    assert listed.status_code == 200
    assert [order["id"] for order in listed.json()] == [body["id"]]


def test_order_endpoints_require_authentication(
    client: TestClient, product_ids: list[int]
) -> None:
    assert client.get("/api/orders").status_code == 401
    response = client.post(
        "/api/orders",
        json={"customerName": "ben", "items": [{"productId": product_ids[0], "quantity": 1}]},
    )
    assert response.status_code == 401


def test_insufficient_stock_returns_problem_json(
    client: TestClient, product_ids: list[int]
) -> None:
    product_id = product_ids[2]  # SKU-003 库存 2
    response = client.post(
        "/api/orders",
        auth=CUSTOMER,
        json={"customerName": "ben", "items": [{"productId": product_id, "quantity": 3}]},
    )
    assert response.status_code == 409
    assert response.headers["Content-Type"].startswith("application/problem+json")
    problem = response.json()
    assert problem["title"] == "库存不足"
    assert problem["sku"] == "SKU-003"
    assert problem["requested"] == 3
    assert problem["available"] == 2

    product = client.get(f"/api/products/{product_id}").json()
    assert product["stock"] == 2
    assert product["version"] == 0
    assert client.get("/api/orders", auth=CUSTOMER).json() == []


def test_unknown_product_returns_404(client: TestClient, product_ids: list[int]) -> None:
    response = client.post(
        "/api/orders",
        auth=CUSTOMER,
        json={"customerName": "ben", "items": [{"productId": 9999, "quantity": 1}]},
    )
    assert response.status_code == 404


def test_quantity_validation(client: TestClient, product_ids: list[int]) -> None:
    response = client.post(
        "/api/orders",
        auth=CUSTOMER,
        json={"customerName": "ben", "items": [{"productId": product_ids[0], "quantity": 0}]},
    )
    assert response.status_code == 400
    assert "items.0.quantity" in response.json()["errors"]


def test_empty_items_validation(client: TestClient) -> None:
    response = client.post(
        "/api/orders",
        auth=ADMIN,
        json={"customerName": "ben", "items": []},
    )
    assert response.status_code == 400
    assert "items" in response.json()["errors"]


def test_dependency_override_changes_business_limit(
    client: TestClient, app: FastAPI, product_ids: list[int]
) -> None:
    """测试用 dependency_overrides 替换 Settings，验证「最多 N 行」的可配置边界。"""

    def one_item_limit() -> object:
        return app.state.settings.model_copy(update={"max_order_items": 1})

    app.dependency_overrides[get_app_settings] = one_item_limit
    try:
        response = client.post(
            "/api/orders",
            auth=CUSTOMER,
            json={
                "customerName": "ben",
                "items": [
                    {"productId": product_ids[0], "quantity": 1},
                    {"productId": product_ids[1], "quantity": 1},
                ],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "最多 1 个商品行" in response.json()["detail"]

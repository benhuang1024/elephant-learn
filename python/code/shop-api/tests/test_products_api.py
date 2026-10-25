from fastapi.testclient import TestClient

from tests.conftest import ADMIN, CUSTOMER


def test_health_is_public_and_reports_up(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "UP"}
    assert response.headers["X-Request-Id"]
    assert int(response.headers["X-Elapsed-Ms"]) >= 0


def test_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "trace-abc-123"})
    assert response.headers["X-Request-Id"] == "trace-abc-123"


def test_malformed_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "x" * 200})
    assert response.headers["X-Request-Id"] != "x" * 200
    assert len(response.headers["X-Request-Id"]) == 32


def test_list_is_empty_before_seed(client: TestClient) -> None:
    response = client.get("/api/products")
    assert response.status_code == 200
    assert response.json() == []


def test_search_by_name(client: TestClient, product_ids: list[int]) -> None:
    assert len(client.get("/api/products").json()) == 3
    found = client.get("/api/products", params={"q": "键盘"}).json()
    assert [item["sku"] for item in found] == ["SKU-001"]
    assert client.get("/api/products", params={"q": "不存在"}).json() == []


def test_create_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/products",
        json={"sku": "SKU-100", "name": "显示器", "price": 1999.0, "stock": 3},
    )
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"].startswith("Basic")
    assert response.headers["Content-Type"].startswith("application/problem+json")
    assert response.json()["title"] == "未认证"


def test_create_and_fetch(client: TestClient) -> None:
    created = client.post(
        "/api/products",
        auth=ADMIN,
        json={"sku": "SKU-100", "name": "显示器", "price": 1999.0, "stock": 3},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["sku"] == "SKU-100"
    assert body["price"] == 1999.0
    assert body["version"] == 0
    assert created.headers["Location"] == f"/api/products/{body['id']}"

    fetched = client.get(f"/api/products/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body


def test_duplicate_sku_conflicts(client: TestClient, product_ids: list[int]) -> None:
    response = client.post(
        "/api/products",
        auth=ADMIN,
        json={"sku": "SKU-001", "name": "重复", "price": 1.0, "stock": 1},
    )
    assert response.status_code == 409
    assert response.headers["Content-Type"].startswith("application/problem+json")
    assert "已存在" in response.json()["detail"]


def test_validation_error_is_problem_json(client: TestClient) -> None:
    response = client.post(
        "/api/products",
        auth=ADMIN,
        json={"sku": "", "name": "", "price": 0, "stock": -1},
    )
    assert response.status_code == 400
    assert response.headers["Content-Type"].startswith("application/problem+json")
    errors = response.json()["errors"]
    assert set(errors) == {"sku", "name", "price", "stock"}


def test_update_uses_dirty_tracking_and_bumps_version(
    client: TestClient, product_ids: list[int]
) -> None:
    product_id = product_ids[0]
    response = client.put(
        f"/api/products/{product_id}",
        auth=CUSTOMER,
        json={"name": "机械键盘 Pro", "price": 699.0, "stock": 5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "机械键盘 Pro"
    assert body["price"] == 699.0
    assert body["version"] == 1


def test_update_missing_returns_404(client: TestClient) -> None:
    response = client.put(
        "/api/products/9999",
        auth=ADMIN,
        json={"name": "x", "price": 1.0, "stock": 1},
    )
    assert response.status_code == 404
    assert response.json()["title"] == "资源不存在"


def test_delete_requires_admin(client: TestClient, product_ids: list[int]) -> None:
    product_id = product_ids[0]
    forbidden = client.delete(f"/api/products/{product_id}", auth=CUSTOMER)
    assert forbidden.status_code == 403
    assert forbidden.json()["title"] == "无权限"

    deleted = client.delete(f"/api/products/{product_id}", auth=ADMIN)
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get(f"/api/products/{product_id}").status_code == 404

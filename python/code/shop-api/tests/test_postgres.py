"""PostgreSQL 冒烟测试：有 Docker 才跑，没有就 skip。

Testcontainers 会拉起一个真实 PostgreSQL，验证 SQLAlchemy 类型、乐观锁和事务
在 SQLite 之外同样成立。运行时间主要花在拉取 postgres:17-alpine 镜像。
"""

import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from shop.config import Settings
from shop.db import Base
from shop.main import create_app


def docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        subprocess.run(
            ["docker", "info"],
            capture_output=True,
            check=True,
            timeout=10,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False
    return True


@pytest.mark.skipif(not docker_available(), reason="Docker daemon 不可用")
def test_postgres_end_to_end() -> None:
    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer("postgres:17-alpine", driver="psycopg") as postgres:
        settings = Settings(
            db_url=postgres.get_connection_url(),
            environment="test",
            seed_demo_data=False,
        )
        application = create_app(settings)
        Base.metadata.create_all(application.state.db.engine)
        try:
            with TestClient(application) as client:
                created = client.post(
                    "/api/products",
                    auth=("admin", "admin123"),
                    json={"sku": "PG-001", "name": "PostgreSQL 键盘", "price": 9.9, "stock": 3},
                )
                assert created.status_code == 201, created.text
                product_id = created.json()["id"]

                order = client.post(
                    "/api/orders",
                    auth=("customer", "customer123"),
                    json={
                        "customerName": "ben",
                        "items": [{"productId": product_id, "quantity": 2}],
                    },
                )
                assert order.status_code == 201, order.text
                assert order.json()["total"] == 19.8

                product = client.get(f"/api/products/{product_id}").json()
                assert product["stock"] == 1
                assert product["version"] == 1
        finally:
            application.state.db.dispose()

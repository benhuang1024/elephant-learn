"""事务与并发：直接操作 Service，验证“全有或全无”和乐观锁。"""

from decimal import Decimal

import pytest
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop.errors import InsufficientStock, OptimisticLockConflict
from shop.order.models import Order
from shop.order.schemas import OrderLine, PlaceOrderRequest
from shop.order.service import OrderService
from shop.product.models import Product
from shop.product.schemas import ProductUpdate
from shop.product.service import ProductService


def test_failed_order_rolls_back_every_line(
    app: FastAPI, product_ids: list[int], session: Session
) -> None:
    service = OrderService(session, app.state.settings)
    payload = PlaceOrderRequest(
        customer_name="ben",
        items=[
            OrderLine(product_id=product_ids[0], quantity=2),  # 库存充足
            OrderLine(product_id=product_ids[2], quantity=3),  # 库存不足
        ],
    )
    with pytest.raises(InsufficientStock):
        service.place(payload)

    with app.state.db.session_factory() as check:
        assert check.scalar(select(func.count()).select_from(Order)) == 0
        first = check.get(Product, product_ids[0])
        assert first is not None
        assert first.stock == 20
        assert first.version == 0


def test_optimistic_lock_rejects_stale_update(
    app: FastAPI, product_ids: list[int]
) -> None:
    product_id = product_ids[0]
    factory = app.state.db.session_factory

    with factory() as first_session, factory() as second_session:
        first = first_session.get(Product, product_id)
        second = second_session.get(Product, product_id)
        assert first is not None and second is not None

        first.stock = 1
        first_session.commit()  # version 0 -> 1

        with pytest.raises(OptimisticLockConflict):
            ProductService(second_session).update(
                product_id,
                ProductUpdate(name="并发改名", price=Decimal("1.00"), stock=2),
            )

    with factory() as check:
        product = check.get(Product, product_id)
        assert product is not None
        assert product.stock == 1
        assert product.version == 1


def test_two_orders_cannot_oversell(
    app: FastAPI, product_ids: list[int]
) -> None:
    """两个请求都读到 stock=2：先提交者成功，后提交者撞乐观锁而不是把库存卖成负数。"""
    product_id = product_ids[2]
    factory = app.state.db.session_factory
    payload = PlaceOrderRequest(
        customer_name="ben",
        items=[OrderLine(product_id=product_id, quantity=2)],
    )

    with factory() as first_session, factory() as second_session:
        stale_product = second_session.get(Product, product_id)
        assert stale_product is not None

        OrderService(first_session, app.state.settings).place(payload)

        with pytest.raises(OptimisticLockConflict):
            OrderService(second_session, app.state.settings).place(payload)

    with factory() as check:
        product = check.get(Product, product_id)
        assert product is not None
        assert product.stock == 0
        assert check.scalar(select(func.count()).select_from(Order)) == 1

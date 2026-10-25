"""N+1 演示：默认懒加载会为每个订单再查一次 items；selectinload 固定为 2 条 SQL。"""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import FastAPI
from sqlalchemy import Engine, event, select
from sqlalchemy.orm import selectinload

from shop.order.models import Order
from shop.order.schemas import OrderLine, PlaceOrderRequest
from shop.order.service import OrderService


@contextmanager
def count_queries(engine: Engine) -> Iterator[list[str]]:
    statements: list[str] = []

    def before_cursor_execute(
        conn: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


def test_selectinload_avoids_n_plus_one(app: FastAPI, product_ids: list[int]) -> None:
    factory = app.state.db.session_factory
    with factory() as session:
        service = OrderService(session, app.state.settings)
        for _ in range(3):
            service.place(
                PlaceOrderRequest(
                    customer_name="ben",
                    items=[OrderLine(product_id=product_ids[0], quantity=1)],
                )
            )

    engine = app.state.db.engine
    with factory() as session:
        orders = session.scalars(select(Order)).all()
        with count_queries(engine) as naive:
            lengths = [len(order.items) for order in orders]
    assert lengths == [1, 1, 1]
    # 订单列表已在上方查询；这里 3 个订单各触发 1 次 items 懒加载
    assert len(naive) == 3

    with factory() as session, count_queries(engine) as eager:
        loaded = session.scalars(select(Order).options(selectinload(Order.items))).all()
        assert [len(order.items) for order in loaded] == [1, 1, 1]
    # 1 次订单列表 + 1 次 IN (...) 批量取 items
    assert len(eager) == 2

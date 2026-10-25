"""订单应用服务：整个下单流程一个事务，任一步失败都回滚。"""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.exc import StaleDataError

from shop.config import Settings
from shop.errors import BadRequest, Conflict, NotFound, OptimisticLockConflict
from shop.order.models import Order
from shop.order.schemas import PlaceOrderRequest
from shop.product.models import Product

logger = logging.getLogger(__name__)


class OrderService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def place(self, payload: PlaceOrderRequest) -> Order:
        if len(payload.items) > self.settings.max_order_items:
            raise BadRequest(f"单笔订单最多 {self.settings.max_order_items} 个商品行")

        order = Order(customer_name=payload.customer_name)
        try:
            for line in payload.items:
                product = self.session.get(Product, line.product_id)
                if product is None:
                    raise NotFound("商品", line.product_id)
                order.add_item(product, line.quantity)
            self.session.add(order)
            self.session.commit()
        except StaleDataError as exc:
            self.session.rollback()
            raise OptimisticLockConflict() from exc
        except IntegrityError as exc:
            self.session.rollback()
            raise Conflict("数据违反唯一性或外键约束") from exc
        except Exception:
            self.session.rollback()
            raise

        logger.info("下单成功 order_id=%s total=%s", order.id, order.total)
        return order

    def get(self, order_id: int) -> Order:
        statement = (
            select(Order).where(Order.id == order_id).options(selectinload(Order.items))
        )
        order = self.session.scalar(statement)
        if order is None:
            raise NotFound("订单", order_id)
        return order

    def list(self) -> list[Order]:
        """``selectinload`` 显式预加载 items：否则 N 个订单会触发 N 次额外查询（N+1）。"""
        statement = (
            select(Order)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc(), Order.id.desc())
        )
        return list(self.session.scalars(statement))

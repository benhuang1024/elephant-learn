"""商品应用服务：事务边界、业务规则与异常映射。

注意 ``update`` 里没有 ``session.save()``：对象在 Session 中，提交时由工作单元
（Unit of Work）自动检测脏字段并 UPDATE——和 JPA/Hibernate 一样，不是 Eloquent。
"""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from shop.errors import Conflict, NotFound, OptimisticLockConflict
from shop.product.models import Product
from shop.product.repository import ProductRepository
from shop.product.schemas import ProductCreate, ProductUpdate

logger = logging.getLogger(__name__)


class ProductService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.products = ProductRepository(session)

    def search(self, keyword: str | None) -> list[Product]:
        return self.products.search(keyword)

    def get(self, product_id: int) -> Product:
        product = self.products.get(product_id)
        if product is None:
            raise NotFound("商品", product_id)
        return product

    def create(self, payload: ProductCreate) -> Product:
        if self.products.get_by_sku(payload.sku) is not None:
            raise Conflict(f"SKU 已存在: {payload.sku}")
        product = Product(
            sku=payload.sku,
            name=payload.name,
            price=payload.price,
            stock=payload.stock,
        )
        self.products.add(product)
        self._commit()
        logger.info("创建商品 id=%s sku=%s", product.id, product.sku)
        return product

    def update(self, product_id: int, payload: ProductUpdate) -> Product:
        product = self.get(product_id)
        product.update(name=payload.name, price=payload.price, stock=payload.stock)
        self._commit()
        return product

    def delete(self, product_id: int) -> None:
        product = self.get(product_id)
        self.products.delete(product)
        self._commit()

    def _commit(self) -> None:
        try:
            self.session.commit()
        except StaleDataError as exc:
            self.session.rollback()
            raise OptimisticLockConflict() from exc
        except IntegrityError as exc:
            self.session.rollback()
            raise Conflict("数据违反唯一性或外键约束") from exc

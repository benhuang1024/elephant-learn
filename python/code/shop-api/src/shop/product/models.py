"""商品 ORM 模型。

SQLAlchemy 2.0 的 typed ORM：``Mapped[T]`` + ``mapped_column`` 让 mypy 知道字段类型。
``version_id_col`` 提供乐观锁——并发更新时后提交的事务会失败，而不是静默覆盖。
"""

from decimal import Decimal

from sqlalchemy import BigInteger, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from shop.db import Base, version_generator
from shop.errors import InsufficientStock

IdType = BigInteger().with_variant(Integer, "sqlite")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    stock: Mapped[int] = mapped_column(nullable=False)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    __mapper_args__ = {  # noqa: RUF012 - SQLAlchemy 映射参数
        "version_id_col": version,
        "version_id_generator": version_generator,
    }

    def update(self, *, name: str, price: Decimal, stock: int) -> None:
        self.name = name
        self.price = price
        self.stock = stock

    def deduct(self, quantity: int) -> None:
        """把“库存不足”规则放在实体里，Service 只负责编排事务。"""
        if quantity <= 0:
            raise ValueError("扣减数量必须大于 0")
        if quantity > self.stock:
            raise InsufficientStock(self.sku, quantity, self.stock)
        self.stock -= quantity

    def __repr__(self) -> str:
        return f"Product(id={self.id!r}, sku={self.sku!r}, stock={self.stock!r})"

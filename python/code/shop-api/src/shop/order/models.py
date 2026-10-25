"""订单聚合：Order 负责“总价 = 各项小计之和”和“下单扣库存”的一致性。"""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shop.db import Base, version_generator
from shop.product.models import IdType, Product

CENT = Decimal("0.01")


class OrderStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(
            OrderStatus,
            native_enum=False,
            length=20,
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
        default=OrderStatus.PENDING,
    )
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.id",
    )

    __mapper_args__ = {  # noqa: RUF012 - SQLAlchemy 映射参数
        "version_id_col": version,
        "version_id_generator": version_generator,
    }

    def add_item(self, product: Product, quantity: int) -> None:
        product.deduct(quantity)
        item = OrderItem(
            product_id=product.id,
            sku=product.sku,
            unit_price=product.price,
            quantity=quantity,
        )
        item.subtotal = (product.price * quantity).quantize(CENT, rounding=ROUND_HALF_UP)
        self.items.append(item)
        # mapped_column(default=...) 只在 flush 时生效，新对象的 total 此刻还是 None
        total = self.total or Decimal("0.00")
        self.total = (total + item.subtotal).quantize(CENT, rounding=ROUND_HALF_UP)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(IdType, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), nullable=False, index=True
    )
    # 下单时的 SKU 与单价快照：商品改名调价不影响历史订单
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")

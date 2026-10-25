"""订单的请求/响应模型。"""

from datetime import datetime

from pydantic import Field

from shop.schemas import CamelModel, Price


class OrderLine(CamelModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=99)


class PlaceOrderRequest(CamelModel):
    customer_name: str = Field(min_length=1, max_length=100)
    items: list[OrderLine] = Field(min_length=1, max_length=20)


class OrderItemOut(CamelModel):
    product_id: int
    sku: str
    unit_price: Price
    quantity: int
    subtotal: Price


class OrderOut(CamelModel):
    id: int
    customer_name: str
    status: str
    total: Price
    created_at: datetime
    version: int
    items: list[OrderItemOut]

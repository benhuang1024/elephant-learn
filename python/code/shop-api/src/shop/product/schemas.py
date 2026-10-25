"""商品的请求/响应模型 ≈ FormRequest + API Resource。"""

from pydantic import BaseModel, ConfigDict, Field

from shop.schemas import CamelModel, Price


class ProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    price: Price
    stock: int = Field(ge=0)


class ProductUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    price: Price
    stock: int = Field(ge=0)


class ProductOut(CamelModel):
    id: int
    sku: str
    name: str
    price: Price
    stock: int
    version: int

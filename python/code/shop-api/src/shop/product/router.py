"""商品 HTTP 接口：路由声明即文档（OpenAPI 由 FastAPI 自动生成）。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from shop.db import get_db
from shop.product.schemas import ProductCreate, ProductOut, ProductUpdate
from shop.product.service import ProductService
from shop.security import AdminUser, CurrentUser

router = APIRouter(prefix="/api/products", tags=["products"])

SessionDep = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[ProductOut])
def list_products(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[ProductOut]:
    """公开接口：``GET /api/products?q=键盘``。"""
    return [ProductOut.model_validate(product) for product in ProductService(session).search(q)]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    session: SessionDep,
    product_id: Annotated[int, Path(ge=1)],
) -> ProductOut:
    return ProductOut.model_validate(ProductService(session).get(product_id))


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    response: Response,
    session: SessionDep,
    _user: CurrentUser,
) -> ProductOut:
    product = ProductService(session).create(payload)
    response.headers["Location"] = f"/api/products/{product.id}"
    return ProductOut.model_validate(product)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    payload: ProductUpdate,
    session: SessionDep,
    product_id: Annotated[int, Path(ge=1)],
    _user: CurrentUser,
) -> ProductOut:
    return ProductOut.model_validate(ProductService(session).update(product_id, payload))


@router.delete("/{product_id}", status_code=204)
def delete_product(
    session: SessionDep,
    product_id: Annotated[int, Path(ge=1)],
    _admin: AdminUser,
) -> None:
    ProductService(session).delete(product_id)

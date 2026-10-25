"""订单 HTTP 接口。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.orm import Session

from shop.config import Settings, get_app_settings
from shop.db import get_db
from shop.order.schemas import OrderOut, PlaceOrderRequest
from shop.order.service import OrderService
from shop.security import CurrentUser

router = APIRouter(prefix="/api/orders", tags=["orders"])

SessionDep = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]


@router.post("", response_model=OrderOut, status_code=201)
def place_order(
    payload: PlaceOrderRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    _user: CurrentUser,
) -> OrderOut:
    order = OrderService(session, settings).place(payload)
    response.headers["Location"] = f"/api/orders/{order.id}"
    return OrderOut.model_validate(order)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    session: SessionDep,
    settings: SettingsDep,
    order_id: Annotated[int, Path(ge=1)],
    _user: CurrentUser,
) -> OrderOut:
    return OrderOut.model_validate(OrderService(session, settings).get(order_id))


@router.get("", response_model=list[OrderOut])
def list_orders(
    session: SessionDep,
    settings: SettingsDep,
    _user: CurrentUser,
) -> list[OrderOut]:
    return [OrderOut.model_validate(order) for order in OrderService(session, settings).list()]

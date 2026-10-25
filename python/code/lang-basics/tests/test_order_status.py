import json

import pytest

from basics.order_status import (
    InvalidTransition,
    OrderStatus,
    can_transition,
    describe,
    is_final,
    transition,
)


def test_enum_parsing_and_json() -> None:
    assert OrderStatus("PAID") is OrderStatus.PAID
    assert str(OrderStatus.SHIPPED) == "SHIPPED"
    assert json.loads(json.dumps({"status": OrderStatus.PAID}))["status"] == "PAID"
    with pytest.raises(ValueError):
        OrderStatus("UNKNOWN")


def test_transitions() -> None:
    assert can_transition(OrderStatus.PENDING, OrderStatus.PAID) is True
    assert transition(OrderStatus.PENDING, OrderStatus.PAID) is OrderStatus.PAID
    assert can_transition(OrderStatus.SHIPPED, OrderStatus.PAID) is False


def test_invalid_transition_carries_context() -> None:
    with pytest.raises(InvalidTransition) as caught:
        transition(OrderStatus.SHIPPED, OrderStatus.CANCELLED)
    assert caught.value.source is OrderStatus.SHIPPED
    assert caught.value.target is OrderStatus.CANCELLED


def test_describe_and_final() -> None:
    assert describe(OrderStatus.PENDING) == "待支付"
    assert is_final(OrderStatus.CANCELLED) is True
    assert is_final(OrderStatus.PAID) is False

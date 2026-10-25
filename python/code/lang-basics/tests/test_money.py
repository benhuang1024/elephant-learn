from decimal import Decimal

import pytest

from basics.money import Money, checkout_total


def test_quantize_half_up() -> None:
    assert Money(Decimal("19.995")).amount == Decimal("20.00")
    assert Money(Decimal("1.005")).amount == Decimal("1.01")


def test_arithmetic() -> None:
    price = Money(Decimal("19.90"))
    assert price * 3 == Money(Decimal("59.70"))
    assert price + Money(Decimal("0.10")) == Money(Decimal("20.00"))
    assert price - Money(Decimal("0.90")) == Money(Decimal("19.00"))


def test_currency_mismatch_is_rejected() -> None:
    with pytest.raises(ValueError, match="币种不一致"):
        Money(Decimal("1.00"), "CNY") + Money(Decimal("1.00"), "USD")


def test_frozen() -> None:
    money = Money(Decimal("1.00"))
    with pytest.raises(AttributeError):
        money.amount = Decimal("2.00")  # type: ignore[misc]


def test_checkout_total() -> None:
    total = checkout_total(
        [Money(Decimal("19.90")), Money(Decimal("0.01"))],
        [2, 3],
    )
    assert total == Money(Decimal("39.83"))

    with pytest.raises(ValueError, match="长度不一致"):
        checkout_total([Money(Decimal("1.00"))], [1, 2])

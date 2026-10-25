from decimal import Decimal

from basics.truthiness_and_equality import (
    decimal_sum_is_exact,
    float_sum_is_exact,
    is_truthy,
    money_from_float,
    money_from_str,
    same_identity,
    same_value,
)


def test_falsy_values_are_narrower_than_php() -> None:
    assert is_truthy("") is False
    assert is_truthy([]) is False
    assert is_truthy({}) is False
    assert is_truthy(0) is False
    assert is_truthy(None) is False
    # PHP 里 "0" 是假值；Python 里非空字符串一律为真
    assert is_truthy("0") is True
    assert is_truthy(" ") is True


def test_empty_list_is_not_equal_to_false() -> None:
    # PHP: [] == false 为 true；Python: [] == False 为 false
    assert same_value([], False) is False
    assert same_value(0, False) is True
    assert same_value(1, True) is True
    assert same_value("1", 1) is False


def test_identity_is_not_equality() -> None:
    first = [1, 2]
    second = [1, 2]
    assert same_value(first, second) is True
    assert same_identity(first, second) is False
    assert same_identity(first, first) is True


def test_float_and_decimal_disagree() -> None:
    assert float_sum_is_exact() is False
    assert decimal_sum_is_exact() is True
    assert Decimal(0.1) != Decimal("0.1")  # noqa: RUF032 - 故意演示 float 构造的误差


def test_money_construction_from_float_and_str() -> None:
    assert money_from_float(19.9) == Decimal("19.9")
    assert money_from_str("19.90") == Decimal("19.90")
    try:
        money_from_str("abc")
    except ValueError as exc:
        assert "非法金额" in str(exc)
    else:
        raise AssertionError("应抛 ValueError")

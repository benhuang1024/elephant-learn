"""真值、``==`` 与 ``is``、浮点误差与 Decimal。

PHP 直觉最容易踩的三个点：

* 空数组、``"0"``、``"0.0"`` 在 PHP 里是假值；在 Python 里只有空容器/空串/0/None 是假值。
* ``==`` 是“值相等”，``is`` 是“同一个对象”，不要用 ``is`` 比较数字和字符串。
* ``0.1 + 0.2 != 0.3``；金额一律用 ``Decimal``，不要用 ``float``。
"""

from decimal import Decimal, InvalidOperation


def is_truthy(value: object) -> bool:
    """PHP 的 ``if ($x)`` 对应 ``if x:``，但假值集合不同。"""
    return bool(value)


def same_value(left: object, right: object) -> bool:
    """``==``：值相等（会尝试类型转换，但比 PHP 保守得多）。"""
    return left == right


def same_identity(left: object, right: object) -> bool:
    """``is``：同一对象；只应该用于 ``None``、哨兵对象和真正的同一性判断。"""
    return left is right


def float_sum_is_exact() -> bool:
    return 0.1 + 0.2 == 0.3


def decimal_sum_is_exact() -> bool:
    return Decimal("0.1") + Decimal("0.2") == Decimal("0.3")


def money_from_float(amount: float) -> Decimal:
    """先把 float 转成十进制字符串再构造 Decimal，否则会把二进制误差带进来。"""
    return Decimal(str(amount))


def money_from_str(amount: str) -> Decimal:
    """生产代码更推荐直接接收字符串（JSON 里的金额也应该是字符串）。"""
    try:
        return Decimal(amount)
    except InvalidOperation as exc:
        raise ValueError(f"非法金额: {amount!r}") from exc

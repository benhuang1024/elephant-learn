"""Enum 状态机与 ``match``。

PHP 8.1 的 enum ≈ Python 的 ``enum.Enum``；``StrEnum`` 让成员同时是字符串，
可以直接 JSON 序列化、写数据库。状态流转规则集中在模块常量里，别散落在 Service。
"""

from enum import StrEnum


class OrderStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    CANCELLED = "CANCELLED"


class InvalidTransition(Exception):
    def __init__(self, source: OrderStatus, target: OrderStatus) -> None:
        super().__init__(f"订单状态不允许从 {source} 变为 {target}")
        self.source = source
        self.target = target


_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.PENDING: frozenset({OrderStatus.PAID, OrderStatus.CANCELLED}),
    OrderStatus.PAID: frozenset({OrderStatus.SHIPPED, OrderStatus.CANCELLED}),
    OrderStatus.SHIPPED: frozenset(),
    OrderStatus.CANCELLED: frozenset(),
}


def can_transition(source: OrderStatus, target: OrderStatus) -> bool:
    return target in _TRANSITIONS[source]


def transition(source: OrderStatus, target: OrderStatus) -> OrderStatus:
    if not can_transition(source, target):
        raise InvalidTransition(source, target)
    return target


def describe(status: OrderStatus) -> str:
    """match 是语句而不是表达式，必须穷举时用 assert_never 让类型检查器帮你。"""
    match status:
        case OrderStatus.PENDING:
            return "待支付"
        case OrderStatus.PAID:
            return "已支付"
        case OrderStatus.SHIPPED:
            return "已发货"
        case OrderStatus.CANCELLED:
            return "已取消"


def is_final(status: OrderStatus) -> bool:
    match status:
        case OrderStatus.SHIPPED | OrderStatus.CANCELLED:
            return True
        case _:
            return False

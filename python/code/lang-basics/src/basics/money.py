"""金额值对象：frozen dataclass + Decimal。

PHP 里金额通常用整数分或 bcmath；Python 的标准答案是 ``Decimal`` + 不可变值对象。
不要用 float，也不要把“修正精度”散落在业务代码里。
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: str = "CNY"

    def __post_init__(self) -> None:
        if not self.currency:
            raise ValueError("currency 不能为空")
        quantized = self.amount.quantize(CENT, rounding=ROUND_HALF_UP)
        object.__setattr__(self, "amount", quantized)

    def __add__(self, other: Money) -> Money:
        self._require_same_currency(other)
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._require_same_currency(other)
        return Money(self.amount - other.amount, self.currency)

    def __mul__(self, quantity: int) -> Money:
        if quantity < 0:
            raise ValueError("数量不能为负")
        return Money(self.amount * quantity, self.currency)

    def __str__(self) -> str:
        return f"{self.amount} {self.currency}"

    def _require_same_currency(self, other: Money) -> None:
        if self.currency != other.currency:
            raise ValueError(f"币种不一致: {self.currency} != {other.currency}")


def checkout_total(prices: list[Money], quantities: list[int]) -> Money:
    """逐项乘数量再累加；每一步都已按分四舍五入，和 PHP 的整数分算法等价。"""
    if len(prices) != len(quantities):
        raise ValueError("价格与数量长度不一致")
    subtotals = (price * qty for price, qty in zip(prices, quantities, strict=True))
    return sum(subtotals, Money(Decimal(0)))

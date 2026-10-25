"""跨模块共享的 Pydantic 基础设施：金额类型与 camelCase 基类。"""

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# JSON 里输出数字以对齐 Java 的 BigDecimal；生产 API 更推荐金额用字符串或整数分。
Price = Annotated[
    Decimal,
    Field(gt=0, max_digits=12, decimal_places=2),
    PlainSerializer(float, return_type=float, when_used="json"),
]


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(word.capitalize() for word in tail)


class CamelModel(BaseModel):
    """对外 JSON 用 camelCase（对齐 java/shop-api），Python 内部仍用 snake_case。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
    )

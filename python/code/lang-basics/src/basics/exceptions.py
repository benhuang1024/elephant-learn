"""异常层级、``raise from``、异常组（ExceptionGroup / except*）。

PHP 里异常链靠 ``$previous``；Python 的 ``raise X from Y`` 会生成 ``__cause__``，
``except*`` 则一次处理多个并发错误（例如批量校验、asyncio TaskGroup）。
"""

from dataclasses import dataclass, field


class ShopError(Exception):
    """业务异常基类：Web 层可以统一映射成 4xx，而不是 500。"""


class NotFound(ShopError):
    def __init__(self, resource: str, identifier: object) -> None:
        super().__init__(f"{resource} 不存在: {identifier}")
        self.resource = resource
        self.identifier = identifier


class Conflict(ShopError):
    """状态冲突，映射 HTTP 409。"""


@dataclass
class InsufficientStock(Conflict):
    sku: str
    requested: int
    available: int

    def __post_init__(self) -> None:
        super().__init__(f"库存不足 sku={self.sku} 需要={self.requested} 剩余={self.available}")


class ValidationError(ShopError):
    """参数/领域规则校验失败，映射 HTTP 400 或 422。"""


def find_product(products: dict[str, str], sku: str) -> str:
    try:
        return products[sku]
    except KeyError as exc:
        # 保留底层原因，调试时能同时看到 KeyError 和 NotFound
        raise NotFound("商品", sku) from exc


def parse_quantity(raw: str) -> int:
    try:
        quantity = int(raw)
    except ValueError as exc:
        raise ValidationError(f"数量必须是整数: {raw!r}") from exc
    if quantity <= 0:
        raise ValidationError("数量必须大于 0")
    return quantity


@dataclass
class BatchResult:
    accepted: list[int] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def validate_batch(values: list[str]) -> BatchResult:
    """``except*`` 收集所有子异常；Python 3.11+ 的 ExceptionGroup 是并发的正确姿势。"""
    result = BatchResult()
    errors: list[Exception] = []
    for raw in values:
        try:
            result.accepted.append(parse_quantity(raw))
        except ValidationError as exc:
            errors.append(exc)
    if errors:
        raise ExceptionGroup("批量校验失败", errors)
    return result


def collect_errors(values: list[str]) -> BatchResult:
    result = BatchResult()
    try:
        return validate_batch(values)
    except* ValidationError as group:
        # except* 块里不能 return，所以先收集再在块外返回
        result.errors = [str(error) for error in group.exceptions]
    return result


def add_context_note(raw: str) -> None:
    """3.11+ 的 add_note：给已有异常补充上下文，不破坏原始 traceback。"""
    try:
        int(raw)
    except ValueError as exc:
        exc.add_note(f"输入来自用户表单: {raw!r}")
        raise

"""泛型：PEP 695 新语法（Python 3.12+）。

对照 PHP：PHP 的泛型只存在于 PHPStan/Psalm 的注释里，运行时完全擦除；Python 的
泛型同样在运行时擦除，但 **mypy/pyright 会真正检查**，并且 3.12 起语法不再需要
``TypeVar`` 变量。
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Protocol


class HasId(Protocol):
    @property
    def id(self) -> int: ...


@dataclass(frozen=True, slots=True)
class Product:
    id: int
    name: str


class Repository[T: HasId]:
    """``Repository[Product]`` 是泛型仓储；PHP 里只能写 ``@template T of HasId``。"""

    def __init__(self) -> None:
        self._items: dict[int, T] = {}

    def add(self, item: T) -> T:
        self._items[item.id] = item
        return item

    def get(self, item_id: int) -> T | None:
        return self._items.get(item_id)

    def all(self) -> list[T]:
        return list(self._items.values())

    def find(self, predicate: Callable[[T], bool]) -> list[T]:
        return [item for item in self._items.values() if predicate(item)]


def first[T](items: Iterable[T]) -> T | None:
    """泛型函数：返回类型随入参推导，不需要写 ``TypeVar('T')``。"""
    return next(iter(items), None)


def index_by[T: HasId](items: Iterable[T]) -> dict[int, T]:
    return {item.id: item for item in items}


def only_instance[T](items: Iterable[object], expected: type[T]) -> list[T]:
    """``type[T]`` 让返回值精确到具体类；mypy 会据此检查调用处。"""
    return [item for item in items if isinstance(item, expected)]

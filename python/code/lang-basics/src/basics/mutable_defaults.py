"""可变默认参数、引用语义与拷贝。

PHP 数组是**值语义**（写时复制），Python 的 list/dict/set 是**引用语义**。这是
从 PHP 迁到 Python 时最容易写出“共享状态”bug 的地方。
"""

import copy
from dataclasses import dataclass, field


def add_bad(item: str, bucket: list[str] = []) -> list[str]:  # noqa: B006 - 故意演示经典 bug
    """反面教材：默认值在函数定义时求值一次，所有调用共享同一个 list。"""
    bucket.append(item)
    return bucket


def add_safe(item: str, bucket: list[str] | None = None) -> list[str]:
    """正确写法：默认 None，在函数体内新建容器。"""
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


def append_returns_none(container: list[int]) -> None:
    """``array_push`` 返回新长度，``list.append`` 返回 None。"""
    container.append(1)


def alias_shares_state() -> tuple[list[int], list[int]]:
    """赋值不复制：两个名字指向同一个对象。"""
    original = [1, 2]
    alias = original
    alias.append(3)
    return original, alias


def copy_is_independent() -> tuple[list[int], list[int]]:
    """浅拷贝：顶层独立，嵌套元素仍共享。"""
    original = [1, 2]
    duplicate = original.copy()
    duplicate.append(3)
    return original, duplicate


@dataclass
class Item:
    tags: list[str] = field(default_factory=list)  # dataclass 里也不要用可变默认值


def shallow_vs_deep() -> tuple[Item, Item, Item]:
    """嵌套可变对象：copy.copy 只复制一层，deepcopy 才完全隔离。"""
    original = Item(tags=["a"])
    shallow = copy.copy(original)
    deep = copy.deepcopy(original)
    shallow.tags.append("b")
    return original, shallow, deep


def rebinding_does_not_affect_caller(container: list[int]) -> list[int]:
    """重新绑定局部名字不会影响调用方；原地修改才会。"""
    container = [99]
    return container


def mutate_in_place(container: list[int]) -> None:
    container.append(99)


def dedupe_stable(values: list[str]) -> list[str]:
    """``array_unique`` 保序去重；dict.fromkeys 更直观，且保持首次出现顺序。"""
    return list(dict.fromkeys(values))


def drop_while_reading(items: list[dict[str, int]]) -> None:
    """遍历 dict 时增删键会抛 RuntimeError；先复制键或生成新 dict。"""
    for key in list(items[0]):
        if items[0][key] == 0:
            del items[0][key]

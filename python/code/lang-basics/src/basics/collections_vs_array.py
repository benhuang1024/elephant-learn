"""PHP 的 array_* 家族 ↔ Python 的推导式、内置函数与 collections。

PHP 数组是一个“有序哈希表”，既能当 list 又能当 map；Python 把它们拆成
``list`` / ``dict`` / ``set`` / ``tuple``，因此很多 array_* 函数不再需要。
"""

from collections import Counter, defaultdict
from functools import reduce
from typing import TypedDict


class ProductRow(TypedDict):
    """TypedDict 只影响静态检查，运行时仍是普通 dict（≈ PHP 关联数组 + PHPStan 类型）。"""

    sku: str
    name: str
    price_cents: int
    stock: int


def names(rows: list[ProductRow]) -> list[str]:
    """``array_column($rows, 'name')`` → 列表推导式。"""
    return [row["name"] for row in rows]


def in_stock(rows: list[ProductRow]) -> list[ProductRow]:
    """``array_filter($rows, fn ($r) => $r['stock'] > 0)``。"""
    return [row for row in rows if row["stock"] > 0]


def by_sku(rows: list[ProductRow]) -> dict[str, ProductRow]:
    """``array_column($rows, null, 'sku')`` → dict 推导式。"""
    return {row["sku"]: row for row in rows}


def total_value_cents(rows: list[ProductRow]) -> int:
    """``array_sum(array_map(...))`` → 生成器 + sum。"""
    return sum(row["price_cents"] * row["stock"] for row in rows)


def sorted_by_price(rows: list[ProductRow], *, descending: bool = True) -> list[ProductRow]:
    """``usort`` → sorted(key=...)，且 Python 排序稳定。"""
    return sorted(rows, key=lambda row: row["price_cents"], reverse=descending)


def word_counts(words: list[str]) -> Counter[str]:
    """``array_count_values`` → Counter。"""
    return Counter(words)


def group_by_initial(words: list[str]) -> dict[str, list[str]]:
    """手写 ``$result[$k][] = $v`` 前要初始化；defaultdict 省掉这个仪式。"""
    grouped: defaultdict[str, list[str]] = defaultdict(list)
    for word in words:
        grouped[word[0].upper()].append(word)
    return dict(grouped)


def pair_sum(pairs: list[tuple[int, int]]) -> int:
    """元组解包 ≈ ``[$a, $b] = $pair``。"""
    return sum(a + b for a, b in pairs)


def split_first_last(items: list[str]) -> tuple[str, list[str], str]:
    """切片与星号解包：``$first = $a[0]; $middle = array_slice($a, 1, -1); $last = end($a);``"""
    if len(items) < 2:
        raise ValueError("至少需要两个元素")
    first, *middle, last = items
    return first, middle, last


def product_of(values: list[int]) -> int:
    """``array_reduce`` 的直译；但大多数聚合用 sum/min/max/any/all 就够了。"""
    return reduce(lambda acc, value: acc * value, values, 1)


def insertion_order() -> list[str]:
    """dict 从 3.7 起保证插入顺序，等价于 PHP 关联数组的稳定顺序。"""
    mapping = {"b": 2, "a": 1, "c": 3}
    mapping["d"] = 4
    return list(mapping)

"""生成器与上下文管理器。

PHP 的 ``yield`` 生成器这里几乎一样；差别在于 Python 把生成器当作**惰性流水线**的
默认组件，并额外提供 ``contextmanager`` 把 try/finally 写成可复用的 ``with`` 块。
"""

import time
from collections.abc import Iterable, Iterator
from contextlib import contextmanager


def read_lines(lines: Iterable[str]) -> Iterator[str]:
    """惰性读取：不一次性把所有行装进内存。"""
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            yield stripped


def parse_ints(lines: Iterable[str]) -> Iterator[int]:
    for line in lines:
        try:
            yield int(line)
        except ValueError:
            continue


def running_total(values: Iterable[int]) -> Iterator[int]:
    total = 0
    for value in values:
        total += value
        yield total


def pipeline(raw: Iterable[str]) -> Iterator[int]:
    """``yield from`` 把三段流水线串起来；任何一段都不会提前消费全部输入。"""
    yield from running_total(parse_ints(read_lines(raw)))


def take[T](items: Iterable[T], count: int) -> list[T]:
    """只消费前 count 个元素：惰性 + 短路，适合无限流。"""
    if count < 0:
        raise ValueError("count 不能为负")
    result: list[T] = []
    iterator = iter(items)
    for _ in range(count):
        try:
            result.append(next(iterator))
        except StopIteration:
            break
    return result


def naturals() -> Iterator[int]:
    """无限生成器；调用它本身不会执行任何代码。"""
    value = 0
    while True:
        yield value
        value += 1


@contextmanager
def transaction(store: dict[str, int]) -> Iterator[dict[str, int]]:
    """``with transaction(store) as tx:`` ≈ Laravel 的 DB::transaction 闭包。

    进入时做快照；正常退出提交（什么都不用做）；抛异常则回滚并继续向上抛。
    生产代码请用 SQLAlchemy 的 Session 事务，这里只演示协议。
    """
    snapshot = store.copy()
    try:
        yield store
    except Exception:
        store.clear()
        store.update(snapshot)
        raise


class Timer:
    """手写上下文管理器：比 @contextmanager 更适合需要暴露多个属性的场景。"""

    def __init__(self) -> None:
        self.elapsed_ms = 0.0

    def __enter__(self) -> Timer:
        self._started = time.perf_counter()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.elapsed_ms = (time.perf_counter() - self._started) * 1000

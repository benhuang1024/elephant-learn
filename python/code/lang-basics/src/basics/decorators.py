"""装饰器 ≈ PHP 的中间件 / 注解 + AOP。

装饰器就是“接收函数、返回可调用对象”的高阶函数；``functools.wraps`` /
``update_wrapper`` 保留原函数的元数据，否则日志、路由注册、文档生成看到的都是 ``wrapper``。
"""

import functools
import time
from collections.abc import Callable


class Timed[**P, R]:
    """类装饰器：需要保存状态（最近一次耗时）时，比闭包更清晰。"""

    def __init__(self, func: Callable[P, R]) -> None:
        functools.update_wrapper(self, func)
        self.func = func
        self.last_elapsed_ms = 0.0

    def __call__(self, *args: P.args, **kwargs: P.kwargs) -> R:
        started = time.perf_counter()
        try:
            return self.func(*args, **kwargs)
        finally:
            self.last_elapsed_ms = (time.perf_counter() - started) * 1000


def retry[**P, R](
    attempts: int = 3,
    *,
    delay: float = 0.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """重试装饰器：注意别把“业务异常”也重试了，默认应该只捕获瞬态错误。"""
    if attempts < 1:
        raise ValueError("attempts 必须 >= 1")

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == attempts:
                        raise
                    if delay:
                        time.sleep(delay)
            raise AssertionError("unreachable")

        return wrapper

    return decorator


def memoize[**P, R](func: Callable[P, R]) -> Callable[P, R]:
    """缓存装饰器；生产里更常用 ``functools.lru_cache(maxsize=...)``。"""
    cache: dict[tuple[object, ...], R] = {}

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        key = (*args, *sorted(kwargs.items()))
        if key not in cache:
            cache[key] = func(*args, **kwargs)
        return cache[key]

    return wrapper


@functools.cache
def fibonacci(n: int) -> int:
    """标准库缓存装饰器：纯函数、参数可哈希时直接用。"""
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

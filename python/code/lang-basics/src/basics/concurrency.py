"""线程 / 进程 / asyncio：三种并发的边界。

PHP-FPM 是 share-nothing + 一请求一进程；Python 应用是常驻进程，于是必须自己选：

* **线程**：适合 I/O 阻塞（DB 驱动、文件、旧库），受 GIL 限制，CPU 密集无收益。
* **进程**：绕过 GIL 做 CPU 密集；代价是序列化与内存，Windows/macOS 用 spawn。
* **asyncio**：单线程协作式并发，适合高并发网络 I/O；阻塞调用会卡死整个事件循环。

3.14 的 free-threaded 构建（``python3.14t``）可以让线程真正并行，但生态兼容性仍需评估。
"""

import asyncio
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor


def increment_with_lock(workers: int = 4, per_worker: int = 1_000) -> int:
    """多线程共享计数：``+=`` 不是原子操作，必须加锁。"""
    counter = 0
    lock = threading.Lock()

    def work() -> None:
        nonlocal counter
        for _ in range(per_worker):
            with lock:
                counter += 1

    threads = [threading.Thread(target=work) for _ in range(workers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return counter


def blocking_io(identifier: int, delay: float = 0.02) -> tuple[int, float]:
    """模拟阻塞调用；线程池能把它并行化。"""
    started = time.perf_counter()
    time.sleep(delay)
    return identifier, time.perf_counter() - started


def fetch_all_threads(ids: list[int]) -> list[tuple[int, float]]:
    with ThreadPoolExecutor(max_workers=max(1, len(ids))) as pool:
        return list(pool.map(blocking_io, ids))


def square(value: int) -> int:
    """必须是模块顶层函数：进程池需要 pickle 它。"""
    return value * value


def squares_in_processes(values: list[int]) -> list[int]:
    """CPU 密集任务用进程池绕过 GIL；小任务反而会被进程开销拖慢。"""
    with ProcessPoolExecutor() as pool:
        return list(pool.map(square, values))


async def fake_fetch(identifier: int, delay: float = 0.02) -> int:
    await asyncio.sleep(delay)
    return identifier


async def fetch_all_async(ids: list[int]) -> list[int]:
    """``asyncio.gather``：顺序与传入顺序一致；异常默认在第一个失败处抛出。"""
    return list(await asyncio.gather(*(fake_fetch(i) for i in ids)))


async def fetch_all_taskgroup(ids: list[int]) -> list[int]:
    """3.11+ 的 TaskGroup：任一任务失败会取消同组其他任务，错误包装为 ExceptionGroup。"""
    results: list[int] = []

    async def worker(identifier: int) -> None:
        results.append(await fake_fetch(identifier))

    async with asyncio.TaskGroup() as group:
        for identifier in ids:
            group.create_task(worker(identifier))
    return results


async def fetch_all_with_timeout(ids: list[int], timeout: float) -> list[int]:
    async with asyncio.timeout(timeout):
        return await fetch_all_async(ids)

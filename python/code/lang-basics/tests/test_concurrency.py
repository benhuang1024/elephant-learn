import asyncio

import pytest

from basics.concurrency import (
    fetch_all_async,
    fetch_all_taskgroup,
    fetch_all_threads,
    fetch_all_with_timeout,
    increment_with_lock,
    squares_in_processes,
)


def test_threads_need_a_lock() -> None:
    assert increment_with_lock(workers=4, per_worker=1_000) == 4_000


def test_thread_pool_parallelizes_blocking_io() -> None:
    results = fetch_all_threads([3, 1, 2])
    assert [identifier for identifier, _ in results] == [3, 1, 2]
    assert all(elapsed >= 0.015 for _, elapsed in results)


def test_process_pool_bypasses_gil() -> None:
    assert squares_in_processes([1, 2, 3, 4]) == [1, 4, 9, 16]


def test_asyncio_gather_preserves_order() -> None:
    assert asyncio.run(fetch_all_async([3, 1, 2])) == [3, 1, 2]


def test_task_group_collects_results() -> None:
    assert set(asyncio.run(fetch_all_taskgroup([1, 2, 3]))) == {1, 2, 3}


def test_timeout_cancels_slow_calls() -> None:
    with pytest.raises(TimeoutError):
        asyncio.run(fetch_all_with_timeout([1], 0.001))

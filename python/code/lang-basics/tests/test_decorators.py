import time

import pytest

from basics.decorators import Timed, fibonacci, memoize, retry


def test_timed_preserves_metadata_and_records_elapsed() -> None:
    @Timed
    def add(left: int, right: int) -> int:
        time.sleep(0.001)
        return left + right

    assert add(1, 2) == 3
    assert add.__name__ == "add"
    assert add.last_elapsed_ms >= 1.0


def test_retry_until_success() -> None:
    calls: list[int] = []

    @retry(attempts=3)
    def flaky() -> str:
        calls.append(1)
        if len(calls) < 3:
            raise ConnectionError("temporary")
        return "ok"

    assert flaky() == "ok"
    assert len(calls) == 3


def test_retry_reraises_last_error() -> None:
    @retry(attempts=2)
    def always_fails() -> None:
        raise ConnectionError("down")

    with pytest.raises(ConnectionError, match="down"):
        always_fails()


def test_retry_does_not_swallow_other_errors() -> None:
    @retry(attempts=3, exceptions=(ConnectionError,))
    def bad_business_call() -> None:
        raise ValueError("do not retry")

    with pytest.raises(ValueError):
        bad_business_call()


def test_memoize_calls_once() -> None:
    calls: list[int] = []

    @memoize
    def double(value: int) -> int:
        calls.append(value)
        return value * 2

    assert double(2) == 4
    assert double(2) == 4
    assert calls == [2]
    assert double(value=3) == 6


def test_stdlib_cache() -> None:
    fibonacci.cache_clear()
    assert fibonacci(20) == 6765
    assert fibonacci.cache_info().hits > 0

import pytest

from basics.generators import (
    Timer,
    naturals,
    pipeline,
    running_total,
    take,
    transaction,
)


def test_pipeline_filters_comments_and_invalid_lines() -> None:
    raw = ["1\n", "# comment\n", "\n", "bad\n", "2\n", "3\n"]
    assert list(pipeline(raw)) == [1, 3, 6]


def test_read_lines_is_lazy() -> None:
    consumed: list[int] = []

    def source() -> object:
        for value in range(100):
            consumed.append(value)
            yield str(value)

    assert take(pipeline(source()), 2) == [0, 1]  # type: ignore[arg-type]
    assert consumed == [0, 1]


def test_infinite_generator_with_take() -> None:
    assert take(naturals(), 5) == [0, 1, 2, 3, 4]
    with pytest.raises(ValueError):
        take(naturals(), -1)


def test_running_total() -> None:
    assert list(running_total([1, 2, 3])) == [1, 3, 6]


def test_transaction_commit_and_rollback() -> None:
    store = {"a": 1}
    with transaction(store) as tx:
        tx["a"] = 2
        tx["b"] = 3
    assert store == {"a": 2, "b": 3}

    with pytest.raises(RuntimeError), transaction(store) as tx:
        tx["a"] = 99
        raise RuntimeError("boom")
    assert store == {"a": 2, "b": 3}


def test_timer_context_manager() -> None:
    with Timer() as timer:
        sum(range(10_000))
    assert timer.elapsed_ms >= 0

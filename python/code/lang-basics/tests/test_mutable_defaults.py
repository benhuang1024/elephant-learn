from basics.mutable_defaults import (
    add_bad,
    add_safe,
    alias_shares_state,
    append_returns_none,
    copy_is_independent,
    dedupe_stable,
    drop_while_reading,
    mutate_in_place,
    rebinding_does_not_affect_caller,
    shallow_vs_deep,
)


def test_mutable_default_is_shared_across_calls() -> None:
    first = add_bad("a")
    second = add_bad("b")
    assert first == ["a", "b"]
    assert first is second


def test_none_default_creates_fresh_list() -> None:
    first = add_safe("a")
    second = add_safe("b")
    assert first == ["a"]
    assert second == ["b"]


def test_append_returns_none() -> None:
    container: list[int] = []
    assert append_returns_none(container) is None
    assert container == [1]


def test_assignment_aliases_and_copy_does_not() -> None:
    original, alias = alias_shares_state()
    assert original == [1, 2, 3]
    assert alias is original

    original, duplicate = copy_is_independent()
    assert original == [1, 2]
    assert duplicate == [1, 2, 3]


def test_shallow_vs_deep_copy() -> None:
    original, shallow, deep = shallow_vs_deep()
    assert original.tags == ["a", "b"]
    assert shallow.tags == ["a", "b"]
    assert deep.tags == ["a"]


def test_rebinding_vs_mutating() -> None:
    container = [1]
    assert rebinding_does_not_affect_caller(container) == [99]
    assert container == [1]

    mutate_in_place(container)
    assert container == [1, 99]


def test_dedupe_and_delete_while_iterating() -> None:
    assert dedupe_stable(["b", "a", "b", "c"]) == ["b", "a", "c"]
    payload = [{"zero": 0, "one": 1}]
    drop_while_reading(payload)
    assert payload == [{"one": 1}]

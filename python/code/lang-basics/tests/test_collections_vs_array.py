from basics.collections_vs_array import (
    ProductRow,
    by_sku,
    group_by_initial,
    in_stock,
    insertion_order,
    names,
    pair_sum,
    product_of,
    sorted_by_price,
    split_first_last,
    total_value_cents,
    word_counts,
)

ROWS: list[ProductRow] = [
    {"sku": "A", "name": "键盘", "price_cents": 59900, "stock": 2},
    {"sku": "B", "name": "鼠标", "price_cents": 39900, "stock": 0},
]


def test_array_column_map_filter() -> None:
    assert names(ROWS) == ["键盘", "鼠标"]
    assert [row["sku"] for row in in_stock(ROWS)] == ["A"]
    assert total_value_cents(ROWS) == 59900 * 2


def test_index_by_key() -> None:
    indexed = by_sku(ROWS)
    assert indexed["B"]["name"] == "鼠标"


def test_sorting() -> None:
    assert [row["sku"] for row in sorted_by_price(ROWS)] == ["A", "B"]
    assert [row["sku"] for row in sorted_by_price(ROWS, descending=False)] == ["B", "A"]


def test_counting_and_grouping() -> None:
    counts = word_counts(["a", "b", "a"])
    assert counts["a"] == 2
    assert counts["missing"] == 0
    grouped = group_by_initial(["apple", "avocado", "banana"])
    assert grouped == {"A": ["apple", "avocado"], "B": ["banana"]}


def test_unpacking_and_slicing() -> None:
    assert pair_sum([(1, 2), (3, 4)]) == 10
    assert split_first_last(["a", "b", "c", "d"]) == ("a", ["b", "c"], "d")


def test_reduce_and_order() -> None:
    assert product_of([2, 3, 4]) == 24
    assert insertion_order() == ["b", "a", "c", "d"]

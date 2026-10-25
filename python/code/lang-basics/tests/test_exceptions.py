import pytest

from basics.exceptions import (
    Conflict,
    InsufficientStock,
    NotFound,
    ShopError,
    ValidationError,
    add_context_note,
    collect_errors,
    find_product,
    parse_quantity,
    validate_batch,
)


def test_exception_hierarchy() -> None:
    error = NotFound("商品", 42)
    assert isinstance(error, ShopError)
    assert str(error) == "商品 不存在: 42"


def test_raise_from_preserves_cause() -> None:
    with pytest.raises(NotFound) as caught:
        find_product({}, "SKU-404")
    assert isinstance(caught.value.__cause__, KeyError)


def test_validation_errors() -> None:
    with pytest.raises(ValidationError):
        parse_quantity("abc")
    with pytest.raises(ValidationError):
        parse_quantity("0")


def test_stock_conflict_fields() -> None:
    error = InsufficientStock(sku="SKU-1", requested=5, available=2)
    assert isinstance(error, Conflict)
    assert error.sku == "SKU-1"
    assert "剩余=2" in str(error)


def test_exception_group_and_except_star() -> None:
    with pytest.raises(ExceptionGroup) as caught:
        validate_batch(["1", "bad", "-1"])
    assert len(caught.value.exceptions) == 2

    result = collect_errors(["2", "bad", "0"])
    assert result.accepted == []
    assert len(result.errors) == 2


def test_add_note() -> None:
    with pytest.raises(ValueError) as caught:
        add_context_note("oops")
    assert caught.value.__notes__ == ["输入来自用户表单: 'oops'"]

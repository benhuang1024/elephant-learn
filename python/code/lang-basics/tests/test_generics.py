from basics.generics import Product, Repository, first, index_by, only_instance


def test_repository_is_type_safe_by_convention() -> None:
    repo: Repository[Product] = Repository()
    repo.add(Product(1, "键盘"))
    repo.add(Product(2, "鼠标"))

    assert repo.get(1) == Product(1, "键盘")
    assert repo.get(99) is None
    assert [item.id for item in repo.find(lambda item: item.name == "鼠标")] == [2]
    assert len(repo.all()) == 2


def test_generic_helpers() -> None:
    assert first([1, 2, 3]) == 1
    assert first([]) is None

    indexed = index_by([Product(1, "a"), Product(2, "b")])
    assert indexed[2].name == "b"

    mixed: list[object] = [1, "two", Product(3, "c")]
    assert only_instance(mixed, int) == [1]
    assert only_instance(mixed, Product) == [Product(3, "c")]

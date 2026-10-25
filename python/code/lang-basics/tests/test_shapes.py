import pytest

from basics.shapes import Circle, Rectangle, Shape, Triangle, describe, is_shape, total_area


def test_protocol_is_structural() -> None:
    assert isinstance(Circle(1.0), Shape)
    assert is_shape(Triangle(2.0, 3.0)) is True
    assert is_shape("not a shape") is False


def test_total_area() -> None:
    shapes = [Rectangle(2.0, 3.0), Triangle(2.0, 4.0)]
    assert total_area(shapes) == pytest.approx(10.0)


def test_pattern_matching() -> None:
    assert describe(Circle(2.0)) == "圆 r=2.0"
    assert describe(Circle(-1.0)) == "非法圆"
    assert describe(Rectangle(3.0, 3.0)) == "正方形 a=3.0"
    assert describe(Rectangle(3.0, 4.0)) == "矩形"

    class Custom:
        def area(self) -> float:
            return 1.25

    assert describe(Custom()) == "其他形状 area=1.25"

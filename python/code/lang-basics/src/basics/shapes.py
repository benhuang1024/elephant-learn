"""Protocol 与结构化模式匹配。

PHP 靠 interface 做名义类型（nominal typing）；Python 的 Protocol 是结构化子类型：
只要“长得像”，无需显式 implements。模式匹配则把“按类型分派 + 解构”合成一个语法。
"""

import math
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@runtime_checkable
class Shape(Protocol):
    """接口的最小约定；不要求实现类继承它。"""

    def area(self) -> float: ...


@dataclass(frozen=True, slots=True)
class Circle:
    radius: float

    def area(self) -> float:
        return math.pi * self.radius**2


@dataclass(frozen=True, slots=True)
class Rectangle:
    width: float
    height: float

    def area(self) -> float:
        return self.width * self.height


@dataclass(frozen=True, slots=True)
class Triangle:
    base: float
    height: float

    def area(self) -> float:
        return self.base * self.height / 2


def describe(shape: Shape) -> str:
    match shape:
        case Circle(radius=radius) if radius <= 0:
            return "非法圆"
        case Circle(radius=radius):
            return f"圆 r={radius}"
        case Rectangle(width=width, height=height) if width == height:
            return f"正方形 a={width}"
        case Rectangle():
            return "矩形"
        case _:
            return f"其他形状 area={shape.area():.2f}"


def total_area(shapes: list[Shape]) -> float:
    """Protocol 作为参数类型：任何有 area() 的对象都能传进来。"""
    return sum(shape.area() for shape in shapes)


def is_shape(value: object) -> bool:
    """runtime_checkable 让 isinstance 只检查方法名是否存在。"""
    return isinstance(value, Shape)

package study.basics;

/**
 * sealed 接口 + record + switch 模式匹配 = 代数数据类型（ADT）。
 *
 * PHP 里通常是：interface Shape + 若干实现类 + match(true) { $s instanceof Circle => ... }。
 * 区别在于 Java 编译器知道 Shape 只有这三个实现（permits），
 * switch 漏掉任何一种都会 <b>编译失败</b>，而 PHP 只能在运行时抛 UnhandledMatchError。
 */
public final class Shapes {

    private Shapes() {
    }

    public sealed interface Shape permits Circle, Rect, Triangle {
    }

    public record Circle(double radius) implements Shape {
    }

    public record Rect(double width, double height) implements Shape {
    }

    public record Triangle(double base, double height) implements Shape {
    }

    /** switch 表达式 + 记录解构（record pattern），没有 default 分支也能通过编译。 */
    public static double area(Shape shape) {
        return switch (shape) {
            case Circle(double r) -> Math.PI * r * r;
            case Rect(double w, double h) -> w * h;
            case Triangle(double b, double h) -> b * h / 2;
        };
    }

    /** 带守卫条件（when）的模式匹配，类似 PHP match(true) 里的复合条件。 */
    public static String describe(Shape shape) {
        return switch (shape) {
            case Rect(double w, double h) when w == h -> "正方形 " + w;
            case Rect r -> "矩形 " + r.width() + "x" + r.height();
            case Circle c -> "圆 r=" + c.radius();
            case Triangle _ -> "三角形"; // _ 表示“不关心这个变量”（Java 22+）
        };
    }
}

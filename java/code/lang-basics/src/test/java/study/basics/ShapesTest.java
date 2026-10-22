package study.basics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ShapesTest {

    @Test
    @DisplayName("模式匹配按具体 record 类型分派")
    void areaForEachShape() {
        assertThat(Shapes.area(new Shapes.Circle(2))).isCloseTo(Math.PI * 4, within(0.0001));
        assertThat(Shapes.area(new Shapes.Rect(3, 4))).isEqualTo(12);
        assertThat(Shapes.area(new Shapes.Triangle(3, 4))).isEqualTo(6);
    }

    @Test
    @DisplayName("when 守卫把正方形从矩形里拆出来")
    void describeUsesGuard() {
        assertThat(Shapes.describe(new Shapes.Rect(5, 5))).isEqualTo("正方形 5.0");
        assertThat(Shapes.describe(new Shapes.Rect(5, 6))).isEqualTo("矩形 5.0x6.0");
        assertThat(Shapes.describe(new Shapes.Circle(1))).isEqualTo("圆 r=1.0");
        assertThat(Shapes.describe(new Shapes.Triangle(1, 2))).isEqualTo("三角形");
    }
}

package study.basics;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StringsAndEqualityTest {

    @Test
    @DisplayName("== 比较引用，equals 比较内容")
    void referenceVsContent() {
        String a = "hello";
        String b = new String("hello");

        assertThat(StringsAndEquality.sameReference(a, b)).isFalse();
        assertThat(StringsAndEquality.sameContent(a, b)).isTrue();
        assertThat(StringsAndEquality.sameReference(a, "hel" + "lo")).isTrue(); // 编译期常量折叠
    }

    @Test
    @DisplayName("formatted 等价于 sprintf")
    void receipt() {
        assertThat(StringsAndEquality.receipt("ben", 2, 12.5)).isEqualTo("ben 买了 2 件，共 12.50 元");
    }

    @Test
    @DisplayName("文本块适合写 SQL，但没有变量插值")
    void sqlTemplate() {
        assertThat(StringsAndEquality.sqlTemplate()).contains("FROM product").contains("WHERE price > ?");
    }

    @Test
    @DisplayName("循环拼接用 StringBuilder")
    void repeatJoin() {
        assertThat(StringsAndEquality.repeatJoin(4)).isEqualTo("0-1-2-3");
    }

    @Test
    @DisplayName("Integer 缓存只覆盖 -128..127，超出范围 == 为 false")
    void integerCacheTrap() {
        assertThat(StringsAndEquality.integerIdentity(127, 127)).isTrue();
        assertThat(StringsAndEquality.integerIdentity(128, 128)).isFalse();
    }
}

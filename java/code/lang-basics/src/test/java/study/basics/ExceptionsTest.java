package study.basics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.UncheckedIOException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ExceptionsTest {

    @Test
    @DisplayName("业务异常继承 RuntimeException，调用方不被强制 catch")
    void deductThrowsBusinessException() {
        assertThatThrownBy(() -> Exceptions.deduct("SKU-1", 5, 2))
                .isInstanceOf(Exceptions.InsufficientStockException.class)
                .hasMessageContaining("库存不足")
                .hasMessageContaining("SKU-1");
    }

    @Test
    @DisplayName("try-with-resources 自动关闭 BufferedReader")
    void readLines() throws Exception {
        assertThat(Exceptions.readLines("第一行\n第二行")).containsExactly("第一行", "第二行");
    }

    @Test
    @DisplayName("readLinesUnchecked 在正常输入下行为与受检版本一致")
    void readLinesUnchecked() {
        assertThat(Exceptions.readLinesUnchecked("a\nb")).containsExactly("a", "b");
        assertThatThrownBy(() -> Exceptions.readLinesUnchecked(null))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    @DisplayName("multi-catch 类似 PHP 8 的 catch (A | B $e)")
    void multiCatch() {
        assertThat(Exceptions.parse("42")).isEqualTo("int:42");
        assertThat(Exceptions.parse("abc")).isEqualTo("invalid:NumberFormatException");
    }
}

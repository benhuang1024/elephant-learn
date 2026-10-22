package study.basics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NullSafetyTest {

    @Test
    @DisplayName("链式 map 等价于 PHP 的 ?-> 加 ?? 默认值")
    void cityWithFallback() {
        assertThat(NullSafety.cityOf("ben")).isEqualTo("上海");
        assertThat(NullSafety.cityOf("nomad")).isEqualTo("未知");
        assertThat(NullSafety.cityOf("nobody")).isEqualTo("未知");
    }

    @Test
    @DisplayName("orElseThrow 等价于 ?? throw new NotFoundException()")
    void mustFindThrows() {
        assertThat(NullSafety.mustFind("ben").name()).isEqualTo("ben");
        assertThatThrownBy(() -> NullSafety.mustFind("ghost"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ghost");
    }
}

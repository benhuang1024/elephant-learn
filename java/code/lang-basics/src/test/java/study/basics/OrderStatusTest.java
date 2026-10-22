package study.basics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OrderStatusTest {

    @Test
    @DisplayName("fromCode 等价于 PHP enum 的 from()")
    void fromCode() {
        assertThat(OrderStatus.fromCode("paid")).isEqualTo(OrderStatus.PAID);
        assertThatThrownBy(() -> OrderStatus.fromCode("refunded"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("refunded");
    }

    @Test
    @DisplayName("状态机只允许合法流转")
    void transitionRules() {
        assertThat(OrderStatus.PENDING.canTransitTo(OrderStatus.PAID)).isTrue();
        assertThat(OrderStatus.PENDING.canTransitTo(OrderStatus.SHIPPED)).isFalse();
        assertThat(OrderStatus.SHIPPED.nextAllowed()).isEmpty();
    }

    @Test
    @DisplayName("enum 常量是单例，可以直接用 ==")
    void enumIdentity() {
        assertThat(OrderStatus.fromCode("pending")).isSameAs(OrderStatus.PENDING);
        assertThat(OrderStatus.values()).hasSize(4);
        assertThat(OrderStatus.PAID.label()).isEqualTo("已支付");
    }
}

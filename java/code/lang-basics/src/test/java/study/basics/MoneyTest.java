package study.basics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    @DisplayName("紧凑构造器会把金额规范到两位小数")
    void normalizesScale() {
        Money money = Money.of("9.999", "CNY");

        assertThat(money.amount()).isEqualByComparingTo("10.00");
        assertThat(money.amount().scale()).isEqualTo(2);
    }

    @Test
    @DisplayName("金额为负时构造失败")
    void rejectsNegativeAmount() {
        assertThatThrownBy(() -> Money.of("-0.01", "CNY"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("金额不能为负");
    }

    @Test
    @DisplayName("值对象按字段比较，而不是按引用")
    void valueEquality() {
        assertThat(Money.of("10", "CNY")).isEqualTo(Money.of("10.00", "CNY"));
        assertThat(Money.of("10", "CNY")).hasSameHashCodeAs(Money.of("10.00", "CNY"));
    }

    @Test
    @DisplayName("加法返回新实例，原对象不变（不可变）")
    void plusReturnsNewInstance() {
        Money original = Money.of("10", "CNY");

        Money sum = original.plus(Money.of("2.5", "CNY"));

        assertThat(sum.amount()).isEqualByComparingTo("12.50");
        assertThat(original.amount()).isEqualByComparingTo("10.00");
    }

    @Test
    @DisplayName("不同币种不能相加")
    void rejectsCurrencyMismatch() {
        assertThatThrownBy(() -> Money.of("10", "CNY").plus(Money.of("10", "USD")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("币种不同");
    }

    @Test
    @DisplayName("乘法用于计算行小计")
    void times() {
        assertThat(Money.of("19.90", "CNY").times(3).amount()).isEqualByComparingTo("59.70");
    }
}

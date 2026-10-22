package study.basics;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StreamsVsArrayFunctionsTest {

    private List<StreamsVsArrayFunctions.Order> orders;

    @BeforeEach
    void setUp() {
        orders = List.of(
                new StreamsVsArrayFunctions.Order(1, "ben", "上海", new BigDecimal("100.00"), true),
                new StreamsVsArrayFunctions.Order(2, "alice", "北京", new BigDecimal("50.00"), false),
                new StreamsVsArrayFunctions.Order(3, "ben", "上海", new BigDecimal("30.00"), true));
    }

    @Test
    void paidOrderIds() {
        assertThat(StreamsVsArrayFunctions.paidOrderIds(orders)).containsExactly(1L, 3L);
    }

    @Test
    void totalAmount() {
        assertThat(StreamsVsArrayFunctions.totalAmount(orders)).isEqualByComparingTo("180.00");
    }

    @Test
    void countByCity() {
        assertThat(StreamsVsArrayFunctions.countByCity(orders))
                .containsEntry("上海", 2L)
                .containsEntry("北京", 1L);
    }

    @Test
    void amountByCustomer() {
        Map<String, BigDecimal> byCustomer = StreamsVsArrayFunctions.amountByCustomer(orders);

        assertThat(byCustomer.get("ben")).isEqualByComparingTo("130.00");
        assertThat(byCustomer.get("alice")).isEqualByComparingTo("50.00");
    }

    @Test
    void topNByAmount() {
        assertThat(StreamsVsArrayFunctions.topNByAmount(orders, 2)).containsExactly(1L, 2L);
    }

    @Test
    void distinctCities() {
        assertThat(StreamsVsArrayFunctions.distinctCities(orders)).isEqualTo("上海,北京");
    }

    @Test
    void partitionByPaid() {
        Map<Boolean, List<StreamsVsArrayFunctions.Order>> partition =
                StreamsVsArrayFunctions.partitionByPaid(orders);

        assertThat(partition.get(true)).hasSize(2);
        assertThat(partition.get(false)).extracting(StreamsVsArrayFunctions.Order::id).containsExactly(2L);
    }
}

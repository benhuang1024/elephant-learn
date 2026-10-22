package study.basics;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Stream API ≈ PHP 的 array_map / array_filter / array_reduce，或 Laravel Collection。
 *
 * 和 Laravel Collection 最大的区别：Stream 是 <b>惰性</b> 的、<b>一次性</b> 的。
 * 没有终结操作（toList / collect / sum ...）前什么都不执行；用过一次的 Stream 不能再用。
 */
public final class StreamsVsArrayFunctions {

    private StreamsVsArrayFunctions() {
    }

    public record Order(long id, String customer, String city, BigDecimal amount, boolean paid) {
    }

    /** array_filter + array_map：已支付订单的 id */
    public static List<Long> paidOrderIds(List<Order> orders) {
        return orders.stream()
                .filter(Order::paid)
                .map(Order::id)
                .toList(); // 返回不可变 List
    }

    /** array_reduce / collect($orders)->sum('amount') */
    public static BigDecimal totalAmount(List<Order> orders) {
        return orders.stream()
                .map(Order::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** collect($orders)->groupBy('city')->map->count() */
    public static Map<String, Long> countByCity(List<Order> orders) {
        return orders.stream()
                .collect(Collectors.groupingBy(Order::city, Collectors.counting()));
    }

    /** collect($orders)->groupBy('customer')->map(fn($g) => $g->sum('amount')) */
    public static Map<String, BigDecimal> amountByCustomer(List<Order> orders) {
        return orders.stream()
                .collect(Collectors.groupingBy(
                        Order::customer,
                        Collectors.reducing(BigDecimal.ZERO, Order::amount, BigDecimal::add)));
    }

    /** collect($orders)->sortByDesc('amount')->take($n)->pluck('id') */
    public static List<Long> topNByAmount(List<Order> orders, int n) {
        return orders.stream()
                .sorted(Comparator.comparing(Order::amount).reversed())
                .limit(n)
                .map(Order::id)
                .toList();
    }

    /** implode(',', array_unique(array_column($orders, 'city'))) —— 保持首次出现顺序 */
    public static String distinctCities(List<Order> orders) {
        return orders.stream()
                .map(Order::city)
                .distinct()
                .collect(Collectors.joining(","));
    }

    /** collect($orders)->partition(fn($o) => $o->paid) */
    public static Map<Boolean, List<Order>> partitionByPaid(List<Order> orders) {
        return orders.stream().collect(Collectors.partitioningBy(Order::paid));
    }
}

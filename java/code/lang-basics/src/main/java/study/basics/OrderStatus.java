package study.basics;

import java.util.Set;

/**
 * Java 的 enum 是真正的类：可以有字段、构造器、方法，每个常量是单例。
 *
 * <pre>
 * // PHP 8.1
 * enum OrderStatus: string {
 *     case PENDING = 'pending';
 *     public function label(): string { return match($this) { ... }; }
 * }
 * </pre>
 *
 * 对应关系：OrderStatus::from('paid') ≈ OrderStatus.fromCode("paid")；
 *           OrderStatus::cases()     ≈ OrderStatus.values()。
 */
public enum OrderStatus {
    PENDING("pending", "待支付"),
    PAID("paid", "已支付"),
    SHIPPED("shipped", "已发货"),
    CANCELLED("cancelled", "已取消");

    private final String code;
    private final String label;

    OrderStatus(String code, String label) {
        this.code = code;
        this.label = label;
    }

    public String code() {
        return code;
    }

    public String label() {
        return label;
    }

    /** 状态机：当前状态允许流转到哪些状态。 */
    public Set<OrderStatus> nextAllowed() {
        return switch (this) {
            case PENDING -> Set.of(PAID, CANCELLED);
            case PAID -> Set.of(SHIPPED, CANCELLED);
            case SHIPPED, CANCELLED -> Set.of();
        };
    }

    public boolean canTransitTo(OrderStatus target) {
        return nextAllowed().contains(target);
    }

    public static OrderStatus fromCode(String code) {
        for (OrderStatus s : values()) {
            if (s.code.equals(code)) {
                return s;
            }
        }
        throw new IllegalArgumentException("未知状态: " + code);
    }
}

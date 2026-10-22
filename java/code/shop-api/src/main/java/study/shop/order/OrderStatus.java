package study.shop.order;

/** 订单状态：与 lang-basics 的 OrderStatus 类似，但这里的重点是 JPA 的 @Enumerated(STRING)。 */
public enum OrderStatus {
    PENDING,
    PAID,
    CANCELLED
}

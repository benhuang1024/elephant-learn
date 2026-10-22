package study.shop.order;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderResponse(
        Long id,
        String customerName,
        String status,
        BigDecimal total,
        LocalDateTime createdAt,
        long version,
        List<Item> items) {

    public record Item(Long productId, String sku, BigDecimal unitPrice, int quantity, BigDecimal subtotal) {
    }

    public static OrderResponse from(Order order) {
        List<Item> items = order.getItems().stream()
                .map(item -> new Item(
                        item.getProduct().getId(),
                        item.getSku(),
                        item.getUnitPrice(),
                        item.getQuantity(),
                        item.getSubtotal()))
                .toList();
        return new OrderResponse(
                order.getId(),
                order.getCustomerName(),
                order.getStatus().name(),
                order.getTotal(),
                order.getCreatedAt(),
                order.getVersion(),
                items);
    }
}

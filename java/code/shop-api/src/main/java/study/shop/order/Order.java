package study.shop.order;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import study.shop.product.Product;

/**
 * 聚合根：订单负责维护“总价 = 各项小计之和”和“下单扣库存”的一致性。
 * 级联保存：保存 Order 时一并保存 OrderItem（CascadeType.ALL）。
 */
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_name", nullable = false, length = 100)
    private String customerName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Version
    @Column(nullable = false)
    private long version;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    protected Order() {
        // JPA
    }

    public Order(String customerName) {
        this.customerName = customerName;
        this.status = OrderStatus.PENDING;
        this.total = BigDecimal.ZERO.setScale(2);
        this.createdAt = LocalDateTime.now();
    }

    public void addItem(Product product, int quantity) {
        product.deduct(quantity);
        OrderItem item = new OrderItem(this, product, product.getSku(), product.getPrice(), quantity);
        items.add(item);
        total = total.add(item.getSubtotal());
    }

    public Long getId() {
        return id;
    }

    public String getCustomerName() {
        return customerName;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version;
    }

    public List<OrderItem> getItems() {
        return List.copyOf(items);
    }
}

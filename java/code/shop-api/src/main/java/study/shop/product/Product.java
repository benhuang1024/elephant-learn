package study.shop.product;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import study.shop.common.InsufficientStockException;

/**
 * JPA 实体 ≈ Eloquent Model，但有两个关键差异：
 * 1. 实体是普通 Java 类，由 Hibernate 在运行时管理状态（持久化上下文），不是 ActiveRecord。
 * 2. @Version 提供乐观锁：并发下单时后提交的事务会失败，而不是静默覆盖库存。
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String sku;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    private int stock;

    @Version
    @Column(nullable = false)
    private long version;

    protected Product() {
        // JPA 需要无参构造器
    }

    public Product(String sku, String name, BigDecimal price, int stock) {
        this.sku = sku;
        this.name = name;
        this.price = price;
        this.stock = stock;
    }

    public void update(String name, BigDecimal price, int stock) {
        this.name = name;
        this.price = price;
        this.stock = stock;
    }

    /** 扣库存是领域行为，把“库存不足”的规则放在实体里，而不是散落在 Service。 */
    public void deduct(int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("扣减数量必须大于 0");
        }
        if (quantity > stock) {
            throw new InsufficientStockException(sku, quantity, stock);
        }
        stock -= quantity;
    }

    public Long getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public int getStock() {
        return stock;
    }

    public long getVersion() {
        return version;
    }
}

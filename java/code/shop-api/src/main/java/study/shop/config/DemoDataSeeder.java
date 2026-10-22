package study.shop.config;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import study.shop.product.Product;
import study.shop.product.ProductRepository;

/** 演示数据；测试里用 shop.seed-demo-data=false 关闭，避免污染断言。 */
@Component
@ConditionalOnProperty(name = "shop.seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DemoDataSeeder implements ApplicationRunner {

    private final ProductRepository products;

    public DemoDataSeeder(ProductRepository products) {
        this.products = products;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (products.count() > 0) {
            return;
        }
        products.saveAll(List.of(
                new Product("SKU-001", "机械键盘", new BigDecimal("599.00"), 20),
                new Product("SKU-002", "人体工学椅", new BigDecimal("1299.00"), 5),
                new Product("SKU-003", "限量版鼠标", new BigDecimal("399.00"), 2)));
    }
}

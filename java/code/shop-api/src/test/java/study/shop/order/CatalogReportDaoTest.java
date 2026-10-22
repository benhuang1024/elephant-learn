package study.shop.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import study.shop.product.CatalogReportDao;
import study.shop.product.Product;
import study.shop.product.ProductRepository;

@SpringBootTest
@ActiveProfiles("test")
class CatalogReportDaoTest {

    @Autowired
    private CatalogReportDao report;

    @Autowired
    private OrderService orders;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProductRepository products;

    @BeforeEach
    void setUp() {
        orderRepository.deleteAll();
        products.deleteAll();
    }

    @Test
    @DisplayName("JdbcClient 原生 SQL 与 JPA 写入共存")
    void topProductsByUnitsSold() {
        Product keyboard = products.save(new Product("SKU-001", "键盘", new BigDecimal("599.00"), 10));
        Product mouse = products.save(new Product("SKU-002", "鼠标", new BigDecimal("199.00"), 10));
        orders.place(new PlaceOrderRequest("ben", List.of(
                new PlaceOrderRequest.OrderLine(keyboard.getId(), 3),
                new PlaceOrderRequest.OrderLine(mouse.getId(), 1))));

        List<CatalogReportDao.TopProduct> top = report.topProducts(5);

        assertThat(top).hasSize(2);
        assertThat(top.getFirst().sku()).isEqualTo("SKU-001");
        assertThat(top.getFirst().unitsSold()).isEqualTo(3);
    }
}

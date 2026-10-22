package study.shop.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import study.shop.common.NotFoundException;
import study.shop.product.Product;
import study.shop.product.ProductRepository;

@SpringBootTest
@ActiveProfiles("test")
class OrderServiceTest {

    @Autowired
    private OrderService orders;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProductRepository products;

    @BeforeEach
    void cleanDatabase() {
        orderRepository.deleteAll();
        products.deleteAll();
    }

    @Test
    @DisplayName("下单成功：扣库存、保存明细、计算总价")
    void placeOrderDeductsStock() {
        Product product = products.save(new Product("SKU-001", "机械键盘", new BigDecimal("599.00"), 10));

        OrderResponse response = orders.place(new PlaceOrderRequest("ben",
                List.of(new PlaceOrderRequest.OrderLine(product.getId(), 3))));

        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(response.total()).isEqualByComparingTo("1797.00");
        assertThat(response.items()).hasSize(1);
        assertThat(products.findById(product.getId()).orElseThrow().getStock()).isEqualTo(7);
        assertThat(orderRepository.findWithItemsById(response.id())).isPresent();
    }

    @Test
    @DisplayName("第二件商品库存不足时，第一件已扣的库存随事务回滚")
    void insufficientStockRollsBackEverything() {
        Product enough = products.save(new Product("SKU-001", "机械键盘", new BigDecimal("599.00"), 10));
        Product scarce = products.save(new Product("SKU-002", "限量鼠标", new BigDecimal("399.00"), 1));

        assertThatThrownBy(() -> orders.place(new PlaceOrderRequest("ben", List.of(
                new PlaceOrderRequest.OrderLine(enough.getId(), 2),
                new PlaceOrderRequest.OrderLine(scarce.getId(), 5)))))
                .isInstanceOf(study.shop.common.InsufficientStockException.class);

        assertThat(products.findById(enough.getId()).orElseThrow().getStock()).isEqualTo(10);
        assertThat(products.findById(scarce.getId()).orElseThrow().getStock()).isEqualTo(1);
        assertThat(orderRepository.count()).isZero();
    }

    @Test
    @DisplayName("商品不存在返回 404 语义的 NotFoundException")
    void unknownProduct() {
        assertThatThrownBy(() -> orders.place(new PlaceOrderRequest("ben",
                List.of(new PlaceOrderRequest.OrderLine(9999L, 1)))))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("9999");
    }

    @Test
    @DisplayName("订单详情通过 EntityGraph 一次性取回明细")
    void getOrderWithItems() {
        Product product = products.save(new Product("SKU-001", "机械键盘", new BigDecimal("599.00"), 10));
        OrderResponse created = orders.place(new PlaceOrderRequest("alice",
                List.of(new PlaceOrderRequest.OrderLine(product.getId(), 1))));

        OrderResponse loaded = orders.get(created.id());

        assertThat(loaded.items()).hasSize(1);
        assertThat(loaded.items().getFirst().productId()).isEqualTo(product.getId());
        assertThat(loaded.customerName()).isEqualTo("alice");
    }
}

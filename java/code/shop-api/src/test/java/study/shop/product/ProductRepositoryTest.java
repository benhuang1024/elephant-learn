package study.shop.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@ActiveProfiles("test")
class ProductRepositoryTest {

    @Autowired
    private ProductRepository products;

    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Flyway 建表 + JPA validate 通过，派生查询可用")
    void saveAndFindBySku() {
        products.save(new Product("SKU-100", "显示器", new BigDecimal("1999.00"), 3));

        assertThat(products.findBySku("SKU-100")).isPresent();
        assertThat(products.findByNameContainingIgnoreCaseOrderByName("显示"))
                .extracting(Product::getSku)
                .containsExactly("SKU-100");
    }

    @Test
    @DisplayName("@Version 乐观锁：用过期的 version 更新会失败")
    void staleVersionIsRejected() {
        Product product = products.saveAndFlush(new Product("SKU-200", "摄像头", new BigDecimal("299.00"), 10));
        Long id = product.getId();

        Product stale = products.findById(id).orElseThrow();
        entityManager.detach(stale);

        Product current = products.findById(id).orElseThrow();
        current.update("摄像头", new BigDecimal("299.00"), 5);
        products.saveAndFlush(current); // version 0 -> 1

        stale.update("摄像头", new BigDecimal("299.00"), 1);

        assertThatThrownBy(() -> products.saveAndFlush(stale))
                .isInstanceOf(OptimisticLockingFailureException.class);
    }
}

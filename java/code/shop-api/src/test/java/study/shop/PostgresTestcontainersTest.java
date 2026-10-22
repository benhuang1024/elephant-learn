package study.shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import study.shop.product.Product;
import study.shop.product.ProductRepository;

/**
 * 真实 PostgreSQL：验证 Flyway 迁移在 H2 之外也能跑通。
 * 没有 Docker 时整个类自动跳过（disabledWithoutDocker）。
 */
@Tag("testcontainers")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
@ActiveProfiles("test")
class PostgresTestcontainersTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", POSTGRES::getDriverClassName);
    }

    @Autowired
    private ProductRepository products;

    @Test
    @DisplayName("PostgreSQL 上 schema 校验通过，读写正常")
    void worksAgainstPostgres() {
        Product saved = products.save(new Product("SKU-PG", "Postgres 测试商品", new BigDecimal("1.00"), 1));

        assertThat(products.findBySku("SKU-PG")).isPresent();
        assertThat(saved.getId()).isNotNull();
    }
}

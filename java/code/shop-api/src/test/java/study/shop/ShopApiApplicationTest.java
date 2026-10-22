package study.shop;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import study.shop.aop.ExecutionMetrics;
import study.shop.config.ShopProperties;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ShopApiApplicationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ShopProperties properties;

    @Autowired
    private ExecutionMetrics metrics;

    @Autowired
    private study.shop.product.ProductService productService;

    @Test
    @DisplayName("Actuator health 为 UP 且无需认证")
    void healthIsUp() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("配置绑定：shop.currency / shop.max-order-items")
    void configurationPropertiesAreBound() {
        org.assertj.core.api.Assertions.assertThat(properties.currency()).isEqualTo("CNY");
        org.assertj.core.api.Assertions.assertThat(properties.maxOrderItems()).isEqualTo(20);
    }

    @Test
    @DisplayName("未认证写入 401；HTTP Basic 认证后写入成功")
    void writeRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sku":"SKU-777","name":"测试商品","price":9.90,"stock":1}
                                """))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/products")
                        .with(httpBasic("admin", "admin123"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sku":"SKU-777","name":"测试商品","price":9.90,"stock":1}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(header().exists("X-Elapsed-Ms"));
    }

    @Test
    @DisplayName("自定义 @LogExecution 切面会记录调用次数")
    void aspectRecordsInvocation() {
        long before = metrics.count("ProductService.create");

        productService.create(new study.shop.product.ProductRequest(
                "SKU-AOP", "切面测试商品", new java.math.BigDecimal("1.00"), 1));

        org.assertj.core.api.Assertions.assertThat(metrics.count("ProductService.create"))
                .isEqualTo(before + 1);
    }
}

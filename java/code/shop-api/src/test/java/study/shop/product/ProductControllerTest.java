package study.shop.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import study.shop.security.SecurityConfig;

@WebMvcTest(ProductController.class)
@Import(SecurityConfig.class)
class ProductControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProductService productService;

    private Product product;

    @BeforeEach
    void setUp() {
        product = new Product("SKU-001", "机械键盘", new BigDecimal("599.00"), 10);
        ReflectionTestUtils.setField(product, "id", 1L);
    }

    @Test
    @DisplayName("GET 商品列表无需认证")
    void listIsPublic() throws Exception {
        given(productService.search(any())).willReturn(List.of(product));

        mvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sku").value("SKU-001"))
                .andExpect(jsonPath("$[0].price").value(599.00));
    }

    @Test
    @DisplayName("未认证的写操作返回 401")
    void writeRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sku":"SKU-009","name":"新品","price":10.00,"stock":1}
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("认证用户可以创建商品，响应 201 + Location")
    void createWithAuthentication() throws Exception {
        given(productService.create(any())).willReturn(product);

        mvc.perform(post("/api/products")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .user("admin").roles("ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sku":"SKU-001","name":"机械键盘","price":599.00,"stock":10}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/products/1"))
                .andExpect(jsonPath("$.sku").value("SKU-001"));
    }

    @Test
    @DisplayName("Bean Validation 失败返回 400 ProblemDetail，并带上字段错误")
    void validationFailureReturnsProblemDetail() throws Exception {
        mvc.perform(post("/api/products")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .user("admin").roles("ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sku":"","name":"","price":-1,"stock":0}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.price").exists());
    }

    @Test
    @DisplayName("普通用户删除商品返回 403（方法级鉴权）")
    void deleteForbiddenForCustomer() throws Exception {
        mvc.perform(delete("/api/products/1")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .user("customer").roles("CUSTOMER")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("ADMIN 可以删除商品")
    void deleteAllowedForAdmin() throws Exception {
        mvc.perform(delete("/api/products/1")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .user("admin").roles("ADMIN")))
                .andExpect(status().isNoContent());

        verify(productService).delete(1L);
    }
}

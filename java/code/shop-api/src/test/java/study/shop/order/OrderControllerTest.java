package study.shop.order;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import study.shop.common.InsufficientStockException;
import study.shop.security.SecurityConfig;

@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class)
class OrderControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private OrderService orderService;

    @Test
    @DisplayName("下单接口需要认证")
    void placeRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"customerName":"ben","items":[{"productId":1,"quantity":1}]}
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("认证后下单返回 201")
    void placeOrder() throws Exception {
        OrderResponse response = new OrderResponse(7L, "ben", "PENDING", new BigDecimal("599.00"),
                LocalDateTime.now(), 0, List.of(
                        new OrderResponse.Item(1L, "SKU-001", new BigDecimal("599.00"), 1,
                                new BigDecimal("599.00"))));
        given(orderService.place(any())).willReturn(response);

        mvc.perform(post("/api/orders")
                        .with(user("customer").roles("CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"customerName":"ben","items":[{"productId":1,"quantity":1}]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/orders/7"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.items[0].sku").value("SKU-001"));
    }

    @Test
    @DisplayName("库存不足映射为 409 ProblemDetail")
    void insufficientStockReturnsConflict() throws Exception {
        given(orderService.place(any()))
                .willThrow(new InsufficientStockException("SKU-003", 5, 2));

        mvc.perform(post("/api/orders")
                        .with(user("customer").roles("CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"customerName":"ben","items":[{"productId":3,"quantity":5}]}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.title").value("库存不足"))
                .andExpect(jsonPath("$.sku").value("SKU-003"))
                .andExpect(jsonPath("$.available").value(2));
    }

    @Test
    @DisplayName("空明细返回 400")
    void emptyItemsRejected() throws Exception {
        mvc.perform(post("/api/orders")
                        .with(user("customer").roles("CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"customerName":"ben","items":[]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.items").exists());
    }
}

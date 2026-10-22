package study.shop.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class SelfInvocationTest {

    @Autowired
    private SelfInvocationService service;

    @Test
    @DisplayName("外部调用 @Transactional 方法：事务生效")
    void proxyCallStartsTransaction() {
        assertThat(service.inner()).isTrue();
    }

    @Test
    @DisplayName("同一个 Bean 内部 this.inner()：绕过代理，@Transactional 不生效")
    void selfInvocationSkipsProxy() {
        assertThat(service.outerWithoutTransaction()).isFalse();
    }
}

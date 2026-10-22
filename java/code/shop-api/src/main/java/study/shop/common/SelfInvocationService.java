package study.shop.common;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 演示“自调用导致 @Transactional 失效”：代理只在外部调用时生效，
 * 同一个 Bean 内部 this.inner() 不会经过代理。
 */
@Service
public class SelfInvocationService {

    public boolean outerWithoutTransaction() {
        return inner();
    }

    @Transactional
    public boolean inner() {
        return TransactionSynchronizationManager.isActualTransactionActive();
    }
}

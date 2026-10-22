package study.shop.aop;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 自定义切面 ≈ Laravel 的 middleware 包裹，但切点可以是任意方法，
 * 不依赖 HTTP 请求（Service、Repository 方法都能织入）。
 */
@Aspect
@Component
public class ExecutionTimeAspect {

    private static final Logger log = LoggerFactory.getLogger(ExecutionTimeAspect.class);

    private final ExecutionMetrics metrics;

    public ExecutionTimeAspect(ExecutionMetrics metrics) {
        this.metrics = metrics;
    }

    @Around("@annotation(logExecution)")
    public Object measure(ProceedingJoinPoint joinPoint, LogExecution logExecution) throws Throwable {
        long start = System.nanoTime();
        try {
            return joinPoint.proceed();
        } finally {
            long elapsedMillis = (System.nanoTime() - start) / 1_000_000;
            String name = logExecution.value().isBlank()
                    ? joinPoint.getSignature().toShortString()
                    : logExecution.value();
            metrics.record(name);
            log.info("{} 执行耗时 {}ms", name, elapsedMillis);
        }
    }
}

package study.shop.aop;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import org.springframework.stereotype.Component;

@Component
public class ExecutionMetrics {

    private final Map<String, LongAdder> counters = new ConcurrentHashMap<>();

    public void record(String name) {
        counters.computeIfAbsent(name, key -> new LongAdder()).increment();
    }

    public long count(String name) {
        LongAdder adder = counters.get(name);
        return adder == null ? 0 : adder.sum();
    }
}

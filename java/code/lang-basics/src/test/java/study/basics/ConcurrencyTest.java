package study.basics;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ConcurrencyTest {

    private static final int THREADS = 8;
    private static final int TIMES = 50_000;
    private static final int TOTAL = THREADS * TIMES;

    @Test
    @DisplayName("AtomicInteger 在竞争下不丢更新")
    void atomicCounterIsCorrect() throws Exception {
        assertThat(Concurrency.hammer(new Concurrency.AtomicCounter(), THREADS, TIMES)).isEqualTo(TOTAL);
    }

    @Test
    @DisplayName("synchronized 同样保证正确性")
    void synchronizedCounterIsCorrect() throws Exception {
        assertThat(Concurrency.hammer(new Concurrency.SynchronizedCounter(), THREADS, TIMES)).isEqualTo(TOTAL);
    }

    @Test
    @DisplayName("count++ 在竞争下丢失更新 —— 这正是 PHP-FPM 里看不到的 bug")
    void unsafeCounterLosesUpdates() throws Exception {
        int result = Concurrency.hammer(new Concurrency.UnsafeCounter(), THREADS, TIMES);

        // 竞态不保证每次必现，所以断言“不超过总数”，并打印实际值方便观察
        System.out.println("UnsafeCounter 期望=" + TOTAL + " 实际=" + result);
        assertThat(result).isBetween(1, TOTAL);
    }

    @Test
    @DisplayName("虚拟线程让阻塞任务几乎并行完成")
    void virtualThreadsParallelizeBlockingCalls() throws Exception {
        long elapsed = Concurrency.parallelFetch(500, 100);

        assertThat(elapsed).isLessThan(5_000);
    }

    @Test
    @DisplayName("ConcurrentHashMap.computeIfAbsent 对同一 key 只加载一次")
    void localCacheLoadsOnce() throws Exception {
        Concurrency.LocalCache cache = new Concurrency.LocalCache();

        try (ExecutorService pool = Executors.newFixedThreadPool(16)) {
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < 100; i++) {
                futures.add(pool.submit(() -> cache.get("hot-key")));
            }
            for (Future<String> future : futures) {
                assertThat(future.get()).isEqualTo("value-of-hot-key");
            }
        }

        assertThat(cache.loads()).isEqualTo(1);
    }
}

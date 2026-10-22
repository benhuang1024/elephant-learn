package study.basics;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * PHP-FPM 是 share-nothing：每个请求一个独立进程上下文，请求结束内存全部释放，几乎不用考虑线程安全。
 * Java Web 应用是 <b>一个常驻进程、多个线程同时处理请求</b>，对象（尤其是 Spring 单例 Bean）被所有请求共享。
 *
 * 这是 PHP 架构师转 Java 最需要“换脑子”的地方：任何可变的共享状态都必须考虑并发。
 */
public final class Concurrency {

    private Concurrency() {
    }

    public interface Counter {
        void increment();

        int get();
    }

    /** 错误示范：count++ 不是原子操作（读-改-写三步），多线程下会丢失更新。 */
    public static class UnsafeCounter implements Counter {
        private int count;

        @Override
        public void increment() {
            count++;
        }

        @Override
        public int get() {
            return count;
        }
    }

    /** 方案一：原子类（CAS，无锁）。 */
    public static class AtomicCounter implements Counter {
        private final AtomicInteger count = new AtomicInteger();

        @Override
        public void increment() {
            count.incrementAndGet();
        }

        @Override
        public int get() {
            return count.get();
        }
    }

    /** 方案二：synchronized 加锁（简单直接，竞争激烈时性能较差）。 */
    public static class SynchronizedCounter implements Counter {
        private int count;

        @Override
        public synchronized void increment() {
            count++;
        }

        @Override
        public synchronized int get() {
            return count;
        }
    }

    /** 用 N 个线程各自累加 times 次。 */
    public static int hammer(Counter counter, int threads, int times) throws InterruptedException {
        List<Thread> list = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Thread t = Thread.ofPlatform().start(() -> {
                for (int j = 0; j < times; j++) {
                    counter.increment();
                }
            });
            list.add(t);
        }
        for (Thread t : list) {
            t.join();
        }
        return counter.get();
    }

    /**
     * 虚拟线程（Java 21+）：极轻量，可以开几十万个，阻塞 IO 时自动让出底层平台线程。
     * 写法是同步阻塞风格，效果接近 Swoole 协程 / ReactPHP，但不需要 async/await。
     */
    public static long parallelFetch(int tasks, long sleepMillis) throws Exception {
        long start = System.nanoTime();
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < tasks; i++) {
                int n = i;
                futures.add(executor.submit(() -> {
                    Thread.sleep(sleepMillis); // 模拟一次 HTTP / DB 调用
                    return n;
                }));
            }
            for (Future<Integer> f : futures) {
                f.get();
            }
        }
        return (System.nanoTime() - start) / 1_000_000;
    }

    /** 线程安全的“进程内缓存”。PHP 里只能借助 APCu/Redis，Java 可以直接用内存，但要用并发容器。 */
    public static class LocalCache {
        private final Map<String, String> map = new ConcurrentHashMap<>();
        private final AtomicInteger loads = new AtomicInteger();

        /** computeIfAbsent 对同一个 key 是原子的：并发请求只会加载一次。 */
        public String get(String key) {
            return map.computeIfAbsent(key, k -> {
                loads.incrementAndGet();
                return "value-of-" + k;
            });
        }

        public int loads() {
            return loads.get();
        }
    }
}

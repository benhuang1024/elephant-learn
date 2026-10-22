package study.basics;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

/**
 * 异常：Java 分 <b>受检异常</b>（checked，继承 Exception）和 <b>非受检异常</b>（unchecked，继承 RuntimeException）。
 * 受检异常必须 catch 或在方法签名 throws 声明，否则编译不过。PHP 没有这个概念。
 *
 * 业界（包括 Spring 自身）的主流做法：业务异常一律继承 RuntimeException，
 * 在边界处（Controller 层的全局异常处理器）统一转换为 HTTP 响应。
 */
public final class Exceptions {

    private Exceptions() {
    }

    /** 业务异常：非受检，调用方不被强制处理。 */
    public static class InsufficientStockException extends RuntimeException {
        public InsufficientStockException(String sku, int wanted, int left) {
            super("库存不足 sku=%s 需要=%d 剩余=%d".formatted(sku, wanted, left));
        }
    }

    public static void deduct(String sku, int wanted, int left) {
        if (wanted > left) {
            throw new InsufficientStockException(sku, wanted, left);
        }
    }

    /**
     * try-with-resources ≈ PHP 里 try { ... } finally { fclose($fp); }
     * 实现了 AutoCloseable 的资源会在块结束时自动关闭（数据库连接、文件、锁……）。
     */
    public static List<String> readLines(String text) throws IOException {
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new StringReader(text))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
        }
        return lines;
    }

    /** 把受检异常包装成非受检异常 —— 在 lambda / Stream 中很常见，因为函数式接口不允许抛受检异常。 */
    public static List<String> readLinesUnchecked(String text) {
        try {
            return readLines(text);
        } catch (IOException e) {
            throw new UncheckedIOException(e); // 保留原始异常作为 cause，不要吞掉
        }
    }

    /** 多异常捕获，类似 PHP 8 的 catch (A | B $e) */
    public static String parse(String input) {
        try {
            return "int:" + Integer.parseInt(input);
        } catch (NumberFormatException | NullPointerException e) {
            return "invalid:" + e.getClass().getSimpleName();
        }
    }
}

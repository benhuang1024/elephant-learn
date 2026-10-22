package study.basics;

/**
 * 字符串与相等性 —— PHP 程序员最常见的低级 bug 来源。
 *
 * - == 比较的是 <b>引用</b>（是不是同一个对象），比较内容必须用 equals()。
 *   类似 PHP 中对象的 === （同一实例），而不是字符串的 ===。
 * - String 不可变；循环拼接用 StringBuilder（或 String.join / Collectors.joining）。
 * - 没有字符串插值，用 formatted() / String.format()，或 + 拼接。
 */
public final class StringsAndEquality {

    private StringsAndEquality() {
    }

    public static boolean sameReference(String a, String b) {
        return a == b;
    }

    public static boolean sameContent(String a, String b) {
        return a.equals(b);
    }

    /** sprintf('%s 买了 %d 件，共 %.2f 元', ...) */
    public static String receipt(String name, int qty, double total) {
        return "%s 买了 %d 件，共 %.2f 元".formatted(name, qty, total);
    }

    /** 文本块 ≈ PHP heredoc（但没有变量插值）。 */
    public static String sqlTemplate() {
        return """
                SELECT id, name
                FROM product
                WHERE price > ?
                """;
    }

    public static String repeatJoin(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (i > 0) {
                sb.append('-');
            }
            sb.append(i);
        }
        return sb.toString();
    }

    /** 整数包装类陷阱：Integer 在 -128..127 之间有缓存，超出后 == 为 false。 */
    public static boolean integerIdentity(Integer a, Integer b) {
        return a == b;
    }
}

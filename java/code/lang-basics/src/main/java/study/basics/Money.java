package study.basics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * record = 不可变值对象，编译器自动生成构造器、访问器、equals/hashCode/toString。
 *
 * <pre>
 * // PHP 8.2 近似写法
 * final readonly class Money {
 *     public function __construct(public string $amount, public string $currency) {}
 * }
 * </pre>
 *
 * 要点：
 * 1. 金额永远用 BigDecimal，不要用 double（与 PHP 里用 bcmath / brick/money 同理）。
 * 2. 访问器是 amount() 而不是 getAmount()。
 * 3. equals 按字段值比较 —— 两个 new Money(10, "CNY") 相等，这是值对象语义。
 */
public record Money(BigDecimal amount, String currency) {

    /** 紧凑构造器：只写校验/规范化逻辑，字段赋值由编译器补上。 */
    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("金额不能为负: " + amount);
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);
    }

    /** 静态工厂方法，相当于 PHP 的 named constructor：Money::of('9.99', 'CNY') */
    public static Money of(String amount, String currency) {
        return new Money(new BigDecimal(amount), currency);
    }

    /** 不可变对象的“修改”总是返回新实例（类似 PHP 的 withXxx() / Carbon::copy()）。 */
    public Money plus(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("币种不同: " + currency + " vs " + other.currency);
        }
        return new Money(amount.add(other.amount), currency);
    }

    public Money times(int quantity) {
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)), currency);
    }
}

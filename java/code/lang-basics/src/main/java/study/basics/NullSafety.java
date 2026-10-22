package study.basics;

import java.util.Map;
import java.util.Optional;

/**
 * null 处理：PHP 有 ?-> 和 ??，Java 没有这两个运算符，惯用 Optional（返回值）+ Objects.requireNonNull（参数）。
 *
 * <pre>
 * // PHP
 * $city = $user?->address?->city ?? '未知';
 * </pre>
 *
 * 规则（团队规范里常见的写法）：
 * - Optional 只用作 <b>方法返回值</b>，表示“可能没有”；不要用作字段、参数、集合元素。
 * - 集合永远返回空集合而不是 null。
 */
public final class NullSafety {

    private NullSafety() {
    }

    public record Address(String city) {
    }

    public record User(String name, Address address) {
    }

    private static final Map<String, User> USERS = Map.of(
            "ben", new User("ben", new Address("上海")),
            "nomad", new User("nomad", null));

    public static Optional<User> findUser(String name) {
        return Optional.ofNullable(USERS.get(name));
    }

    /** 等价于 PHP：$users[$name]?->address?->city ?? '未知' */
    public static String cityOf(String name) {
        return findUser(name)
                .map(User::address)
                .map(Address::city)
                .orElse("未知");
    }

    /** 等价于 PHP：$user = $repo->find($id) ?? throw new NotFoundException() */
    public static User mustFind(String name) {
        return findUser(name).orElseThrow(() -> new IllegalStateException("用户不存在: " + name));
    }
}

package study.basics;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

/**
 * 泛型：PHP 只有 PHPStan/Psalm 的 @template 注释，Java 是编译器强制检查的。
 *
 * <pre>
 * // PHP (PHPStan)
 * /** @template T  @template ID *\/
 * interface Repository { /** @return T|null *\/ public function find($id); }
 * </pre>
 *
 * 注意“类型擦除”：运行时 List&lt;String&gt; 和 List&lt;Integer&gt; 是同一个类，
 * 所以不能写 new T()、不能 instanceof List&lt;String&gt;。
 */
public final class Generics {

    private Generics() {
    }

    public interface Identifiable<ID> {
        ID id();
    }

    /** 泛型接口：T 必须实现 Identifiable&lt;ID&gt;（上界约束）。 */
    public interface Repository<T extends Identifiable<ID>, ID> {
        T save(T entity);

        Optional<T> findById(ID id);

        List<T> findAll();
    }

    public static class InMemoryRepository<T extends Identifiable<ID>, ID> implements Repository<T, ID> {
        // LinkedHashMap 保留插入顺序 —— 最接近 PHP 关联数组的行为
        private final Map<ID, T> store = new LinkedHashMap<>();

        @Override
        public T save(T entity) {
            store.put(entity.id(), entity);
            return entity;
        }

        @Override
        public Optional<T> findById(ID id) {
            return Optional.ofNullable(store.get(id));
        }

        @Override
        public List<T> findAll() {
            return List.copyOf(store.values());
        }
    }

    public record User(Long id, String name) implements Identifiable<Long> {
    }

    /** 泛型方法：&lt;T, K&gt; 写在返回类型前。等价于 PHP 的 array_column($items, null, 'key')。 */
    public static <T, K> Map<K, T> keyBy(Collection<T> items, Function<? super T, ? extends K> keyFn) {
        Map<K, T> result = new LinkedHashMap<>();
        for (T item : items) {
            result.put(keyFn.apply(item), item);
        }
        return result;
    }

    /**
     * 通配符 PECS：Producer Extends, Consumer Super。
     * 参数只读取元素（生产者）用 ? extends T —— 这样 List&lt;Integer&gt; 也能传给 List&lt;? extends Number&gt;。
     */
    public static double sum(List<? extends Number> numbers) {
        double total = 0;
        for (Number n : numbers) {
            total += n.doubleValue();
        }
        return total;
    }

    /** 参数只写入元素（消费者）用 ? super T。 */
    public static void addDefaults(List<? super Integer> target) {
        target.add(0);
        target.add(1);
    }

    public static <T extends Comparable<? super T>> T max(List<T> items) {
        return items.stream().max(Comparator.naturalOrder()).orElseThrow();
    }

    public static List<Object> mixedList() {
        List<Object> list = new ArrayList<>();
        addDefaults(list); // List<Object> 是 List<? super Integer>，合法
        return list;
    }
}

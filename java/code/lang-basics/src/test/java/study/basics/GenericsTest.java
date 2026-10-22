package study.basics;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GenericsTest {

    @Test
    @DisplayName("泛型仓储保留插入顺序，findById 返回 Optional")
    void inMemoryRepository() {
        Generics.InMemoryRepository<Generics.User, Long> repo = new Generics.InMemoryRepository<>();
        repo.save(new Generics.User(1L, "ben"));
        repo.save(new Generics.User(2L, "alice"));

        assertThat(repo.findById(2L)).contains(new Generics.User(2L, "alice"));
        assertThat(repo.findById(99L)).isEmpty();
        assertThat(repo.findAll()).extracting(Generics.User::name).containsExactly("ben", "alice");
    }

    @Test
    @DisplayName("keyBy 等价于 array_column($items, null, 'id')")
    void keyBy() {
        Map<Long, Generics.User> byId = Generics.keyBy(
                List.of(new Generics.User(1L, "ben"), new Generics.User(2L, "alice")),
                Generics.User::id);

        assertThat(byId).containsOnlyKeys(1L, 2L);
        assertThat(byId.get(2L).name()).isEqualTo("alice");
    }

    @Test
    @DisplayName("? extends Number 让 List<Integer> 也能被求和")
    void sumAcceptsSubtypes() {
        assertThat(Generics.sum(List.of(1, 2, 3))).isEqualTo(6.0);
        assertThat(Generics.sum(List.of(1.5, 2.5))).isEqualTo(4.0);
    }

    @Test
    @DisplayName("? super Integer 让 List<Object> 也能作为写入目标")
    void addDefaultsAcceptsSupertype() {
        assertThat(Generics.mixedList()).containsExactly(0, 1);
    }

    @Test
    @DisplayName("有界泛型方法只接受可比较类型")
    void max() {
        assertThat(Generics.max(List.of("b", "c", "a"))).isEqualTo("c");
    }
}

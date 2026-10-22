package study.shop.order;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

    /**
     * EntityGraph 等价于 Eloquent 的 with('items.product')：
     * 一条 SQL join 取回订单和明细，避免 N+1。
     */
    @EntityGraph(attributePaths = {"items", "items.product"})
    Optional<Order> findWithItemsById(Long id);

    @EntityGraph(attributePaths = {"items", "items.product"})
    List<Order> findAllByOrderByCreatedAtDesc();
}

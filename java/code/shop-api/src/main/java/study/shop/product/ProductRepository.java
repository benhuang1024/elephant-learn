package study.shop.product;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data 根据方法名生成查询：findBySku → WHERE sku = ?
 * 不需要写实现类，也不需要在 Model 里写 scope。
 */
public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    List<Product> findByNameContainingIgnoreCaseOrderByName(String keyword);
}

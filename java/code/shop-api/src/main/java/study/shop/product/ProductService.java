package study.shop.product;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import study.shop.aop.LogExecution;
import study.shop.common.ConflictException;
import study.shop.common.NotFoundException;

@Service
public class ProductService {

    private final ProductRepository products;

    public ProductService(ProductRepository products) {
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<Product> search(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return products.findAll(Sort.by("name"));
        }
        return products.findByNameContainingIgnoreCaseOrderByName(keyword.trim());
    }

    @Transactional(readOnly = true)
    public Product get(long id) {
        return products.findById(id).orElseThrow(() -> new NotFoundException("商品", id));
    }

    @Transactional
    @LogExecution("ProductService.create")
    public Product create(ProductRequest request) {
        products.findBySku(request.sku()).ifPresent(existing -> {
            throw new ConflictException("SKU 已存在: " + existing.getSku());
        });
        Product product = new Product(request.sku(), request.name(), request.price(), request.stock());
        return products.save(product);
    }

    /**
     * 没有 save()：实体处于持久化上下文，事务提交时 Hibernate 自动检测脏字段并 UPDATE。
     * 这是 JPA 与 Eloquent 最大的心智差异之一。
     */
    @Transactional
    public Product update(long id, UpdateProductRequest request) {
        Product product = get(id);
        product.update(request.name(), request.price(), request.stock());
        return product;
    }

    @Transactional
    public void delete(long id) {
        products.delete(get(id));
    }
}

package study.shop.order;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import study.shop.aop.LogExecution;
import study.shop.common.NotFoundException;
import study.shop.config.ShopProperties;
import study.shop.product.Product;
import study.shop.product.ProductRepository;

@Service
public class OrderService {

    private final OrderRepository orders;
    private final ProductRepository products;
    private final ShopProperties properties;

    public OrderService(OrderRepository orders, ProductRepository products, ShopProperties properties) {
        this.orders = orders;
        this.products = products;
        this.properties = properties;
    }

    /**
     * 整个方法在一个事务中：
     * 任意一步抛异常（库存不足、乐观锁冲突），前面已扣的库存都会回滚。
     */
    @Transactional
    @LogExecution("OrderService.place")
    public OrderResponse place(PlaceOrderRequest request) {
        if (request.items().size() > properties.maxOrderItems()) {
            throw new IllegalArgumentException("单笔订单最多 " + properties.maxOrderItems() + " 个商品行");
        }

        Order order = new Order(request.customerName());
        for (PlaceOrderRequest.OrderLine line : request.items()) {
            Product product = products.findById(line.productId())
                    .orElseThrow(() -> new NotFoundException("商品", line.productId()));
            order.addItem(product, line.quantity());
        }
        return OrderResponse.from(orders.save(order));
    }

    @Transactional(readOnly = true)
    public OrderResponse get(long id) {
        Order order = orders.findWithItemsById(id)
                .orElseThrow(() -> new NotFoundException("订单", id));
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> list() {
        return orders.findAllByOrderByCreatedAtDesc().stream().map(OrderResponse::from).toList();
    }
}

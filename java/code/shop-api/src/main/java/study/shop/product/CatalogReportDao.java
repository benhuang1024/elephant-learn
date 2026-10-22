package study.shop.product;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * 复杂报表不必强行用 JPA：JdbcClient 是 Spring 6.1+ 的轻量 SQL 客户端，
 * 比 JdbcTemplate 链式更顺，也不需要 ORM 的实体映射。
 */
@Repository
public class CatalogReportDao {

    private final JdbcClient jdbcClient;

    public CatalogReportDao(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public record TopProduct(String sku, String name, long unitsSold) {
    }

    public List<TopProduct> topProducts(int limit) {
        return jdbcClient.sql("""
                        SELECT p.sku, p.name, COALESCE(SUM(oi.quantity), 0) AS units_sold
                        FROM products p
                        LEFT JOIN order_items oi ON oi.product_id = p.id
                        GROUP BY p.id, p.sku, p.name
                        ORDER BY units_sold DESC, p.name
                        LIMIT :limit
                        """)
                .param("limit", limit)
                .query((rs, rowNum) -> new TopProduct(
                        rs.getString("sku"),
                        rs.getString("name"),
                        rs.getLong("units_sold")))
                .list();
    }
}

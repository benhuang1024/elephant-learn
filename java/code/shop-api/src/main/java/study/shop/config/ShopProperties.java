package study.shop.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * application.yml 中 shop.* 的类型安全绑定。
 * 对照 Laravel：config('shop.currency') 的字符串魔法，这里编译期就能检查字段名和类型。
 */
@Validated
@ConfigurationProperties(prefix = "shop")
public record ShopProperties(@NotBlank String currency, @Min(1) @Max(100) int maxOrderItems) {
}

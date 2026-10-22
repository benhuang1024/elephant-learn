package study.shop.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record PlaceOrderRequest(
        @NotBlank @Size(max = 100) String customerName,
        @NotEmpty @Size(max = 20) List<@Valid OrderLine> items) {

    public record OrderLine(
            @NotNull @Positive Long productId,
            @Min(1) @Max(99) int quantity) {
    }
}

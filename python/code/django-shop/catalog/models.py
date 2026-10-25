"""商品模型：Django ORM ≈ Eloquent（Active Record），模型自己带 CRUD 方法。"""

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class Product(models.Model):
    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    stock = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["name"], name="catalog_product_name_idx")]

    def __str__(self) -> str:
        return f"{self.sku} {self.name}"

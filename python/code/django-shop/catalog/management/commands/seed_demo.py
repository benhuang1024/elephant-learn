"""演示数据命令：``uv run python manage.py seed_demo``。

等价于 Laravel 的 ``php artisan db:seed``；这里用 update_or_create 保证可重复执行。
"""

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from catalog.models import Product

PRODUCTS = (
    ("SKU-001", "机械键盘", Decimal("599.00"), 20),
    ("SKU-002", "人体工学椅", Decimal("1299.00"), 5),
    ("SKU-003", "限量版鼠标", Decimal("399.00"), 2),
)


class Command(BaseCommand):
    help = "插入演示商品与演示账号（admin/admin123、customer/customer123）"

    def handle(self, *args: Any, **options: Any) -> None:
        for sku, name, price, stock in PRODUCTS:
            Product.objects.update_or_create(
                sku=sku,
                defaults={"name": name, "price": price, "stock": stock},
            )

        user_model = get_user_model()
        admin, created = user_model.objects.get_or_create(
            username="admin",
            defaults={"is_staff": True, "is_superuser": True, "email": "admin@example.com"},
        )
        if created:
            admin.set_password("admin123")
            admin.save()
        customer, created = user_model.objects.get_or_create(username="customer")
        if created:
            customer.set_password("customer123")
            customer.save()

        self.stdout.write(self.style.SUCCESS("演示数据与账号已就绪"))

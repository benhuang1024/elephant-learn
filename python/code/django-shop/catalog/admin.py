"""Admin：几乎零代码获得带搜索、筛选、分页的后台——Laravel Nova/Filament 的内建替代。"""

from django.contrib import admin

from catalog.models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "sku", "name", "price", "stock", "updated_at")
    search_fields = ("sku", "name")
    list_filter = ("stock",)
    ordering = ("name",)
    readonly_fields = ("created_at", "updated_at")

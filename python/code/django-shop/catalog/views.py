"""ViewSet：一个类同时提供 list/retrieve/create/update/destroy。"""

from django.db.models import QuerySet
from rest_framework import viewsets
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser, IsAuthenticated

from catalog.models import Product
from catalog.serializers import ProductSerializer


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    queryset = Product.objects.all()

    def get_queryset(self) -> QuerySet[Product]:
        queryset = super().get_queryset()
        keyword = self.request.query_params.get("q")
        if keyword:
            queryset = queryset.filter(name__icontains=keyword.strip())
        return queryset

    def get_permissions(self) -> list[BasePermission]:
        """读公开、写需登录、删除仅管理员——与 FastAPI 版一致。"""
        if self.action in {"list", "retrieve"}:
            return [AllowAny()]
        if self.action == "destroy":
            return [IsAdminUser()]
        return [IsAuthenticated()]

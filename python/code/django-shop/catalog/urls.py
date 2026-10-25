from rest_framework.routers import DefaultRouter

from catalog.views import ProductViewSet

router = DefaultRouter(trailing_slash=False)
router.register("products", ProductViewSet, basename="product")

urlpatterns = router.urls

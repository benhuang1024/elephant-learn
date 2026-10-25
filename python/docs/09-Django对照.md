# 09 Django 对照

> **配套代码（django-shop）**
> 设置：[config/settings.py](../code/django-shop/config/settings.py)
> URL：[config/urls.py](../code/django-shop/config/urls.py)
> 模型：[catalog/models.py](../code/django-shop/catalog/models.py)
> 序列化器：[catalog/serializers.py](../code/django-shop/catalog/serializers.py)
> ViewSet：[catalog/views.py](../code/django-shop/catalog/views.py)
> Admin：[catalog/admin.py](../code/django-shop/catalog/admin.py)
> 演示数据命令：[seed_demo.py](../code/django-shop/catalog/management/commands/seed_demo.py)
> 迁移：[0001_initial.py](../code/django-shop/catalog/migrations/0001_initial.py)
> 测试：[test_products_api.py](../code/django-shop/tests/test_products_api.py)、[test_admin_and_seed.py](../code/django-shop/tests/test_admin_and_seed.py)

本仓库实际锁定 **Django 6.1.2 + DRF 3.18.3**。本章不追求完整，只建立“Laravel 架构师如何读 Django”的映射。

## 1. Django ≈ Laravel 的哪些部分

| Laravel | Django / DRF |
|---|---|
| `app/Models/Product.php` | `catalog/models.py` |
| Eloquent | Django ORM（Active Record） |
| `database/migrations` | `catalog/migrations` |
| `routes/web.php` / `api.php` | `config/urls.py` + `catalog/urls.py` |
| Controller | View / ViewSet |
| FormRequest + Resource | Serializer |
| Middleware | MIDDLEWARE 列表 |
| Service Provider | AppConfig / settings（概念不同） |
| `php artisan` | `manage.py` |
| Blade | Django Templates |
| Laravel Nova / Filament | **Django Admin（内建）** |
| Sanctum / Passport | `django.contrib.auth` + DRF 认证类 |
| Queue / Scheduler | 需第三方（Celery/RQ） |
| Horizon | 无内建对应 |

一句话：**Django 把 Laravel 的很多“包”做进了框架**（Admin、Auth、ORM、迁移、模板），代价是耦合更深、约定更重。

## 2. 工程结构

```
django-shop/
├── manage.py
├── config/              # 项目：settings / urls / wsgi
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── catalog/             # 应用：模型、视图、Admin、迁移
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   ├── admin.py
│   ├── urls.py
│   ├── migrations/
│   └── management/commands/seed_demo.py
├── tests/
└── pyproject.toml
```

- **project**（`config`）负责整体配置与 URL 汇总。
- **app**（`catalog`）是可复用业务模块，必须加入 `INSTALLED_APPS`。
- 与 Laravel 的 `app/` 不同，Django 鼓励一个项目多个 app，app 之间通过模型/服务交互。

## 3. settings 与配置

```python
INSTALLED_APPS = [
    ...,
    "rest_framework",
    "catalog",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_DB_PATH", str(BASE_DIR / "db.sqlite3")),
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.BasicAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": None,
}
```

与 FastAPI 的 pydantic-settings 对比：

| | Django | FastAPI |
|---|---|---|
| 配置来源 | `settings.py` + 环境变量 | `BaseSettings` |
| 类型检查 | 运行时弱，靠 `django-environ` 等 | Pydantic 强类型 |
| 分层 | 单一 `settings.py` / 多文件 | Settings 类可组合 |
| 测试覆盖 | `@override_settings` | 构造新 Settings |

Django 的 settings 是**模块级全局**，测试用 `override_settings` 或环境变量；FastAPI 更容易做依赖注入。

## 4. 模型与迁移

```python
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
```

| 操作 | Django ORM | SQLAlchemy |
|---|---|---|
| 查询 | `Product.objects.filter(...)` | `session.scalars(select(Product)...)` |
| 单条 | `Product.objects.get(pk=1)` | `session.get(Product, 1)` |
| 新建 | `Product.objects.create(...)` | `session.add(Product(...))` |
| 保存修改 | `obj.save()` | 自动 flush / `commit()` |
| 删除 | `obj.delete()` | `session.delete(obj)` |
| 关联 | `ForeignKey` / `related_name` | `relationship` |
| 事务 | `with transaction.atomic():` | `session.commit()` / rollback |
| 迁移 | `makemigrations` + `migrate` | Alembic |

Django ORM 是 Active Record：对象自带查询与保存；SQLAlchemy 是 Data Mapper：对象不知道数据库。架构上：

- Django ORM 上手快，业务简单时非常高效。
- 复杂领域/多数据源/细粒度事务控制时，Data Mapper 更容易分层。
- 两者都能写出大泥球；关键是有没有 Service/Repository 边界。

### 迁移命令

```bash
uv run python manage.py makemigrations catalog
uv run python manage.py migrate
uv run python manage.py showmigrations
uv run python manage.py sqlmigrate catalog 0001
```

对比 Alembic：Django 自动生成质量较高，但**数据迁移**仍要手写 `RunPython`；生产同样要求 review。

## 5. Admin：Django 的杀手锏

```python
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "sku", "name", "price", "stock", "updated_at")
    search_fields = ("sku", "name")
    list_filter = ("stock",)
    ordering = ("name",)
    readonly_fields = ("created_at", "updated_at")
```

加上 URL 与 `INSTALLED_APPS`，立即获得：

- 列表、搜索、筛选、排序、分页；
- 新增/编辑表单、字段校验；
- 权限（staff / superuser）；
- 操作日志（需开启 `LogEntry`，Admin 默认记录）；
- 关联对象选择器。

与 Laravel 对比：

| Laravel | Django |
|---|---|
| Nova / Filament（付费/第三方） | 内建 Admin |
| 资源类定义 | `ModelAdmin` |
| 自定义字段 | `formfield_overrides` |
| 权限 | `has_view_permission` 等 |

小团队/内部系统，Admin 能省掉大量后台开发；对外产品仍需自定义前端。

## 6. Auth 与权限

Django 内建：

- `User` / `Group` / `Permission`；
- 密码哈希（默认 PBKDF2，可换 Argon2）；
- 登录/登出视图；
- Session + CSRF；
- Admin 的 staff 权限。

DRF 认证类：

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.BasicAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
}
```

ViewSet 权限：

```python
def get_permissions(self) -> list[BasePermission]:
    if self.action in {"list", "retrieve"}:
        return [AllowAny()]
    if self.action == "destroy":
        return [IsAdminUser()]
    return [IsAuthenticated()]
```

对应 FastAPI：

```python
_user: CurrentUser          # 登录即可
_admin: AdminUser           # admin 角色
```

差异：

- DRF 的 Session 认证依赖 Cookie + CSRF；纯 API 通常只用 Token/JWT。
- Django 的 `is_staff` 控制 Admin 访问，`is_superuser` 拥有全部权限；业务角色要自己建模（Group/自定义字段）。
- FastAPI 版本用 Argon2 哈希演示账号；Django 的 `seed_demo` 用 `set_password`（默认 PBKDF2），生产可切 Argon2。

## 7. DRF 路由与序列化

```python
router = DefaultRouter(trailing_slash=False)
router.register("products", ProductViewSet, basename="product")
urlpatterns = router.urls
```

得到：

| 方法 | 路径 | 动作 |
|---|---|---|
| GET | `/api/products` | list |
| POST | `/api/products` | create |
| GET | `/api/products/{pk}` | retrieve |
| PUT/PATCH | `/api/products/{pk}` | update/partial_update |
| DELETE | `/api/products/{pk}` | destroy |

`trailing_slash=False` 是为了和 FastAPI/Java 版路径一致；Django 默认喜欢尾斜杠。

序列化：

```python
class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "sku", "name", "price", "stock", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
```

与 Pydantic 对比：

| 维度 | DRF Serializer | Pydantic |
|---|---|---|
| 输入校验 | `is_valid()` | 自动 |
| 输出 | `.data` | `model_dump()` |
| ORM 集成 | ModelSerializer | `from_attributes` |
| Decimal 输出 | 默认字符串 | 默认字符串（本项目改数字） |
| 嵌套 | `Serializer(many=True)` | `list[Model]` |
| 文档 | 需 drf-spectacular | 内建 OpenAPI |

本仓库刻意保留差异，方便对照：Django 版金额是 `"599.00"` 字符串，FastAPI 版是 `599.0` 数字。

## 8. 何时选 Django，何时选 FastAPI

| 场景 | 推荐 | 理由 |
|---|---|---|
| 内部后台/CRUD/报表 | **Django** | Admin、Auth、ORM 一步到位 |
| 内容站/多模板页面 | Django | 模板、Form、i18n 成熟 |
| 高并发 API/BFF | **FastAPI** | 轻量、异步、Pydantic/OpenAPI |
| 算法/数据服务 | FastAPI | 与 Python 数据生态贴合 |
| 已有 Django 团队 | Django | 迁移成本最低 |
| 需要精细分层/多数据库 | 两者皆可，倾向 FastAPI + SQLAlchemy | 显式依赖、Session 控制 |
| 需要 WebSocket/流式 | FastAPI/Starlette | ASGI 原生 |
| 超小服务/脚本化 API | FastAPI | 代码量小 |

不要被“异步更快”迷惑：Django 也能跑 ASGI、也能高并发；FastAPI 也能写同步端点。**团队熟悉度与交付速度**通常比框架基准测试更重要。

## 9. Laravel 架构师读 Django 的检查清单

1. `INSTALLED_APPS` 里有哪些第三方 app？它们注入什么中间件/模型？
2. `settings.py` 的数据库、缓存、队列、静态文件、日志配置。
3. URL 汇总顺序与命名空间。
4. 每个 app 的 `models.py`：迁移是否与模型一致？有没有 `null=True` 与业务语义冲突？
5. Admin 是否暴露了不该给运营看的字段/操作？
6. 认证/权限：`AUTHENTICATION_BACKENDS`、DRF 默认权限、对象级权限。
7. 事务边界：`transaction.atomic()` 在哪一层？有没有跨请求的 Session？
8. 查询：`select_related` / `prefetch_related` 是否覆盖列表接口？
9. 迁移策略：是否有数据迁移、锁表风险、回滚方案？
10. 部署：WSGI/ASGI、静态文件、`collectstatic`、worker、健康检查。

## 10. 本章验收

```bash
cd code/django-shop
uv run pytest
uv run python manage.py check

uv run python manage.py migrate
uv run python manage.py seed_demo
uv run python manage.py runserver 8000

# 另开终端
curl -s localhost:8000/api/products
curl -i -u admin:admin123 -X POST localhost:8000/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":"1999.00","stock":3}'
```

打开 `http://127.0.0.1:8000/admin/`，用 `admin/admin123` 登录，观察 Admin 的搜索、筛选与编辑。

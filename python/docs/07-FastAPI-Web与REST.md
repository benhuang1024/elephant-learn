# 07 FastAPI Web 与 REST

> **配套代码（shop-api）**
> 应用工厂 / 中间件 / 健康检查：[main.py](../code/shop-api/src/shop/main.py)
> 商品接口：[product/router.py](../code/shop-api/src/shop/product/router.py)、[product/schemas.py](../code/shop-api/src/shop/product/schemas.py)、[product/service.py](../code/shop-api/src/shop/product/service.py)
> 订单接口：[order/router.py](../code/shop-api/src/shop/order/router.py)、[order/schemas.py](../code/shop-api/src/shop/order/schemas.py)
> 全局异常 → Problem Details：[errors.py](../code/shop-api/src/shop/errors.py)
> 认证与角色：[security.py](../code/shop-api/src/shop/security.py)
> 接口测试：[test_products_api.py](../code/shop-api/tests/test_products_api.py)、[test_orders_api.py](../code/shop-api/tests/test_orders_api.py)

FastAPI 的定位接近“Laravel 的路由 + FormRequest + API Resource + 自动 OpenAPI”，但依赖注入更接近 Spring 的构造注入，且默认异步。

## 1. 概念映射

| Laravel | FastAPI |
|---|---|
| `routes/api.php` | `APIRouter` + 装饰器 |
| `Route::get('/products/{id}')` | `@router.get("/{product_id}")` |
| Controller 方法 | 普通函数 |
| `$request->query('q')` | 函数参数 `q: str | None = None` |
| 路由参数 `{id}` | `product_id: int` + `Path(ge=1)` |
| FormRequest + rules | Pydantic `BaseModel` |
| `$request->validate()` | 自动发生，失败 400/422 |
| API Resource | `response_model=ProductOut` |
| Middleware | `@app.middleware("http")` / `BaseHTTPMiddleware` |
| `Handler::render()` | `@app.exception_handler(...)` |
| Service Container | `Depends(...)` |
| `config('shop.x')` | pydantic-settings 的 `Settings` |
| `php artisan route:list` | `/docs`、`/openapi.json` |

## 2. 应用工厂与生命周期

```python
def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    database = Database(settings.db_url, echo=settings.db_echo)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # 启动：插入演示数据 / 预热连接
        yield
        # 关闭：释放连接池
        database.dispose()

    app = FastAPI(title="Shop API", lifespan=lifespan)
    app.state.settings = settings
    app.state.db = database
    ...
    return app

app = create_app()
```

要点：

- **工厂模式**：测试可以注入不同 `Settings` 和临时数据库。
- `app.state` 存放进程级对象（Engine、Settings）；不要用模块级全局变量。
- `lifespan` 替代旧的 `@app.on_event("startup")`，且能保证关闭逻辑执行。
- 模块级 `app = create_app()` 给 uvicorn 使用：`uvicorn shop.main:app`。

## 3. 路由与参数

```python
router = APIRouter(prefix="/api/products", tags=["products"])

@router.get("", response_model=list[ProductOut])
def list_products(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[ProductOut]:
    ...

@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    session: SessionDep,
    product_id: Annotated[int, Path(ge=1)],
) -> ProductOut:
    ...
```

| 参数来源 | 写法 | 校验 |
|---|---|---|
| 路径 | `product_id: int` / `Path(ge=1)` | 类型 + 约束 |
| 查询 | `q: str | None = None` / `Query(...)` | 类型 + 约束 |
| JSON Body | Pydantic 模型参数 | 模型字段 |
| 表单/文件 | `Form(...)` / `UploadFile` | 手动或模型 |
| Header | `Header(...)` | 类型 |
| Cookie | `Cookie(...)` | 类型 |

注意：

- 用 `Annotated[T, Query(...)]` 而不是 `q: str = Query(None)`（后者在类型检查与新版本中不推荐）。
- 路径参数声明为 `int` 后，`/abc` 自动 400，不进函数。
- 路由前缀 + 空路径 `""` 得到 `/api/products`；不要同时定义带尾斜杠的版本。

## 4. Pydantic：校验与序列化

```python
class ProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    price: Price
    stock: int = Field(ge=0)
```

`Price` 定义在 [shop/schemas.py](../code/shop-api/src/shop/schemas.py)：

```python
Price = Annotated[
    Decimal,
    Field(gt=0, max_digits=12, decimal_places=2),
    PlainSerializer(float, return_type=float, when_used="json"),
]
```

- 输入：接受 JSON 数字或字符串，按 Decimal 校验精度。
- 输出：为了与 Java 版 JSON 对齐，序列化成数字；生产 API 也可以改成字符串。
- `str_strip_whitespace` 避免 `" "` 通过 `min_length=1`。

### 请求/响应分离

| 类型 | 用途 | 不该包含 |
|---|---|---|
| `ProductCreate` | POST 输入 | id、version、created_at |
| `ProductUpdate` | PUT 输入 | sku（业务上不可改） |
| `ProductOut` | 响应 | 内部字段、ORM 对象 |
| ORM `Product` | 数据库 | 直接返回给客户端 |

直接返回 ORM 对象的风险：懒加载触发额外查询、循环引用、字段泄漏、API 与表结构耦合。FastAPI 可以 `from_attributes=True` 从 ORM 拷贝，但仍然先经过 Out 模型。

### camelCase 对齐

Java 版 JSON 用 `customerName`、`productId`。Python 内部用 snake_case，输出时用别名：

```python
class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
```

`populate_by_name=True` 让测试/内部代码也能用 snake_case 构造。

## 5. 依赖注入 ≈ 容器

```python
SessionDep = Annotated[Session, Depends(get_db)]

@router.get("", response_model=list[ProductOut])
def list_products(session: SessionDep) -> list[ProductOut]:
    ...
```

`get_db`：

```python
def get_db(request: Request) -> Iterator[Session]:
    database: Database = request.app.state.db
    yield from database.session()
```

FastAPI 的 `Depends` 能力：

| 能力 | 说明 |
|---|---|
| 嵌套依赖 | 依赖可以依赖其他依赖（`require_admin` 依赖 `current_user`） |
| `yield` 依赖 | 请求结束后执行清理（关闭 Session） |
| `use_cache=True`（默认） | 同一请求内同一依赖只执行一次 |
| 覆盖 | 测试里 `app.dependency_overrides[get_db] = fake` |
| 参数来源 | 依赖函数本身也能声明 Query/Header |

与 Laravel 容器对比：

| Laravel | FastAPI |
|---|---|
| 构造器注入 | 函数参数 `Depends` |
| 绑定接口到实现 | `Depends` + `Annotated` 别名 |
| 容器自动解析 | 显式声明，易追踪 |
| 单例/请求生命周期 | 由依赖实现与 `yield` 控制 |

本项目的 `SessionDep`、`SettingsDep`、`CurrentUser`、`AdminUser` 都是类型别名，读代码时一眼能看出依赖。

### 鉴权依赖链

```python
def current_user(credentials: ...) -> User: ...
def require_admin(user: Annotated[User, Depends(current_user)]) -> User: ...
AdminUser = Annotated[User, Depends(require_admin)]
```

路由签名写 `_user: CurrentUser` 或 `_admin: AdminUser`，权限规则就在签名上，不需要在每个函数里写 `if`。

## 6. 请求生命周期

```
TCP → uvicorn
  → ServerErrorMiddleware
  → CORSMiddleware（本项目可选）
  → request_context 中间件（request-id、计时）
  → Router 匹配
  → 依赖解析（Settings、Session、认证）
  → 端点函数（同步端点在线程池）
  → 序列化 response_model
  → 依赖清理（yield 的 finally：Session.close）
  → 中间件回写 X-Request-Id / X-Elapsed-Ms
  → 响应
```

异常时：

```
端点抛 AppError
  → 异常处理器 → problem+json
  → 中间件仍然回写 request-id / 耗时
```

未处理异常继续向上，最终 500；本项目的中间件会记录堆栈。

## 7. 中间件

```python
@app.middleware("http")
async def request_context(request, call_next):
    candidate = request.headers.get("X-Request-Id", "")
    request_id = candidate if _REQUEST_ID_PATTERN.fullmatch(candidate) else uuid4().hex
    request.state.request_id = request_id
    token = request_id_var.set(request_id)
    started = perf_counter()
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Elapsed-Ms"] = ...
    return response
```

为什么校验 request-id 格式：防止把任意超长/带换行的值回写进响应头（响应头注入）。

| Laravel | FastAPI |
|---|---|
| 全局 middleware | `app.middleware` / `add_middleware` |
| 路由中间件 | 依赖 + `Depends` |
| 终止中间件 | 响应后逻辑放在 `call_next` 之后 |
| 顺序 | 后添加的在外层（Starlette） |

同步中间件会阻塞事件循环；中间件里尽量只做轻量工作。

## 8. 异常 → RFC 9457 Problem Details

```python
class InsufficientStock(Conflict):
    title = "库存不足"

    def extra(self) -> dict[str, Any]:
        return {"sku": self.sku, "requested": self.requested, "available": self.available}
```

响应：

```json
{
  "type": "about:blank",
  "title": "库存不足",
  "status": 409,
  "detail": "库存不足 sku=SKU-003 需要=3 剩余=2",
  "sku": "SKU-003",
  "requested": 3,
  "available": 2
}
```

统一 handler：

| 异常 | HTTP | title |
|---|---|---|
| `NotFound` | 404 | 资源不存在 |
| `BadRequest` | 400 | 非法请求 |
| `Unauthorized` | 401 | 未认证 + `WWW-Authenticate` |
| `Forbidden` | 403 | 无权限 |
| `Conflict` | 409 | 业务冲突 |
| `InsufficientStock` | 409 | 库存不足 |
| `OptimisticLockConflict` | 409 | 并发冲突 |
| `RequestValidationError` | 400 | 参数错误 + `errors` |

错误格式统一后，前端、网关、监控可以按状态码与 `type` 分类，而不是解析自由文本。

## 9. 状态码、Location 与空响应

```python
@router.post("", response_model=ProductOut, status_code=201)
def create_product(payload, response: Response, ...):
    product = ...
    response.headers["Location"] = f"/api/products/{product.id}"
    return ProductOut.model_validate(product)

@router.delete("/{product_id}", status_code=204)
def delete_product(...) -> None:
    ...
```

- 201 + Location：创建成功。
- 204：删除成功，无响应体；不要返回 `{"ok": true}` 破坏语义。
- 409：业务状态冲突（库存、唯一键、乐观锁）。
- 422 是 FastAPI 默认的校验错误码；本项目改成 400 以对齐 Java 版。

## 10. OpenAPI 与调试

- `/docs`：Swagger UI。
- `/redoc`：ReDoc。
- `/openapi.json`：机器可读契约。

Pydantic 的 `Field(description=...)`、`examples`、路由 `summary/description` 都会进入文档。把 OpenAPI 当契约产物接入前端代码生成、契约测试和网关校验。

## 11. 同步还是异步端点

```python
def list_products(...):          # 同步，FastAPI 放线程池
async def stream(...):           # 异步，必须全链路非阻塞
```

本项目的 SQLAlchemy 是同步 Session，所以端点用 `def`。如果改成 `async def` + 同步 DB，就会阻塞事件循环，吞吐骤降。

迁移到异步 DB 的代价：

- 驱动换成 asyncpg / aiosqlite；
- SQLAlchemy 用 `AsyncSession`；
- 所有调用加 `await`；
- 事务/连接池语义要重新验证；
- 第三方库可能没有异步版本。

**不要为了“异步”而异步**。I/O 并发需求明确时再迁移。

## 12. 常见坑

| 坑 | 表现 | 解决 |
|---|---|---|
| 返回 ORM 对象 | 懒加载报错/泄漏 | `response_model` + Out 模型 |
| 同步阻塞写在 `async def` | 全进程卡住 | 改 `def` 或 `to_thread` |
| 依赖里开事务不关闭 | 连接泄漏 | `yield` + `finally` |
| 校验错误格式默认 422 | 与 Java/前端不一致 | 自定义 `RequestValidationError` handler |
| 认证与校验顺序不确定 | 无认证时返回 400 而非 401 | 认证放依赖；测试覆盖 |
| 直接信任 `X-Request-Id` | 响应头注入 | 正则白名单 |
| 生产开 `--reload` | 性能/稳定性问题 | 仅开发使用 |
| CORS 配 `*` + 凭证 | 浏览器拒绝 | 明确 origin |
| 大文件走 JSON | 内存爆炸 | 流式/分片上传 |

## 13. 本章验收

```bash
cd code/shop-api
uv run pytest tests/test_products_api.py tests/test_orders_api.py
uv run uvicorn shop.main:app --port 8000
```

另开终端：

```bash
curl -s localhost:8000/api/products
curl -i -X POST localhost:8000/api/products -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":1999.00,"stock":3}'
curl -i -u customer:customer123 -X POST localhost:8000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":1,"quantity":2}]}'
```

对照 [README](../README.md) 的走查表检查状态码、`Content-Type`、库存与 `version`。

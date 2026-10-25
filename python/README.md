# Python + FastAPI 速成：写给 10 年 PHP 架构师

> 目标读者：精通 PHP / Laravel（或 Symfony），做过架构设计，想在 **2～3 周** 内能读懂、评审、设计 Python Web 项目。
> 技术栈：**Python 3.14.7 + uv 0.12.18 + FastAPI 0.162 + Pydantic 2.14 + SQLAlchemy 2.1 + Alembic 1.20**；Django 对照：**Django 6.1 + DRF 3.18**。

这不是从 `Hello World` 讲起的教程。每一章都遵循：

```
PHP/Laravel 的写法  →  Python 的写法  →  关键差异与坑
```

你已经懂的（HTTP、REST、ORM、DI、事务、队列）只做映射；篇幅集中在 **PHP 直觉会失效的地方**：

- 缩进、动态强类型、`==` vs `is`、可变默认参数、引用语义；
- 常驻进程、GIL、asyncio、连接池；
- uv / venv / 包结构；
- Pydantic 边界校验与 mypy 静态类型；
- SQLAlchemy 的 Session / Unit of Work / 乐观锁 / N+1；
- FastAPI 的依赖注入与 Problem Details。

## 目录结构

```
python/
├── README.md                  # 本文件
├── .gitignore
├── docs/                      # 00～13 章 + 附录速查表
└── code/
    ├── lang-basics/           # 纯 Python：语言、异常、生成器、并发（每主题一个模块 + 测试）
    ├── shop-api/              # FastAPI 主线：商品 + 订单（Web/DI/SQLAlchemy/事务/乐观锁/测试/安全/生产化）
    └── django-shop/           # 精简 Django + DRF：Product CRUD + Admin，用来对照 Laravel
```

`shop-api` 的接口、账号与演示数据与 [`java/shop-api`](../java/code/shop-api) 对齐，方便两个教程互相对照。

## 环境准备

需要：

- **uv 0.12+**（安装：`curl -LsSf https://astral.sh/uv/install.sh | sh`）
- **Docker**（仅 PostgreSQL Testcontainers、镜像构建、compose 需要；SQLite 模式不需要）

uv 会自动安装 Python 3.14（各工程有 `.python-version`）：

```bash
uv --version
uv python install 3.14
```

详细工具链说明见 [00 环境与工具链](docs/00-环境与工具链.md)。

## 快速开始

### 1. lang-basics：语言与并发

```bash
cd code/lang-basics
uv sync
uv run pytest
uv run mypy src
uv run ruff check
uv run scripts/hello.py          # PEP 723 单文件脚本，自动装 rich
```

每个主题一个模块，测试就是“可执行笔记”：

| 主题 | 代码 |
|---|---|
| 真值 / `==` vs `is` / Decimal | [truthiness_and_equality.py](code/lang-basics/src/basics/truthiness_and_equality.py) |
| array_* ↔ 推导式 / Counter / defaultdict | [collections_vs_array.py](code/lang-basics/src/basics/collections_vs_array.py) |
| 可变默认参数 / 引用 / 拷贝 | [mutable_defaults.py](code/lang-basics/src/basics/mutable_defaults.py) |
| 金额值对象（frozen dataclass） | [money.py](code/lang-basics/src/basics/money.py) |
| Enum 状态机 + match | [order_status.py](code/lang-basics/src/basics/order_status.py) |
| Protocol + 结构化模式匹配 | [shapes.py](code/lang-basics/src/basics/shapes.py) |
| PEP 695 泛型 | [generics.py](code/lang-basics/src/basics/generics.py) |
| 装饰器（计时/重试/缓存） | [decorators.py](code/lang-basics/src/basics/decorators.py) |
| 生成器流水线 / 上下文管理器 | [generators.py](code/lang-basics/src/basics/generators.py) |
| 异常层级 / ExceptionGroup / raise from | [exceptions.py](code/lang-basics/src/basics/exceptions.py) |
| 线程 / 进程 / asyncio | [concurrency.py](code/lang-basics/src/basics/concurrency.py) |
| 单文件脚本（PEP 723） | [hello.py](code/lang-basics/scripts/hello.py) |

### 2. shop-api：FastAPI + SQLAlchemy（SQLite 零依赖）

```bash
cd code/shop-api
uv sync
uv run alembic upgrade head        # 建表（初始迁移）
uv run uvicorn shop.main:app --port 8000
```

自动插入 3 条演示商品。另开终端：

```bash
# 公开查询
curl -s localhost:8000/api/products

# 未认证写入 → 401 application/problem+json
curl -i -X POST localhost:8000/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":1999.00,"stock":3}'

# HTTP Basic 认证后下单 → 201
curl -i -u customer:customer123 -X POST localhost:8000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":1,"quantity":2}]}'

# 库存不足 → 409（SKU-003 只剩 2 件）
curl -i -u customer:customer123 -X POST localhost:8000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"ben","items":[{"productId":3,"quantity":3}]}'

# 角色：customer 删除 → 403；admin 删除 → 204
curl -i -u customer:customer123 -X DELETE localhost:8000/api/products/2
curl -i -u admin:admin123      -X DELETE localhost:8000/api/products/2

# 健康检查
curl -s localhost:8000/health
```

预期（fresh DB）：

| 请求 | 结果 |
|---|---|
| `GET /api/products` | `200`，3 个演示商品 |
| `POST /api/products`（无认证） | `401` + `WWW-Authenticate: Basic` + `application/problem+json` |
| `POST /api/orders`（库存充足） | `201`，库存 `20 → 18`，商品 `version 0 → 1` |
| `POST /api/orders`（库存不足） | `409`，含 `sku/requested/available` |
| `DELETE`（customer / admin） | `403` / `204` |
| `GET /health` | `200`，`{"status":"UP"}` |

响应头还包含 `X-Request-Id` 与 `X-Elapsed-Ms`（中间件）。

### 3. django-shop：Django + DRF 对照

```bash
cd code/django-shop
uv sync
uv run python manage.py migrate
uv run python manage.py seed_demo
uv run python manage.py runserver 8000
```

另开终端：

```bash
curl -s localhost:8000/api/products
curl -i -u admin:admin123 -X POST localhost:8000/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-100","name":"显示器","price":"1999.00","stock":3}'
```

Admin：<http://127.0.0.1:8000/admin/>，账号 `admin / admin123`。

与 FastAPI 版的**刻意差异**：

| 项 | shop-api | django-shop |
|---|---|---|
| JSON 字段 | camelCase | snake_case |
| 金额 | 数字 `599.0` | 字符串 `"599.00"` |
| 时间 | UTC（`Z`） | `Asia/Shanghai` 时区 |
| 认证 | 无状态 Basic + Argon2 | Django Auth（seed 用默认 PBKDF2） |
| Admin | 无（只有 OpenAPI） | Django Admin |

### 4. PostgreSQL（可选）

仅起数据库、应用跑在宿主机：

```bash
cd code/shop-api
docker compose up -d postgres
DB_URL='postgresql+psycopg://shop:shop@localhost:5432/shop' uv run alembic upgrade head
DB_URL='postgresql+psycopg://shop:shop@localhost:5432/shop' uv run uvicorn shop.main:app --port 8000
```

整栈（应用 + PostgreSQL，容器内自动迁移）：

```bash
docker compose up --build
```

停止并清理：

```bash
docker compose down -v
```

## 接口与演示账号

| 用户 | 密码 | 角色 | 权限 |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | 增删改查；`DELETE` 仅 ADMIN |
| `customer` | `customer123` | CUSTOMER | 下单、查询订单 |

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/products?q=键盘` | 否 | 商品列表/搜索 |
| GET | `/api/products/{id}` | 否 | 商品详情 |
| POST | `/api/products` | 是 | 创建商品（201 + Location） |
| PUT | `/api/products/{id}` | 是 | 修改商品 |
| DELETE | `/api/products/{id}` | ADMIN | 删除商品（204） |
| POST | `/api/orders` | 是 | 下单（扣库存、乐观锁） |
| GET | `/api/orders/{id}` | 是 | 订单详情 |
| GET | `/api/orders` | 是 | 订单列表 |
| GET | `/health` | 否 | 健康检查（含 DB 探测） |

> 演示账号只用于本地；生产认证见 [11 安全](docs/11-安全.md)。

## 测试

```bash
cd code/lang-basics  && uv run pytest && uv run mypy src && uv run ruff check
cd code/shop-api     && uv run pytest && uv run mypy src && uv run ruff check
cd code/django-shop  && uv run pytest && uv run ruff check && uv run python manage.py check
```

shop-api 测试覆盖：

| 类型 | 文件 |
|---|---|
| 接口 / 认证 / 校验 / Problem Details / 依赖覆盖 | [test_products_api.py](code/shop-api/tests/test_products_api.py)、[test_orders_api.py](code/shop-api/tests/test_orders_api.py) |
| 事务回滚 / 乐观锁 / 并发超卖 | [test_transactions.py](code/shop-api/tests/test_transactions.py) |
| N+1 / `selectinload` 查询计数 | [test_queries.py](code/shop-api/tests/test_queries.py) |
| 种子数据幂等 | [test_seed.py](code/shop-api/tests/test_seed.py) |
| PostgreSQL Testcontainers（无 Docker 自动 skip） | [test_postgres.py](code/shop-api/tests/test_postgres.py) |

Django 测试覆盖 DRF 权限/校验、Admin 访问、seed 命令幂等。

## 验证记录（2026-10-25）

实际执行过的命令与结果：

| 命令 | 结果 |
|---|---|
| `uv run pytest`（lang-basics） | **56 passed** |
| `uv run mypy src`（lang-basics） | Success，12 个源文件 |
| `uv run ruff check`（lang-basics） | All checks passed |
| `uv run scripts/hello.py` | Python 3.14.7；`Decimal("0.1")+Decimal("0.2") = 0.3`；GIL 启用 |
| `uv run pytest`（shop-api，Docker 可用） | **25 passed**（含 PostgreSQL Testcontainers；首次拉镜像约 26s） |
| `uv run mypy src` / `ruff check`（shop-api） | Success / All checks passed，19 个源文件 |
| `uv run alembic upgrade head` | 创建 `products/orders/order_items` + `alembic_version` |
| `uvicorn shop.main:app` + README curl 走查 | 200 列表；401 未认证；201 下单（库存 20→18，version 0→1）；409 库存不足（problem+json）；403/204 删除权限；health 200 |
| `docker build -t shop-api-python:dev .` | 成功（多阶段构建） |
| `docker run ... shop-api-python:dev` + `alembic upgrade head` | `/health` 200，商品列表返回演示数据 |
| `docker compose up -d --build`（应用 + PostgreSQL 17） | PostgreSQL healthy；api 启动后 `/health` 200；3 条商品；下单 201 |
| `uv run pytest`（django-shop） | **12 passed** |
| `uv run python manage.py check`（django-shop） | 0 issues |
| Django `runserver` + curl | 列表 200；未认证 POST 401；admin POST 201；health 200；Admin 登录页 200 |
| Markdown 相对链接检查（`python/**/*.md`） | 16 个文件、141 个链接，0 失效（脚本在 scratchpad，未提交） |

## 未验证项

- **free-threaded 3.14t**：未安装/测试；默认 3.14 构建 GIL 启用。
- **JWT / OAuth2**：文档给出设计与边界，未落地代码。
- **Celery / RQ / arq**：仅选型说明，未接入。
- **Django 的 PostgreSQL / gunicorn / 容器化**：Django 工程只在 SQLite + `runserver` 下验证。
- **gunicorn + uvicorn-worker 模式**：文档给出命令，但本仓库以 `uvicorn --workers` 与容器单进程验证，未安装 gunicorn 实测。
- **生产部署、压测、容量与故障演练**：未执行。
- **Windows**：未验证（本机 macOS arm64）。
- **`compose.yaml` 的持久化卷/生产参数**：仅验证了本地一次性启动；验证后已 `down -v` 清理。

## 学习路线

| 章节 | 内容 | 建议用时 | 重要度 |
|---|---|---|---|
| [00 环境与工具链](docs/00-环境与工具链.md) | uv、venv、pyproject、ruff/mypy、IDE、PEP 723 | 0.5 天 | ★★ |
| [01 Python 语言速通](docs/01-Python语言速通.md) | 缩进、真值、集合、切片、推导式、函数坑、引用、Decimal | 1.5 天 | ★★★★★ |
| [02 面向对象与数据建模](docs/02-面向对象与数据建模.md) | class/self、dunder、dataclass、Enum、Protocol/ABC、MRO | 1 天 | ★★★★ |
| [03 类型提示与静态检查](docs/03-类型提示与静态检查.md) | mypy strict、泛型、TypedDict、Literal、边界校验 | 1 天 | ★★★★★ |
| [04 异常、迭代器与上下文管理器](docs/04-异常-迭代器-上下文管理器.md) | 异常链、ExceptionGroup、生成器、with、itertools/functools | 1 天 | ★★★★ |
| [05 运行模型与并发](docs/05-运行模型与并发.md) | FPM vs 常驻进程、GIL、线程/进程/asyncio、ASGI、连接池 | 1.5 天 | ★★★★★ |
| [06 包、模块与项目结构](docs/06-包-模块-项目结构.md) | import、src 布局、uv lock、依赖冲突、打包 | 0.5 天 | ★★★ |
| [07 FastAPI Web 与 REST](docs/07-FastAPI-Web与REST.md) | 路由、Pydantic、Depends、中间件、Problem Details、OpenAPI | 1.5 天 | ★★★★★ |
| [08 数据访问与事务](docs/08-数据访问与事务.md) | SQLAlchemy、Session/UoW、Alembic、乐观锁、N+1 | 2 天 | ★★★★★ |
| [09 Django 对照](docs/09-Django对照.md) | Django/DRF/Admin/Auth、选型 | 1 天 | ★★★★ |
| [10 测试](docs/10-测试.md) | pytest、fixture、TestClient、Testcontainers、查询计数 | 1 天 | ★★★★ |
| [11 安全](docs/11-安全.md) | Basic/JWT、Argon2、授权、CORS、CSRF、越权 | 1 天 | ★★★★ |
| [12 生产化](docs/12-生产化.md) | 配置、日志、健康检查、Docker、worker、队列、可观测性 | 1 天 | ★★★★ |
| [13 架构师视角](docs/13-架构师视角.md) | 模块化单体、异步选型、迁移策略、团队落地 | 1 天 | ★★★★ |
| [附录 PHP → Python 速查表](docs/附录-PHP到Python速查表.md) | 语法/内置函数/生态/命令/坑 | 随时查 | ★★★★★ |

**最短路径**（只有 3 天）：01 → 02 → 05 → 07 → 08 → 附录。

## 学习建议

1. **边读边跑**。每个 `code/` 工程都能独立运行；把测试当可执行笔记，改一处断言看它为什么失败。
2. **用请求生命周期串知识**：uvicorn → middleware → 路由 → 依赖（Session/认证）→ Service（事务）→ SQLAlchemy → 序列化 → 响应。能讲清楚这条链，就掌握了 `shop-api`。
3. **不要逐行翻译 PHP**。先问“这里的类型边界/并发模型/事务边界是什么”，再写 Python。尤其是 Session、GIL、异步——照抄 PHP 习惯会出事。
4. **类型先于框架**。Pydantic 管边界，mypy 管内部；这比背 FastAPI 语法更有长期价值。
5. **读框架源码**：`Depends` 的解析、SQLAlchemy `Session.flush`、`selectinload` 的 SQL，比十篇博客有用。
6. **一个纵切面**：选一个业务用例（如下单），从路由、校验、事务、锁、测试、日志、Docker 全部打通，再扩展。

## 与 `java/` 的对照

| 维度 | `java/` | `python/` |
|---|---|---|
| 语言工程 | Maven + JUnit | uv + pytest |
| Web | Spring Boot 4 | FastAPI |
| DI | Spring 容器 | `Depends` |
| 校验 | Bean Validation | Pydantic |
| ORM | JPA + Hibernate | SQLAlchemy 2.1 |
| 迁移 | Flyway | Alembic |
| 事务 | `@Transactional` | `Session.commit/rollback` |
| 乐观锁 | `@Version` | `version_id_col` |
| 测试 | JUnit/Mockito/Testcontainers | pytest/TestClient/Testcontainers |
| 生产 | Actuator + fat jar | health + Docker |

两个 `shop-api` 的业务、接口路径、演示账号一致；可以并排阅读，观察同一个设计在两种运行时下的表达。

"""FastAPI 应用工厂：中间件、异常处理、路由与生命周期。

对照 Laravel：``bootstrap/app.php`` 注册中间件/异常处理，``routes/api.php`` 声明路由；
这里用 app 工厂完成同样的装配，并让测试可以注入独立配置与临时数据库。
"""

import logging
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from shop.config import Settings, configure_logging, get_settings
from shop.db import Database
from shop.errors import register_exception_handlers
from shop.order.router import router as order_router
from shop.product.router import router as product_router
from shop.seed import seed_demo_products

logger = logging.getLogger(__name__)

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class RequestIdLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def _install_log_filter() -> None:
    root = logging.getLogger()
    for handler in root.handlers:
        if not any(isinstance(item, RequestIdLogFilter) for item in handler.filters):
            handler.addFilter(RequestIdLogFilter())


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    _install_log_filter()
    database = Database(settings.db_url, echo=settings.db_echo)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        if settings.seed_demo_data:
            try:
                with database.session_factory() as session:
                    inserted = seed_demo_products(session)
                if inserted:
                    logger.info("已插入 %d 条演示商品", inserted)
            except OperationalError:
                logger.warning("数据库表不存在，请先运行 `uv run alembic upgrade head`")
        yield
        database.dispose()

    app = FastAPI(
        title="Shop API (FastAPI)",
        version=settings.version,
        description="Python 版商品/订单示例，接口与 java/shop-api 对齐",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.db = database

    @app.middleware("http")
    async def request_context(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """request-id + 耗时：等价于 Java 版的 Filter + HandlerInterceptor。"""
        candidate = request.headers.get("X-Request-Id", "")
        request_id = candidate if _REQUEST_ID_PATTERN.fullmatch(candidate) else uuid4().hex
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        started = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("未处理异常 %s %s", request.method, request.url.path)
            raise
        else:
            elapsed_ms = (perf_counter() - started) * 1000
            response.headers["X-Request-Id"] = request_id
            response.headers["X-Elapsed-Ms"] = f"{elapsed_ms:.0f}"
            logger.info(
                "%s %s -> %s (%.1fms)",
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
            )
            return response
        finally:
            request_id_var.reset(token)

    if settings.cors_origins:
        # 放在最外层：401/409 等错误响应也带 CORS 头
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-Id", "X-Elapsed-Ms"],
        )

    register_exception_handlers(app)
    app.include_router(product_router)
    app.include_router(order_router)

    @app.get("/health", tags=["ops"])
    def health(response: Response) -> dict[str, str]:
        """健康检查：真正探一次数据库，而不是只返回常量。"""
        try:
            with database.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            logger.exception("健康检查失败")
            response.status_code = 503
            return {"status": "DOWN"}
        return {"status": "UP"}

    return app


app = create_app()

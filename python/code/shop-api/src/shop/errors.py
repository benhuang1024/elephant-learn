"""业务异常与 RFC 9457 Problem Details 统一输出。

对照 Java 的 ``@RestControllerAdvice`` + ``ProblemDetail``：
业务代码只抛异常，Web 层负责映射成 HTTP 状态码与 ``application/problem+json``。
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 500
    title = "服务器错误"

    def __init__(self, detail: str, *, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.headers = headers

    def extra(self) -> dict[str, Any]:
        return {}


class BadRequest(AppError):
    status_code = 400
    title = "非法请求"


class Unauthorized(AppError):
    status_code = 401
    title = "未认证"

    def __init__(self, detail: str = "需要 HTTP Basic 认证") -> None:
        super().__init__(detail, headers={"WWW-Authenticate": 'Basic realm="shop-api"'})


class Forbidden(AppError):
    status_code = 403
    title = "无权限"


class NotFound(AppError):
    status_code = 404
    title = "资源不存在"

    def __init__(self, resource: str, identifier: object) -> None:
        super().__init__(f"{resource} 不存在: {identifier}")


class Conflict(AppError):
    status_code = 409
    title = "业务冲突"


class InsufficientStock(Conflict):
    title = "库存不足"

    def __init__(self, sku: str, requested: int, available: int) -> None:
        super().__init__(f"库存不足 sku={sku} 需要={requested} 剩余={available}")
        self.sku = sku
        self.requested = requested
        self.available = available

    def extra(self) -> dict[str, Any]:
        return {"sku": self.sku, "requested": self.requested, "available": self.available}


class OptimisticLockConflict(Conflict):
    title = "并发冲突"

    def __init__(self) -> None:
        super().__init__("数据已被其他请求修改，请重试")


def problem_response(
    status: int,
    title: str,
    detail: str,
    *,
    extra: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": title,
        "status": status,
        "detail": detail,
    }
    if extra:
        body.update(extra)
    return JSONResponse(
        body,
        status_code=status,
        media_type="application/problem+json",
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.info("业务异常 %s %s: %s", request.method, request.url.path, exc.detail)
        return problem_response(
            exc.status_code, exc.title, exc.detail, extra=exc.extra(), headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors: dict[str, str] = {}
        for error in exc.errors():
            location = ".".join(str(part) for part in error["loc"] if part != "body")
            errors.setdefault(location or "body", error["msg"])
        return problem_response(
            400,
            "参数错误",
            "请求参数校验失败",
            extra={"errors": errors},
        )

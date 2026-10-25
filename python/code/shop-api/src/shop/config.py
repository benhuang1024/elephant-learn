"""配置：环境变量 → 类型化 Settings（pydantic-settings ≈ Laravel 的 config/*.php）。

环境变量名不加前缀，和 java/shop-api 保持一致：``DB_URL``、``SEED_DEMO_DATA``……
"""

import logging
from functools import lru_cache
from typing import Literal

from fastapi import Request
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "shop-api"
    version: str = "1.0.0"
    environment: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    db_url: str = "sqlite+pysqlite:///./shop.sqlite3"
    db_echo: bool = False

    seed_demo_data: bool = True
    max_order_items: int = 20
    cors_origins: list[str] = []

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """允许 ``CORS_ORIGINS=http://a.com,http://b.com`` 这种逗号分隔写法。"""
        if isinstance(value, str) and not value.strip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """进程内缓存：环境变量在启动时读取一次，运行中变化需要重启。"""
    return Settings()


def get_app_settings(request: Request) -> Settings:
    """依赖注入版 Settings：读取 app.state，测试里可以塞不同配置。"""
    settings: Settings = request.app.state.settings
    return settings


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s",
        force=True,
    )

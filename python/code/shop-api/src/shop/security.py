"""认证与授权：HTTP Basic（演示）+ 角色校验。

生产环境把 ``HTTPBasic`` 换成 ``OAuth2PasswordBearer`` / JWT 即可，
``current_user`` 之后的授权逻辑不变。密码用 Argon2 哈希，绝不存明文。
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pwdlib import PasswordHash

from shop.errors import Forbidden, Unauthorized

_password_hash = PasswordHash.recommended()
_basic = HTTPBasic(auto_error=False)


@dataclass(frozen=True)
class User:
    username: str
    role: str

    def is_admin(self) -> bool:
        return self.role == "admin"


# 演示账号与 java/shop-api 完全一致；密码在这里哈希，进程内只保留哈希值。
_DEMO_USERS: dict[str, tuple[str, str]] = {
    "admin": (_password_hash.hash("admin123"), "admin"),
    "customer": (_password_hash.hash("customer123"), "customer"),
}


def authenticate(username: str, password: str) -> User | None:
    record = _DEMO_USERS.get(username)
    if record is None:
        # 用户不存在时也算一次哈希，避免通过响应时间枚举用户名
        _password_hash.verify(password, _DEMO_USERS["admin"][0])
        return None
    password_digest, role = record
    if not _password_hash.verify(password, password_digest):
        return None
    return User(username=username, role=role)


def current_user(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_basic)],
) -> User:
    if credentials is None:
        raise Unauthorized()
    user = authenticate(credentials.username, credentials.password)
    if user is None:
        raise Unauthorized("用户名或密码错误")
    return user


def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    if not user.is_admin():
        raise Forbidden("该操作需要 ADMIN 角色")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(require_admin)]

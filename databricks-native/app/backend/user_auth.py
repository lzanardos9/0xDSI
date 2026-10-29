"""
Per-request user authorization for SQL reads (on-behalf-of user).

Databricks Apps forward the signed-in user's short-lived token in
``x-forwarded-access-token``. In ``user`` mode every read runs on a connection
opened with that token, so Unity Catalog enforces the caller's own grants and
row/column filters. The token is held only for the lifetime of one request and
the connection is closed when the request ends; it is never cached across
requests. Writes stay on the app identity: they are already gated by role
checks and a fail-closed audit record keyed on the verified user.
"""

import os
import threading
from contextvars import ContextVar
from typing import Callable, Optional

from fastapi import HTTPException, Request

TOKEN_HEADER = "x-forwarded-access-token"
DATA_ACCESS_MODE = os.environ.get("SOC_DATA_ACCESS_MODE", "user").strip().lower()
if DATA_ACCESS_MODE not in ("user", "app"):
    raise RuntimeError(f"SOC_DATA_ACCESS_MODE must be 'user' or 'app', got {DATA_ACCESS_MODE!r}")


class _RequestScope:
    def __init__(self, token: str):
        self.token = token
        self.connection = None
        self.lock = threading.Lock()


_scope: ContextVar[Optional[_RequestScope]] = ContextVar("soc_request_scope", default=None)


def user_connection(connect: Callable[[str], object]):
    """Connection for the current request's user, or None outside a request or
    in app mode. Raises 401 in user mode when the platform sent no token."""
    scope = _scope.get()
    if scope is None or DATA_ACCESS_MODE != "user":
        return None
    if not scope.token:
        raise HTTPException(
            status_code=401,
            detail="User authorization is required. Ask an admin to enable the app's 'sql' user scope, then reload.",
        )
    with scope.lock:
        if scope.connection is None:
            scope.connection = connect(scope.token)
        return scope.connection


def install(app) -> None:
    @app.middleware("http")
    async def user_token_scope(request: Request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        scope = _RequestScope(request.headers.get(TOKEN_HEADER, "").strip())
        handle = _scope.set(scope)
        try:
            return await call_next(request)
        finally:
            _scope.reset(handle)
            if scope.connection is not None:
                try:
                    scope.connection.close()
                except Exception:
                    pass
            scope.token = ""

"""Server-side execution of outbound automation webhooks (n8n and similar).

The browser never sees webhook credentials: it asks the backend to run a
workflow, the backend checks the target against an operator allowlist, reads
the bearer token from a Databricks secret, and makes the call itself.
"""

import base64
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit

TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 64 * 1024

SETUP_MESSAGE = (
    "Workflow execution is not configured. Set WORKFLOW_ALLOWED_HOSTS to the "
    "comma-separated webhook hostnames this app may call."
)


class WorkflowRunError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def allowed_hosts() -> set:
    return {h.strip().lower() for h in os.environ.get("WORKFLOW_ALLOWED_HOSTS", "").split(",") if h.strip()}


def validate_target(url: str, hosts: set) -> str:
    if not hosts:
        raise WorkflowRunError(503, SETUP_MESSAGE)
    if not isinstance(url, str) or len(url) > 2048:
        raise WorkflowRunError(400, "A webhook URL is required")
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise WorkflowRunError(400, "Webhook URL must use https")
    if parts.username or parts.password:
        raise WorkflowRunError(400, "Webhook URL must not embed credentials")
    host = (parts.hostname or "").lower()
    if host not in hosts or (parts.port not in (None, 443)):
        raise WorkflowRunError(403, "Webhook host is not on the allowlist")
    return url


def _webhook_token():
    scope = os.environ.get("SOC_SECRET_SCOPE", "").strip()
    key = os.environ.get("WORKFLOW_WEBHOOK_SECRET_KEY", "").strip()
    if not scope or not key:
        return None
    from databricks.sdk import WorkspaceClient

    value = WorkspaceClient().secrets.get_secret(scope=scope, key=key).value or ""
    return base64.b64decode(value).decode("utf-8").strip() or None


def run_workflow(url: str, payload: dict, token_provider=_webhook_token, opener=None) -> dict:
    target = validate_target(url, allowed_hosts())
    headers = {"Content-Type": "application/json"}
    try:
        token = token_provider()
    except Exception as exc:  # noqa: BLE001
        raise WorkflowRunError(503, "Webhook credential could not be read") from exc
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(target, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    opener = opener or urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=TIMEOUT_SECONDS) as resp:
            status = resp.status
            body = resp.read(MAX_RESPONSE_BYTES)
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = exc.read(MAX_RESPONSE_BYTES) if exc.fp else b""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise WorkflowRunError(502, "Webhook could not be reached") from exc
    try:
        data = json.loads(body.decode("utf-8")) if body else None
    except (UnicodeDecodeError, ValueError):
        data = {"text": body.decode("utf-8", errors="replace")[:2000]}
    return {"ok": 200 <= status < 300, "status": status, "response": data}

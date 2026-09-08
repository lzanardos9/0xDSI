"""Path-based classification rules for the artifact inventory.

Kept separate from the generator so the rules can be unit-tested in isolation
and refined without touching the walk/hash logic.

Two axes are assigned:

* ``artifact_type`` / ``runtime`` — derived purely from location + extension +
  a cheap content sniff. These are structural facts, safe to automate.
* ``default_status`` — the *shipping* status. Structural artifacts (docs,
  assets, build config, tests, setup) get a definite status. Capability code
  (agents, detectors, correlation, ml, backend endpoints) defaults to
  ``unreviewed`` and must be promoted to ``production`` / ``experimental`` /
  ``simulated`` by an explicit curated override, so the manifest never *claims*
  a component is shipped just because a file with the right name exists.
"""

from __future__ import annotations

import posixpath

# Directories and files never inventoried (caches, vendored deps, build output).
EXCLUDE_DIR_NAMES = {
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    ".git",
    ".vite",
    ".turbo",
}
EXCLUDE_EXTS = {".pyc", ".pyo", ".map"}

# Generated outputs must not inventory themselves (self-referential hashes would
# make the manifest permanently "stale"). Paths are relative to the root.
EXCLUDE_RELPATHS = {
    "docs/engineering/artifact-manifest.json",
    "docs/engineering/baseline-results.json",
}

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"}
_BUILD_CONFIG_NAMES = {
    "package.json",
    "package-lock.json",
    "requirements.txt",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
    "app.yaml",
    "Makefile",
    ".env.production",
}
_DEPLOY_NAMES = {"deploy.sh", "databricks.yml"}

# Statuses that are structural facts, not capability claims.
STATUS_DOC = "documentation"
STATUS_ASSET = "asset"
STATUS_BUILD = "build_config"
STATUS_DEPLOY = "deployment"
STATUS_TEST = "test"
STATUS_SETUP = "setup"
STATUS_SHARED = "shared_library"
STATUS_UNREVIEWED = "unreviewed"


def should_exclude(rel_parts: tuple[str, ...], ext: str) -> bool:
    if any(part in EXCLUDE_DIR_NAMES for part in rel_parts):
        return True
    if ext.lower() in EXCLUDE_EXTS:
        return True
    if "/".join(rel_parts) in EXCLUDE_RELPATHS:
        return True
    return False


def _is_notebook(rel_path: str, head: str) -> bool:
    if not rel_path.startswith("notebooks/"):
        return False
    return head.startswith("# Databricks notebook source")


def classify(rel_path: str, head: str) -> tuple[str, str, str]:
    """Return ``(artifact_type, runtime, default_status)`` for one file.

    ``head`` is the first ~200 bytes of the file (empty for binary), used only
    to confirm the Databricks-notebook marker.
    """
    name = posixpath.basename(rel_path)
    ext = posixpath.splitext(name)[1].lower()
    top = rel_path.split("/", 1)[0]

    # --- inventory tooling and tests: location wins over extension -----------
    if top == "tools":
        return "tooling", "build-tooling", STATUS_BUILD
    if top == "tests":
        if ext == ".sh":
            return "test_script", "shell", STATUS_TEST
        if ext == ".sql":
            return "test_fixture", "databricks-sql", STATUS_TEST
        return "test", "python", STATUS_TEST

    # --- structural artifacts: definite status, no capability claim ----------
    if ext in _IMAGE_EXTS:
        return "asset", "n/a", STATUS_ASSET
    if ext == ".md":
        return "documentation", "n/a", STATUS_DOC
    if name in _BUILD_CONFIG_NAMES or ext in {".lock"}:
        return "build_config", "build-tooling", STATUS_BUILD
    if name in _DEPLOY_NAMES or (top == "resources" and ext in {".yml", ".yaml"}):
        return "deployment_config", "databricks-bundle", STATUS_DEPLOY
    if ext == ".sh":
        return "deployment_script", "shell", STATUS_DEPLOY
    if ext == ".sql":
        return "sql", "databricks-sql", STATUS_UNREVIEWED

    # --- setup ---------------------------------------------------------------
    if rel_path.startswith("notebooks/setup/"):
        return "databricks_notebook", "databricks-spark", STATUS_SETUP

    # --- shared importable library (thin, mostly pure) -----------------------
    if rel_path.startswith("notebooks/_shared/") and ext == ".py":
        return "shared_library", "python (databricks runtime)", STATUS_SHARED

    # --- capability code: default UNREVIEWED until a human promotes it --------
    if _is_notebook(rel_path, head):
        return "databricks_notebook", "databricks-spark", STATUS_UNREVIEWED
    if rel_path.startswith("app/backend/") and ext == ".py":
        return "backend_service", "python-fastapi", STATUS_UNREVIEWED
    if rel_path.startswith("app/frontend/") and ext in {".tsx", ".ts"}:
        return "frontend_module", "browser", STATUS_UNREVIEWED
    if ext in {".tsx", ".ts", ".jsx", ".js"}:
        return "frontend_module", "browser", STATUS_UNREVIEWED
    if ext == ".html":
        return "frontend_entry", "browser", STATUS_BUILD
    if ext == ".css":
        return "stylesheet", "browser", STATUS_BUILD
    if ext == ".py":
        return "python_module", "python", STATUS_UNREVIEWED

    return "other", "n/a", STATUS_UNREVIEWED

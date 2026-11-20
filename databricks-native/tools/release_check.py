#!/usr/bin/env python3
"""Pre-deploy release checks: the frontend bundle exists, is fresh, and holds no secrets.

Usage: python3 tools/release_check.py            (dist + secret scan)
       python3 tools/release_check.py --scan-only
Exit code 0 means safe to deploy; anything else blocks the deploy.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
DIST = APP / "dist"
FRONTEND = APP / "frontend"

SECRET_PATTERNS = {
    "Databricks personal access token": re.compile(r"\bdapi[0-9a-f]{32}(-\d)?\b"),
    "Databricks OAuth secret": re.compile(r"\bdose[0-9a-f]{32}\b"),
    "Browser-exposed Databricks token variable": re.compile(r"VITE_DATABRICKS_(TOKEN|PAT|CLIENT_SECRET)"),
    "Private key block": re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Hard-coded bearer token": re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]{40,}"),
}
SCAN_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".json", ".yml", ".yaml", ".sh", ".toml", ".html", ".md", ".cfg", ".ini"}
SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".databricks", ".venv"}
SELF = Path(__file__).resolve()


def iter_files(base: Path):
    for path in base.rglob("*"):
        if path.is_file() and not (set(path.relative_to(base).parts) & SKIP_DIRS):
            if path.suffix in SCAN_SUFFIXES or path.name.startswith(".env"):
                yield path


def scan(paths) -> list:
    findings = []
    for path in paths:
        if path.resolve() == SELF or path.name == ".env.example":
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for label, pattern in SECRET_PATTERNS.items():
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append(f"{path.relative_to(ROOT)}:{line}: {label}")
    return findings


def check_dist() -> list:
    index = DIST / "index.html"
    if not index.is_file():
        return ["app/dist/index.html is missing - run `make build` first"]
    built_at = index.stat().st_mtime
    sources = [p for p in (FRONTEND / "src").rglob("*") if p.is_file()] + [FRONTEND / "index.html"] + [APP / "vite.config.ts", APP / "package.json"]
    stale = [p for p in sources if p.exists() and p.stat().st_mtime > built_at]
    if stale:
        return [f"app/dist is older than {len(stale)} frontend source file(s), e.g. "
                f"{stale[0].relative_to(ROOT)} - rebuild with `make build`"]
    return []


def main() -> int:
    problems = [] if "--scan-only" in sys.argv else check_dist()
    problems += scan(iter_files(ROOT))
    if problems:
        print("Release check FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("Secret scan passed." if "--scan-only" in sys.argv else "Release check passed: bundle present and fresh, no secrets found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

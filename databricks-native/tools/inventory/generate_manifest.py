#!/usr/bin/env python3
"""Generate ``docs/engineering/artifact-manifest.json`` for databricks-native.

Deterministic and reproducible: given the same working tree and the same
``overrides.json`` it always emits byte-identical JSON (files are sorted, no
timestamps are embedded). That is what lets the contract test detect drift.

Usage:
    python tools/inventory/generate_manifest.py            # write the manifest
    python tools/inventory/generate_manifest.py --check    # exit 1 if stale

The manifest root is the ``databricks-native`` directory (two levels up from
this file). Only that subtree is inventoried.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classify  # noqa: E402

GENERATOR_VERSION = "1.0.0"
MANIFEST_SCHEMA_VERSION = "1.0.0"

ROOT = Path(__file__).resolve().parents[2]  # -> databricks-native/
MANIFEST_PATH = ROOT / "docs" / "engineering" / "artifact-manifest.json"
OVERRIDES_PATH = Path(__file__).resolve().parent / "overrides.json"

VALID_STATUSES = {
    classify.STATUS_DOC,
    classify.STATUS_ASSET,
    classify.STATUS_BUILD,
    classify.STATUS_DEPLOY,
    classify.STATUS_TEST,
    classify.STATUS_SETUP,
    classify.STATUS_SHARED,
    classify.STATUS_UNREVIEWED,
    "production",
    "experimental",
    "simulated",
    "unavailable",
    "demo",
}


def _sha256_and_head(path: Path) -> tuple[str, int, str]:
    h = hashlib.sha256()
    size = 0
    head = b""
    with path.open("rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            if not head:
                head = chunk[:200]
            size += len(chunk)
            h.update(chunk)
    try:
        head_txt = head.decode("utf-8")
    except UnicodeDecodeError:
        head_txt = ""
    return h.hexdigest(), size, head_txt


def _load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    with OVERRIDES_PATH.open() as f:
        raw = json.load(f)
    return raw.get("artifacts", {})


def _walk_files() -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT)
        rel_parts = tuple(p for p in rel_dir.parts if p != ".")
        # prune excluded directories in-place so os.walk skips them
        dirnames[:] = [d for d in dirnames if d not in classify.EXCLUDE_DIR_NAMES]
        if any(part in classify.EXCLUDE_DIR_NAMES for part in rel_parts):
            continue
        for fn in filenames:
            ext = os.path.splitext(fn)[1]
            if classify.should_exclude(rel_parts + (fn,), ext):
                continue
            out.append(Path(dirpath) / fn)
    return out


def build_manifest() -> dict:
    overrides = _load_overrides()
    artifacts = []
    seen_overrides = set()

    for path in _walk_files():
        rel = path.relative_to(ROOT).as_posix()
        digest, size, head = _sha256_and_head(path)
        artifact_type, runtime, default_status = classify.classify(rel, head)

        record = {
            "path": rel,
            "artifact_type": artifact_type,
            "runtime": runtime,
            "shipping_status": default_status,
            "review": "auto",
            "sha256": digest,
            "bytes": size,
        }

        ov = overrides.get(rel)
        if ov:
            seen_overrides.add(rel)
            status = ov.get("shipping_status")
            if status is not None:
                if status not in VALID_STATUSES:
                    raise ValueError(f"override for {rel} has invalid status {status!r}")
                record["shipping_status"] = status
            record["review"] = "curated"
            if "capability" in ov:
                record["capability"] = ov["capability"]
            if "notes" in ov:
                record["notes"] = ov["notes"]

        artifacts.append(record)

    artifacts.sort(key=lambda r: r["path"])

    stale = sorted(set(overrides) - seen_overrides)
    if stale:
        raise ValueError(f"overrides.json references missing files: {stale}")

    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_runtime: dict[str, int] = {}
    total_bytes = 0
    for r in artifacts:
        by_type[r["artifact_type"]] = by_type.get(r["artifact_type"], 0) + 1
        by_status[r["shipping_status"]] = by_status.get(r["shipping_status"], 0) + 1
        by_runtime[r["runtime"]] = by_runtime.get(r["runtime"], 0) + 1
        total_bytes += r["bytes"]

    return {
        "manifest_schema_version": MANIFEST_SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "root": "databricks-native",
        "total_files": len(artifacts),
        "total_bytes": total_bytes,
        "summary": {
            "by_artifact_type": dict(sorted(by_type.items())),
            "by_shipping_status": dict(sorted(by_status.items())),
            "by_runtime": dict(sorted(by_runtime.items())),
            "reviewed": sum(1 for r in artifacts if r["review"] == "curated"),
            "unreviewed": sum(1 for r in artifacts if r["shipping_status"] == "unreviewed"),
        },
        "artifacts": artifacts,
    }


def _serialize(manifest: dict) -> str:
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if manifest is stale")
    args = parser.parse_args()

    manifest = build_manifest()
    rendered = _serialize(manifest)

    if args.check:
        if not MANIFEST_PATH.exists():
            print("artifact-manifest.json missing; run without --check", file=sys.stderr)
            return 1
        current = MANIFEST_PATH.read_text(encoding="utf-8")
        if current != rendered:
            print("artifact-manifest.json is STALE. Regenerate it.", file=sys.stderr)
            return 1
        print(f"artifact-manifest.json up to date ({manifest['total_files']} files).")
        return 0

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(rendered, encoding="utf-8")
    print(
        f"Wrote {MANIFEST_PATH.relative_to(ROOT)} "
        f"({manifest['total_files']} files, {manifest['summary']['unreviewed']} unreviewed)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

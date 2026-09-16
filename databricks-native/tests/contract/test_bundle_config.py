"""
Regression + contract test for the Databricks Asset Bundle configuration.

Reproduces the Phase 0 finding H-001: `resources/jobs.yml` contained a malformed
job entry where a `schedule:` key was collapsed onto the same line as the job's
`name:` value, so the whole bundle failed to parse and could not be deployed or
validated. This test guards the real deployed files (not a copy):

  1. every bundle YAML parses;
  2. no mapping has a duplicate key (a duplicate job key silently overrides a
     real job under a plain safe_load, so we reject it explicitly);
  3. every notebook_path referenced by a job/pipeline resolves to a file.

PyYAML is not part of the stdlib. When it is present (CI, dev with deps) the
full parse-level checks run; when it is absent this test reports BLOCKED for the
parse-dependent checks and still runs the stdlib-only guard against the exact
H-001 shape, so it is never silently skipped.

Run:  python3 databricks-native/tests/contract/test_bundle_config.py
"""

import glob
import os
import re

# databricks-native/ root, two levels up from tests/contract/.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUNDLE_FILES = [os.path.join(ROOT, "databricks.yml")] + sorted(
    glob.glob(os.path.join(ROOT, "resources", "*.yml"))
)

try:
    import yaml
    HAVE_YAML = True
except ImportError:
    HAVE_YAML = False


class _DupKeyLoader(getattr(__import__("yaml"), "SafeLoader") if HAVE_YAML else object):
    """SafeLoader that rejects duplicate mapping keys instead of overriding."""


if HAVE_YAML:
    def _no_duplicates(loader, node, deep=False):
        seen = {}
        for key_node, _ in node.value:
            key = loader.construct_object(key_node, deep=deep)
            if key in seen:
                raise yaml.YAMLError(
                    f"duplicate key '{key}' at line {key_node.start_mark.line + 1}"
                )
            seen[key] = True
        return {k: True for k in seen}

    _DupKeyLoader.add_constructor(
        yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _no_duplicates
    )


def test_h001_no_value_then_key_on_same_line():
    """Stdlib-only guard for the exact H-001 shape: a quoted scalar value with
    another `key:` appended after it on the same physical line."""
    offenders = []
    pattern = re.compile(r':\s*"[^"]*"\s+\S+:\s*$')
    for path in BUNDLE_FILES:
        with open(path, encoding="utf-8") as fh:
            for i, line in enumerate(fh, 1):
                if pattern.search(line.rstrip("\n")):
                    offenders.append(f"{os.path.relpath(path, ROOT)}:{i}")
    assert not offenders, (
        "H-001 regression: a mapping value has another key on the same line at "
        + ", ".join(offenders)
    )


def test_all_bundle_yaml_parses():
    if not HAVE_YAML:
        print("BLOCKED test_all_bundle_yaml_parses: PyYAML not installed")
        return
    failures = []
    for path in BUNDLE_FILES:
        try:
            with open(path, encoding="utf-8") as fh:
                list(yaml.load_all(fh, Loader=_DupKeyLoader))
        except yaml.YAMLError as e:
            mark = getattr(e, "problem_mark", None)
            ln = (mark.line + 1) if mark else "?"
            failures.append(f"{os.path.relpath(path, ROOT)} (line {ln}): "
                            f"{getattr(e, 'problem', str(e))}")
    assert not failures, "bundle YAML did not parse cleanly:\n  - " + \
        "\n  - ".join(failures)


def test_no_duplicate_job_or_pipeline_keys():
    # Covered by _DupKeyLoader in the parse test; kept explicit so a regression
    # in the loader configuration is visible as its own failing case.
    if not HAVE_YAML:
        print("BLOCKED test_no_duplicate_job_or_pipeline_keys: PyYAML not installed")
        return
    for path in BUNDLE_FILES:
        with open(path, encoding="utf-8") as fh:
            list(yaml.load_all(fh, Loader=_DupKeyLoader))  # raises on duplicate


def test_referenced_notebook_paths_exist():
    if not HAVE_YAML:
        print("BLOCKED test_referenced_notebook_paths_exist: PyYAML not installed")
        return
    missing = []
    checked = 0
    resources_dir = os.path.join(ROOT, "resources")

    def walk(node):
        nonlocal checked
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "notebook_path" and isinstance(v, str):
                    checked += 1
                    resolved = os.path.normpath(os.path.join(resources_dir, v))
                    if not os.path.exists(resolved):
                        missing.append(v)
                else:
                    walk(v)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for path in sorted(glob.glob(os.path.join(resources_dir, "*.yml"))):
        with open(path, encoding="utf-8") as fh:
            walk(yaml.safe_load(fh))

    assert checked > 0, "no notebook_path references found; test wiring is wrong"
    assert not missing, "referenced notebooks do not exist:\n  - " + \
        "\n  - ".join(sorted(set(missing)))


if __name__ == "__main__":
    passed = 0
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"PASS {name}")
            except AssertionError as e:
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{passed} passed, {failed} failed"
          + ("" if HAVE_YAML else "  (PyYAML absent: parse checks BLOCKED)"))
    raise SystemExit(1 if failed else 0)

"""
Security regression for LLM-supplied tool-argument validation (H-070).

Reproduces the Phase 7 finding: agent tool calls were built by joining argument
values in dict-insertion order, with no schema validation, before being spliced
into `spark.sql(...)`. Because tool arguments originate from an LLM that can be
steered by attacker-controlled alert text, that allowed positional mismatch and
unchecked values to reach the SQL engine.

This imports the real production validator from
`notebooks/_shared/agent_framework.py` (no Spark session required — the
validators are pure static methods) and pins the contract:

  * arguments are emitted in the tool's declared `properties` order, not the
    order the model happened to produce;
  * unknown keys, missing required keys, wrong types and out-of-enum values are
    rejected before any SQL is built;
  * omitted optional parameters become NULL to keep positions aligned;
  * string values are escaped (single quotes doubled, NUL stripped) so a crafted
    argument cannot break out of the SQL literal.

Run:  python3 databricks-native/tests/security/test_tool_arg_validation.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import agent_framework as A  # noqa: E402

BaseAgent = A.BaseAgent
UCTool = A.UCTool


def _tool():
    return UCTool(
        name="lookup_ioc",
        description="Look up an indicator of compromise.",
        catalog="soc",
        schema="agentic_soc",
        function_name="lookup_ioc",
        parameters={
            "type": "object",
            "properties": {
                "indicator": {"type": "string"},
                "kind": {"type": "string", "enum": ["ip", "domain", "hash"]},
                "limit": {"type": "integer"},
            },
            "required": ["indicator"],
        },
    )


def _order(args):
    return BaseAgent._validate_and_order_args(_tool(), args)


def test_arguments_emitted_in_schema_order_not_model_order():
    # Model emits keys out of declared order; literals must follow properties.
    out = _order({"limit": 10, "kind": "ip", "indicator": "1.2.3.4"})
    assert out == ["'1.2.3.4'", "'ip'", "10"], out


def test_unknown_argument_rejected():
    try:
        _order({"indicator": "1.2.3.4", "evil": "x"})
    except ValueError as e:
        assert "unknown argument" in str(e)
        return
    raise AssertionError("unknown argument must be rejected")


def test_missing_required_rejected():
    try:
        _order({"kind": "ip"})
    except ValueError as e:
        assert "missing required" in str(e)
        return
    raise AssertionError("missing required argument must be rejected")


def test_wrong_type_rejected():
    try:
        _order({"indicator": "1.2.3.4", "limit": "not-an-int"})
    except ValueError as e:
        assert "type" in str(e)
        return
    raise AssertionError("wrong-typed argument must be rejected")


def test_out_of_enum_rejected():
    try:
        _order({"indicator": "1.2.3.4", "kind": "carrier-pigeon"})
    except ValueError as e:
        assert "one of" in str(e)
        return
    raise AssertionError("out-of-enum argument must be rejected")


def test_omitted_optional_becomes_null_placeholder():
    out = _order({"indicator": "1.2.3.4"})
    assert out == ["'1.2.3.4'", "NULL", "NULL"], out


def test_string_argument_is_escaped_against_sql_injection():
    # A crafted value must be neutralised, not splice into the SQL.
    out = _order({"indicator": "x'); DROP TABLE alerts; --"})
    assert out[0] == "'x''); DROP TABLE alerts; --'", out
    assert "\x00" not in out[0]


def test_nul_byte_is_stripped():
    out = _order({"indicator": "a\x00b"})
    assert out[0] == "'ab'", out


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
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)

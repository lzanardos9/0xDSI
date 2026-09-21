"""
Property tests for the deterministic authority kernel (Phase 1).

authority_kernel.py is pure stdlib in notebooks/_shared, so putting that dir on
sys.path makes it importable with no Spark, database or live target. These tests
pin the guarantees the kernel exists to provide: an out-of-scope target is
denied even when the request claims authorization, a high confidence score never
upgrades a decision, protected prohibitions cannot be permitted, self-approval
is refused, high-impact effects require a bound approval, code execution is
sandboxed or denied, delegation cannot amplify scope, and an unmatched request
falls to a safe default deny.

Run:  python3 databricks-native/tests/property/test_authority_kernel.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402


def _ctx(**over):
    ctx = {
        "agent": {"autonomy": K.A2, "lifecycle": "active"},
        "target_in_scope": True,
        "is_sandbox_target": False,
        "audience_allowlisted": False,
        "approver": None,
    }
    ctx.update(over)
    return ctx


def _req(**over):
    req = {"tool": "t@1", "target": "asset:1", "effects": ["observe"],
           "proposed_by": "alice", "confidence": 0.5}
    req.update(over)
    return req


def test_decisions_and_catalog_consistent():
    # Every catalog reason code maps to a valid decision, and codes are unique.
    codes = [row["reason_code"] for row in K.REASON_CATALOG]
    assert len(codes) == len(set(codes)), "duplicate reason codes"
    for row in K.REASON_CATALOG:
        assert row["decision"] in K.DECISIONS


def test_paused_agent_denied():
    d = K.decide(_req(), _ctx(agent={"autonomy": K.A3, "lifecycle": "paused"}))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_AGENT_NOT_ACTIVE


def test_out_of_scope_denied():
    d = K.decide(_req(effects=["observe"]), _ctx(target_in_scope=False))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_UNAUTHORIZED_TARGET


def test_claimed_authorization_is_not_a_grant():
    # Discovery does not expand scope; retrieved "authorized" text is content.
    d = K.decide(_req(effects=["external_comm"], claims_authorized=True),
                 _ctx(target_in_scope=False))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_CONTENT_NOT_GRANT


def test_confidence_never_upgrades_decision():
    low = K.decide(_req(effects=["access_restriction"], confidence=0.01),
                   _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}))
    high = K.decide(_req(effects=["access_restriction"], confidence=0.999),
                    _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}))
    assert low["decision"] == high["decision"] == K.REQUIRE_APPROVAL
    assert low["reason_code"] == high["reason_code"] == K.R_DUAL_APPROVAL


def test_self_authorization_denied():
    d = K.decide(_req(proposed_by="alice"), _ctx(approver="alice"))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_SELF_AUTHORIZE


def test_protected_prohibition_denied_even_for_a4():
    d = K.decide(_req(effects=["policy_modification"]),
                 _ctx(agent={"autonomy": K.A4, "lifecycle": "active"}))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_PROTECTED


def test_autonomy_floor_enforced():
    # A1 agent may not request a containment (access_restriction) effect.
    d = K.decide(_req(effects=["access_restriction"]),
                 _ctx(agent={"autonomy": K.A1, "lifecycle": "active"}))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_AUTONOMY_INSUFFICIENT


def test_high_impact_requires_approval():
    d = K.decide(_req(effects=["irreversible", "access_restriction"]),
                 _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}))
    assert d["decision"] == K.REQUIRE_APPROVAL
    assert d["reason_code"] == K.R_DUAL_APPROVAL
    assert "bind_to_plan_digest" in d["constraints"]


def test_code_execution_sandboxed_when_target_is_sandbox():
    d = K.decide(_req(effects=["code_execution"]),
                 _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}, is_sandbox_target=True))
    assert d["decision"] == K.SANDBOX_ONLY
    assert d["reason_code"] == K.R_SANDBOX


def test_code_execution_denied_off_sandbox():
    d = K.decide(_req(effects=["code_execution"]),
                 _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}, is_sandbox_target=False))
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_SANDBOX_ESCAPE


def test_delegation_cannot_amplify():
    d = K.decide(_req(effects=["delegation"], child_scope_exceeds_parent=True), _ctx())
    assert d["decision"] == K.DENY
    assert d["reason_code"] == K.R_DELEGATION_INTERSECTION


def test_in_scope_delegation_needs_review():
    d = K.decide(_req(effects=["delegation"]), _ctx())
    assert d["decision"] == K.REQUIRE_REVIEW
    assert d["reason_code"] == K.R_DELEGATION_REVIEW


def test_allowlisted_disclosure_permitted_with_redaction():
    d = K.decide(_req(effects=["disclosure"]), _ctx(audience_allowlisted=True))
    assert d["decision"] == K.PERMIT_WITH_CONSTRAINTS
    assert d["reason_code"] == K.R_DISCLOSURE_CONSTRAINED
    assert "redact_internal_indicators" in d["constraints"]


def test_scoped_read_permitted():
    d = K.decide(_req(effects=["observe"]), _ctx())
    assert d["decision"] == K.PERMIT_WITH_CONSTRAINTS
    assert d["reason_code"] == K.R_READ_SCOPED


def test_most_restrictive_effect_wins():
    # A benign read bundled with a containment resolves to the approval gate.
    d = K.decide(_req(effects=["observe", "access_restriction"]),
                 _ctx(agent={"autonomy": K.A3, "lifecycle": "active"}))
    assert d["decision"] == K.REQUIRE_APPROVAL


def test_decision_is_deterministic():
    req = _req(effects=["access_restriction"])
    ctx = _ctx(agent={"autonomy": K.A3, "lifecycle": "active"})
    first = K.decide(req, ctx)
    for _ in range(50):
        assert K.decide(req, ctx) == first


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)

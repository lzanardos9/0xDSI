"""
Omnigent Policy Enforcement Point resolver (Phase 9).

Phases 5-8 built the decision, the chokepoint and the argument-bound capability
lease. This module is the runner-level overlay: it binds the 0xDSI decision to an
operator-authored Omnigent policy so a human can constrain an agent's action
paths *outside* the agent's own code. An action path resolves to exactly one of
three runner verdicts:

    ALLOW  -- the runner may proceed to the chokepoint (which still enforces the
              kernel, the revision-bound approval and the capability lease).
    DENY   -- the runner refuses; the action never reaches the chokepoint.
    ASK    -- the runner must obtain a human decision before proceeding.

The bindings are rows the operator manages (in the console, persisted to
`ecp_omnigent_policies`). This module takes those rows as *data* -- it never
reaches out to a database or a network, so the resolution logic is pure stdlib
and offline-testable, and the same function runs in a notebook, in the app
backend and in the test harness.

Resolution is deny-by-default and total:
  * only enabled rules participate;
  * a rule matches when its agent_key, action_type and target_glob all match the
    action (case-folded for the identity-like fields, glob for the target);
  * of the matching rules, the highest `priority` wins; ties break to the most
    restrictive verdict (DENY > ASK > ALLOW) so a tie can never *widen* authority;
  * if nothing matches, the verdict is DENY with reason NO_MATCHING_POLICY.

`overlay_reason(pep, kernel_permit)` composes the PEP verdict with a kernel
decision the same way the runner must: the overlay can only *narrow* authority --
a PEP ALLOW never overrides a kernel DENY.
"""

import fnmatch

ALLOW = "ALLOW"
DENY = "DENY"
ASK = "ASK"
VERDICTS = (ALLOW, DENY, ASK)

# Reason codes, greppable and separate from kernel / capability codes.
R_MATCHED = "OMNIGENT.MATCHED"
R_NO_MATCH = "OMNIGENT.NO_MATCHING_POLICY"
R_KERNEL_DENY = "OMNIGENT.KERNEL_DENY"

# Restrictiveness ordering: a higher rank is more restrictive and wins ties, so
# no tie between two equal-priority rules can ever grant more authority.
_RESTRICTIVENESS = {ALLOW: 0, ASK: 1, DENY: 2}

_MATCH_FIELDS = ("agent_key", "action_type")


def _norm(value) -> str:
    return "" if value is None else str(value).strip()


def _fold(value) -> str:
    return _norm(value).lower()


def _rule_matches(rule, action) -> bool:
    """True when an enabled rule applies to this action.

    A '*' in agent_key / action_type is a wildcard. The target is matched as a
    glob (fnmatch), so '10.*' matches '10.0.0.5' and '*' matches anything.
    """
    for field in _MATCH_FIELDS:
        rule_val = _fold(rule.get(field))
        if rule_val == "*":
            continue
        if rule_val != _fold(action.get(field)):
            return False
    glob = _norm(rule.get("target_glob")) or "*"
    target = _norm(action.get("target"))
    return fnmatch.fnmatch(target, glob)


def resolve(policies, action):
    """Resolve the effective Omnigent verdict for one action.

    policies: iterable of binding dicts (as stored in ecp_omnigent_policies).
              Disabled rules and rules with an unknown decision are ignored.
    action:   {agent_key, action_type, target, ...}

    Returns a dict:
      {verdict, reason_code, matched_policy_id, matched_priority, candidates}
    where `candidates` is the count of enabled rules that matched (for auditing
    why a verdict was chosen). Deny-by-default: no match -> DENY / NO_MATCHING.
    """
    matching = []
    for rule in policies or ():
        if not rule.get("enabled", False):
            continue
        if rule.get("decision") not in VERDICTS:
            continue
        if _rule_matches(rule, action):
            matching.append(rule)

    if not matching:
        return {
            "verdict": DENY,
            "reason_code": R_NO_MATCH,
            "matched_policy_id": None,
            "matched_priority": None,
            "candidates": 0,
        }

    # Highest priority wins; ties break to the most restrictive verdict.
    winner = max(
        matching,
        key=lambda r: (int(r.get("priority", 0)), _RESTRICTIVENESS[r["decision"]]),
    )
    return {
        "verdict": winner["decision"],
        "reason_code": R_MATCHED,
        "matched_policy_id": winner.get("id"),
        "matched_priority": int(winner.get("priority", 0)),
        "candidates": len(matching),
    }


def overlay_reason(pep_result, kernel_permits: bool):
    """Compose the PEP verdict with the kernel decision (runner-level).

    The overlay can only *narrow* authority. If the kernel denies, the effective
    verdict is DENY regardless of the PEP (an operator ALLOW cannot resurrect a
    kernel-denied action). Otherwise the PEP verdict stands.

    Returns (effective_verdict, reason_code).
    """
    if not kernel_permits:
        return DENY, R_KERNEL_DENY
    return pep_result["verdict"], pep_result["reason_code"]


def policy_overlay(policies, *, on_ask=ASK):
    """Build a connector-style overlay callable for the enforcement chokepoint.

    Returns a callable(action_dict) -> (ok, reason) suitable to pass as an early
    gate. `ok` is True only on ALLOW. ASK and DENY both return False (fail
    closed) with their reason code, because an unattended runner has no human to
    answer an ASK -- an ASK that cannot be answered is a refusal, not a pass.
    `on_ask` is accepted for callers that resolve ASK elsewhere; by default ASK
    fails closed.
    """
    def _overlay(action):
        res = resolve(policies, action)
        v = res["verdict"]
        if v == ALLOW:
            return True, res["reason_code"]
        if v == ASK and on_ask == ALLOW:
            return True, res["reason_code"]
        return False, f"{res['reason_code']}:{v}"

    return _overlay


# --- Offline verification ---------------------------------------------------

def _p(agent_key, action_type, target_glob, decision, priority=100, enabled=True, pid=None):
    return {
        "id": pid or f"{agent_key}:{action_type}:{target_glob}:{decision}",
        "agent_key": agent_key,
        "action_type": action_type,
        "target_glob": target_glob,
        "decision": decision,
        "priority": priority,
        "enabled": enabled,
    }


_BACKSTOP = _p("*", "*", "*", DENY, priority=0)


def test_deny_by_default_when_no_policies():
    res = resolve([], {"agent_key": "x", "action_type": "y", "target": "z"})
    assert res["verdict"] == DENY and res["reason_code"] == R_NO_MATCH


def test_backstop_denies_unmatched_action():
    res = resolve([_BACKSTOP], {"agent_key": "x", "action_type": "y", "target": "z"})
    assert res["verdict"] == DENY and res["reason_code"] == R_MATCHED


def test_specific_allow_beats_backstop_by_priority():
    pols = [_BACKSTOP, _p("sage", "enrich_ioc", "*", ALLOW, priority=120)]
    res = resolve(pols, {"agent_key": "sage", "action_type": "enrich_ioc", "target": "1.2.3.4"})
    assert res["verdict"] == ALLOW and res["matched_priority"] == 120


def test_agent_key_is_case_folded():
    pols = [_p("SAGE", "ENRICH_IOC", "*", ALLOW, priority=50)]
    res = resolve(pols, {"agent_key": "sage", "action_type": "enrich_ioc", "target": "x"})
    assert res["verdict"] == ALLOW


def test_target_glob_matches_prefix():
    pols = [_BACKSTOP, _p("van", "block_ip", "10.*", ASK, priority=200),
            _p("van", "block_ip", "*", ALLOW, priority=150)]
    internal = resolve(pols, {"agent_key": "van", "action_type": "block_ip", "target": "10.0.0.5"})
    external = resolve(pols, {"agent_key": "van", "action_type": "block_ip", "target": "8.8.8.8"})
    assert internal["verdict"] == ASK
    assert external["verdict"] == ALLOW


def test_disabled_rule_is_ignored():
    pols = [_BACKSTOP, _p("sage", "enrich_ioc", "*", ALLOW, priority=120, enabled=False)]
    res = resolve(pols, {"agent_key": "sage", "action_type": "enrich_ioc", "target": "x"})
    assert res["verdict"] == DENY


def test_unknown_decision_is_ignored():
    pols = [_p("sage", "enrich_ioc", "*", "MAYBE", priority=999)]
    res = resolve(pols, {"agent_key": "sage", "action_type": "enrich_ioc", "target": "x"})
    assert res["verdict"] == DENY and res["reason_code"] == R_NO_MATCH


def test_priority_tie_breaks_to_most_restrictive():
    pols = [_p("a", "b", "*", ALLOW, priority=100, pid="allow"),
            _p("a", "b", "*", DENY, priority=100, pid="deny")]
    res = resolve(pols, {"agent_key": "a", "action_type": "b", "target": "t"})
    assert res["verdict"] == DENY and res["matched_policy_id"] == "deny"


def test_wildcard_agent_and_action_match():
    pols = [_p("*", "*", "prod-*", DENY, priority=300)]
    res = resolve(pols, {"agent_key": "anyone", "action_type": "anything", "target": "prod-db-1"})
    assert res["verdict"] == DENY


def test_overlay_allows_only_on_allow():
    ov = policy_overlay([_BACKSTOP, _p("sage", "enrich_ioc", "*", ALLOW, priority=120)])
    ok, _ = ov({"agent_key": "sage", "action_type": "enrich_ioc", "target": "x"})
    assert ok is True


def test_overlay_ask_fails_closed_by_default():
    ov = policy_overlay([_p("van", "isolate_host", "*", ASK, priority=200)])
    ok, reason = ov({"agent_key": "van", "action_type": "isolate_host", "target": "host-1"})
    assert ok is False and reason.endswith(":ASK")


def test_overlay_deny_fails_closed():
    ov = policy_overlay([_BACKSTOP])
    ok, reason = ov({"agent_key": "x", "action_type": "y", "target": "z"})
    assert ok is False and ":DENY" in reason


def test_overlay_reason_narrows_on_kernel_deny():
    res = resolve([_p("a", "b", "*", ALLOW, priority=100)],
                  {"agent_key": "a", "action_type": "b", "target": "t"})
    v, code = overlay_reason(res, kernel_permits=False)
    assert v == DENY and code == R_KERNEL_DENY


def test_overlay_reason_keeps_pep_when_kernel_permits():
    res = resolve([_p("a", "b", "*", ALLOW, priority=100)],
                  {"agent_key": "a", "action_type": "b", "target": "t"})
    v, code = overlay_reason(res, kernel_permits=True)
    assert v == ALLOW and code == R_MATCHED


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    raise SystemExit(1 if failures else 0)

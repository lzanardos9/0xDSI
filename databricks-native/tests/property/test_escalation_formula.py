"""
Parity tests for the threat escalation formula (server-side port).

escalation_formula.py must produce the same numbers as the browser engine in
app/frontend/src/lib/threatEscalation.ts. Every expected value below was hand
-computed from that TypeScript so the two implementations can never silently
diverge. Pure stdlib -- no Spark -- so this runs offline.

Run:  python3 databricks-native/tests/property/test_escalation_formula.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import escalation_formula as F  # noqa: E402


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


# --- severity mapping ---

def test_severity_scores_match_ts_table():
    assert F.severity_score("very_low") == 2
    assert F.severity_score("low") == 4
    assert F.severity_score("medium") == 6
    assert F.severity_score("high") == 8
    assert F.severity_score("very_high") == 10


def test_unknown_severity_defaults_to_six():
    assert F.severity_score("bogus") == 6
    assert F.severity_score(None) == 6


# --- MCR ---

def test_mcr_no_asset_uses_low_defaults():
    mc, rel = F.calculate_mcr({}, None)
    assert mc == 3.0 and rel == 0.3


def test_mcr_manual_discovery_bumps_confidence_and_matches_bump_relevance():
    asset = {
        "model_confidence": 5,
        "discovery_method": "manual",
        "exposed_ports": [443],
        "known_vulnerabilities": [{"cve": "CVE-1"}],
        "criticality_score": 2.0,
    }
    event = {"event_port": 443, "vulnerabilities": ["CVE-1"]}
    mc, rel = F.calculate_mcr(event, asset)
    assert mc == 7            # 5 + 2 (manual)
    assert approx(rel, 1.0)   # 0.5 + 0.3 (port) + 0.4 (vuln) -> capped at 1.0


def test_mcr_agent_discovery_and_no_matches():
    asset = {
        "model_confidence": 5,
        "discovery_method": "agent",
        "exposed_ports": [22],
        "known_vulnerabilities": [],
        "criticality_score": 1.0,
    }
    event = {"event_port": 443, "vulnerabilities": []}
    mc, rel = F.calculate_mcr(event, asset)
    assert mc == 6            # 5 + 1 (agent)
    assert approx(rel, 0.5)   # no port/vuln match


def test_mcr_confidence_caps_at_ten():
    asset = {"model_confidence": 9, "discovery_method": "manual"}
    mc, _ = F.calculate_mcr({}, asset)
    assert mc == 10


def test_mcr_matches_vuln_by_id_field():
    asset = {"known_vulnerabilities": [{"id": "V-9"}]}
    event = {"vulnerabilities": ["V-9"]}
    _, rel = F.calculate_mcr(event, asset)
    assert approx(rel, 0.9)   # 0.5 + 0.4


# --- threat weight ---

def test_threat_weight_defaults_to_one_without_match():
    assert F.calculate_threat_weight(None, None) == 1.0
    assert F.calculate_threat_weight("1.2.3.4", []) == 1.0
    intel = [{"indicator_value": "9.9.9.9", "is_active": True, "threat_severity": 8}]
    assert F.calculate_threat_weight("1.2.3.4", intel) == 1.0


def test_threat_weight_averages_active_matches():
    intel = [
        {"indicator_value": "1.2.3.4", "is_active": True, "threat_severity": 8},
        {"indicator_value": "1.2.3.4", "is_active": True, "threat_severity": 4},
        {"indicator_value": "1.2.3.4", "is_active": False, "threat_severity": 10},
    ]
    # avg over active = 6 -> 1 + (6*3)/100 = 1.18
    assert approx(F.calculate_threat_weight("1.2.3.4", intel), 1.18)


# --- full formula parity ---

def test_priority_medium_no_context_default_formula():
    calc = F.calculate_priority({"initial_severity": "medium"})
    # 6 * 0.09 * (1 * 4) * 1 = 2.16
    assert approx(calc["final_priority"], 2.16)
    assert calc["priority_level"] == "low"


def test_priority_high_with_asset_and_threat_is_critical():
    asset = {
        "model_confidence": 5,
        "discovery_method": "manual",
        "exposed_ports": [443],
        "known_vulnerabilities": [{"cve": "CVE-1"}],
        "criticality_score": 2.0,
    }
    event = {
        "initial_severity": "high",
        "event_port": 443,
        "vulnerabilities": ["CVE-1"],
        "source_ip": "1.2.3.4",
    }
    intel = [{"indicator_value": "1.2.3.4", "is_active": True, "threat_severity": 8}]
    calc = F.calculate_priority(event, asset, intel)
    # 8 * 0.7 * (1.24 * 4) * 2.0 = 55.55 (rounded)
    assert approx(calc["final_priority"], 55.55)
    assert calc["priority_level"] == "critical"


def test_priority_low_agent_asset_is_medium():
    asset = {
        "model_confidence": 5,
        "discovery_method": "agent",
        "exposed_ports": [22],
        "known_vulnerabilities": [],
        "criticality_score": 1.0,
    }
    event = {"initial_severity": "low", "event_port": 443, "vulnerabilities": []}
    calc = F.calculate_priority(event, asset, [])
    # 4 * 0.3 * (1 * 4) * 1 = 4.8
    assert approx(calc["final_priority"], 4.8)
    assert calc["priority_level"] == "medium"


def test_custom_formula_weights_applied():
    formula = {"severity_weight": 2, "threat_weight_multiplier": 0.05}
    calc = F.calculate_priority({"initial_severity": "medium"}, formula=formula)
    # (6*2) * 0.09 * (1 * (1 + 5)) * 1 = 6.48
    assert approx(calc["final_priority"], 6.48)
    assert calc["priority_level"] == "high"


def test_zero_multiplier_falls_back_to_default_like_ts():
    # TS uses `formula?.x || default`, so a falsy 0.0 falls back to 0.03.
    formula = {"threat_weight_multiplier": 0.0}
    calc = F.calculate_priority({"initial_severity": "medium"}, formula=formula)
    assert approx(calc["final_priority"], 2.16)


def test_priority_level_bands():
    assert F.priority_level(9.0) == "critical"
    assert F.priority_level(7.0) == "very_high"
    assert F.priority_level(5.0) == "high"
    assert F.priority_level(3.0) == "medium"
    assert F.priority_level(1.0) == "low"
    assert F.priority_level(0.5) == "very_low"


def test_result_carries_all_persistable_fields():
    calc = F.calculate_priority({"initial_severity": "high"})
    for key in ("severity_score", "model_confidence", "relevance_score",
                "mcr_factor", "threat_weight", "asset_criticality",
                "final_priority", "priority_level", "details"):
        assert key in calc


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

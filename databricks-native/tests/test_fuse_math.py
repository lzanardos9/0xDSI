"""
Unit tests for the Fuse Engine's Dempster-Shafer combination math.

These run with plain Python (no Spark, no Databricks). They load ONLY the pure
functions out of ``notebooks/correlation/10_fuse_engine.py`` by extracting their
source between known anchors and exec-ing them in an isolated namespace, so the
tests exercise the real shipped code without importing the whole notebook (which
calls dbutils at import time).

Run:  python3 -m pytest databricks-native/tests/test_fuse_math.py -q
   or: python3 databricks-native/tests/test_fuse_math.py
"""

import math
import os
import re

NOTEBOOK = os.path.join(
    os.path.dirname(__file__), "..", "notebooks", "correlation", "10_fuse_engine.py"
)


def _load_pure_functions():
    with open(NOTEBOOK, "r") as f:
        src = f.read()
    start = src.index("def _ds_combine_pair(")
    end = src.index("def compute_independence_weights(")
    block = src[start:end]
    ns = {"math": math}
    exec(compile(block, NOTEBOOK, "exec"), ns)
    return ns["dempster_shafer_combine"], ns["_ds_combine_pair"]


combine, combine_pair = _load_pure_functions()


def _sig(score, weight=1.0):
    return {"decayed_score": score, "independence_weight": weight}


def test_empty_is_total_uncertainty():
    belief, plaus, unc, conflict = combine([])
    assert belief == 0.0 and plaus == 0.0 and unc == 1.0 and conflict == 0.0


def test_masses_sum_to_one():
    belief, plaus, unc, conflict = combine([_sig(0.8), _sig(0.6), _sig(0.3)])
    belief_benign = 1.0 - plaus
    total = belief + belief_benign + unc
    assert abs(total - 1.0) < 1e-3, total


def test_plausibility_is_upper_bound():
    belief, plaus, unc, _ = combine([_sig(0.7), _sig(0.55)])
    assert plaus >= belief
    assert abs(plaus - (belief + unc)) < 1e-3


def test_agreeing_threat_signals_reinforce():
    """Two independent signals that both argue threat should yield belief
    strictly greater than either alone (the whole point of D-S fusion)."""
    one = combine([_sig(0.7)])[0]
    two = combine([_sig(0.7), _sig(0.7)])[0]
    assert two > one, (one, two)


def test_conflict_rises_on_contradiction():
    """One signal screams threat, another screams benign -> real conflict."""
    agree = combine([_sig(0.9), _sig(0.85)])[3]
    conflict = combine([_sig(0.9), _sig(0.1)])[3]
    assert conflict > agree
    assert conflict > 0.2, conflict


def test_certain_agreement_has_near_zero_conflict():
    """When signals are (near) certain of threat they retain almost no benign
    mass, so classic D-S conflict collapses toward zero."""
    conflict = combine([_sig(0.99), _sig(0.98), _sig(0.99)])[3]
    assert conflict < 0.1, conflict


def test_agreement_conflicts_less_than_contradiction():
    agree = combine([_sig(0.8), _sig(0.82)])[3]
    contradict = combine([_sig(0.8), _sig(0.18)])[3]
    assert contradict > agree, (agree, contradict)


def test_low_confidence_signal_moves_belief_less():
    """A signal down-weighted for correlation should shift belief less than a
    fully independent one with the same score."""
    strong = combine([_sig(0.9, weight=1.0)])[0]
    weak = combine([_sig(0.9, weight=0.2)])[0]
    assert strong > weak, (strong, weak)


def test_monotonic_in_score():
    low = combine([_sig(0.3), _sig(0.3)])[0]
    high = combine([_sig(0.8), _sig(0.8)])[0]
    assert high > low


def test_pairwise_conflict_is_symmetric():
    a = (0.8, 0.1, 0.1)
    b = (0.1, 0.8, 0.1)
    (_, kab) = combine_pair(a, b)
    (_, kba) = combine_pair(b, a)
    assert abs(kab - kba) < 1e-9


def test_total_conflict_falls_back_to_ignorance():
    """Fully contradictory point masses (threat=1 vs benign=1) cannot be
    normalized; the combiner must not divide by zero."""
    combined, k = combine_pair((1.0, 0.0, 0.0), (0.0, 1.0, 0.0))
    assert k == 1.0
    assert combined == (0.0, 0.0, 1.0)


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

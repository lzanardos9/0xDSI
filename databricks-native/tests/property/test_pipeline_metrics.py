"""
Property tests for pipeline observability metrics (REV2-26).

pipeline_metrics.py is stdlib-only (it reuses ingest_accounting.reconcile), so
putting notebooks/_shared on sys.path makes it importable with no Spark. These
tests pin the four metric families the audit asked for -- ingestion lag,
quarantined/lost records, outbox backlog, and verification -- and the rule that
matters most: data loss is always a BREACH, never a soft warning.

Run:  python3 databricks-native/tests/property/test_pipeline_metrics.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import pipeline_metrics as M  # noqa: E402


def _by_name(metrics, name):
    return next(m for m in metrics if m["name"] == name)


# --- Threshold ---

def test_upper_threshold_classifies_three_bands():
    t = M.Threshold(warn=10, breach=20, direction=M.UPPER)
    assert t.classify(5) == M.OK
    assert t.classify(10) == M.WARN
    assert t.classify(25) == M.BREACH


def test_lower_threshold_classifies_three_bands():
    t = M.Threshold(warn=0.99, breach=0.95, direction=M.LOWER)
    assert t.classify(1.0) == M.OK
    assert t.classify(0.99) == M.WARN
    assert t.classify(0.90) == M.BREACH


def test_threshold_rejects_inconsistent_bounds():
    for args in [dict(warn=20, breach=10, direction=M.UPPER),
                 dict(warn=0.95, breach=0.99, direction=M.LOWER),
                 dict(warn=1, breach=1, direction="sideways")]:
        try:
            M.Threshold(**args)
            raise AssertionError(f"expected ValueError for {args}")
        except ValueError:
            pass


# --- Ingestion lag ---

def test_lag_is_now_minus_last_event():
    m = M.ingestion_lag_metric(now_ts=1000, last_event_ts=940)
    assert m["value"] == 60.0 and m["status"] == M.OK


def test_lag_breaches_when_far_behind():
    m = M.ingestion_lag_metric(now_ts=1000, last_event_ts=0)
    assert m["status"] == M.BREACH


def test_no_events_is_a_breach_not_healthy():
    m = M.ingestion_lag_metric(now_ts=1000, last_event_ts=None)
    assert m["status"] == M.BREACH
    assert m["detail"]["reason"] == "no_events_observed"


def test_clock_skew_never_reports_negative_lag():
    m = M.ingestion_lag_metric(now_ts=100, last_event_ts=200)
    assert m["value"] == 0.0 and m["status"] == M.OK


# --- Data integrity: quarantine + loss ---

def test_quarantine_rate_computed_over_received():
    metrics = M.data_integrity_metrics(received=100, valid=90, quarantined=10)
    q = _by_name(metrics, "quarantine_rate")
    assert abs(q["value"] - 0.10) < 1e-9


def test_clean_batch_has_zero_loss_and_ok():
    metrics = M.data_integrity_metrics(100, 90, 10)
    loss = _by_name(metrics, "unaccounted_records")
    assert loss["value"] == 0.0 and loss["status"] == M.OK


def test_any_loss_is_a_breach():
    metrics = M.data_integrity_metrics(received=100, valid=80, quarantined=15)
    loss = _by_name(metrics, "unaccounted_records")
    assert loss["value"] == 5.0 and loss["status"] == M.BREACH


def test_double_count_is_also_a_breach():
    metrics = M.data_integrity_metrics(received=100, valid=80, quarantined=30)
    loss = _by_name(metrics, "unaccounted_records")
    assert loss["value"] == -10.0 and loss["status"] == M.BREACH


def test_empty_batch_has_zero_rate_no_divide_error():
    metrics = M.data_integrity_metrics(0, 0, 0)
    q = _by_name(metrics, "quarantine_rate")
    assert q["value"] == 0.0 and q["status"] == M.OK


# --- Outbox backlog ---

def test_outbox_depth_and_age_scored_independently():
    metrics = M.outbox_backlog_metrics(pending=50, oldest_age_seconds=3600)
    depth = _by_name(metrics, "outbox_backlog")
    age = _by_name(metrics, "outbox_oldest_age_seconds")
    assert depth["status"] == M.OK          # 50 rows is fine
    assert age["status"] == M.BREACH        # but stuck for an hour is not


def test_empty_outbox_reports_zero_age():
    metrics = M.outbox_backlog_metrics(pending=0, oldest_age_seconds=9999)
    age = _by_name(metrics, "outbox_oldest_age_seconds")
    assert age["value"] == 0.0 and age["status"] == M.OK


# --- Verification ---

def test_verification_pass_rate():
    m = M.verification_metric(passed=99, failed=1)
    assert abs(m["value"] - 0.99) < 1e-9 and m["status"] == M.WARN


def test_all_passing_is_ok():
    m = M.verification_metric(passed=100, failed=0)
    assert m["value"] == 1.0 and m["status"] == M.OK


def test_no_verifications_is_ok_not_divide_by_zero():
    m = M.verification_metric(passed=0, failed=0)
    assert m["value"] == 1.0 and m["status"] == M.OK


def test_mostly_failing_breaches():
    m = M.verification_metric(passed=50, failed=50)
    assert m["status"] == M.BREACH


# --- Collection + rollup ---

def test_collect_returns_all_six_metrics():
    metrics = M.collect_pipeline_metrics(
        now_ts=1000, last_event_ts=980, received=100, valid=100, quarantined=0,
        outbox_pending=0, outbox_oldest_age_seconds=0,
        verifications_passed=100, verifications_failed=0,
    )
    names = {m["name"] for m in metrics}
    assert names == {
        "ingestion_lag_seconds", "quarantine_rate", "unaccounted_records",
        "outbox_backlog", "outbox_oldest_age_seconds", "verification_pass_rate",
    }


def test_healthy_snapshot_rolls_up_ok():
    metrics = M.collect_pipeline_metrics(
        now_ts=1000, last_event_ts=990, received=100, valid=100, quarantined=0,
        outbox_pending=0, outbox_oldest_age_seconds=0,
        verifications_passed=100, verifications_failed=0,
    )
    assert M.worst_status(metrics) == M.OK


def test_one_loss_forces_overall_breach():
    metrics = M.collect_pipeline_metrics(
        now_ts=1000, last_event_ts=990, received=100, valid=90, quarantined=0,
        outbox_pending=0, outbox_oldest_age_seconds=0,
        verifications_passed=100, verifications_failed=0,
    )
    assert M.worst_status(metrics) == M.BREACH


def test_worst_status_empty_is_ok():
    assert M.worst_status([]) == M.OK


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

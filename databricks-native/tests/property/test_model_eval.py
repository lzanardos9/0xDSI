"""
Property tests for the leakage-safe evaluation harness and promotion gate
(REV2-14, REV2-28 model side).

model_eval.py is pure stdlib and lives in notebooks/_shared, so putting that dir
on sys.path makes it importable with no Spark, MLflow or model artifact. These
tests pin the guarantees the training notebook relies on: temporal and grouped
splits never leak a unit across the boundary, ROC-AUC ranks correctly and stays
neutral on degenerate input, and the promotion gate refuses weak, overfit or
degenerate models.

Run:  python3 databricks-native/tests/property/test_model_eval.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import model_eval as M  # noqa: E402


def test_temporal_split_no_future_leak():
    rows = [{"t": i, "id": i} for i in range(100)]
    train, test = M.temporal_split(rows, "t", test_fraction=0.2)
    assert train and test
    assert max(r["t"] for r in train) < min(r["t"] for r in test)
    assert len(train) + len(test) == 100


def test_temporal_split_keeps_boundary_time_whole():
    # Ten rows share timestamp 5; none may straddle train/test.
    rows = [{"t": 5, "id": i} for i in range(10)] + [{"t": t, "id": 100 + t} for t in range(6, 20)]
    train, test = M.temporal_split(rows, "t", test_fraction=0.4)
    train_times = {r["t"] for r in train}
    test_times = {r["t"] for r in test}
    assert not (train_times & test_times)


def test_temporal_split_small_input():
    assert M.temporal_split([{"t": 1}], "t") == ([{"t": 1}], [])


def test_grouped_split_entity_never_in_both():
    rows = [{"entity": f"e{i % 20}", "id": i} for i in range(400)]
    train, test = M.grouped_split(rows, "entity", test_fraction=0.3, seed=7)
    train_entities = {r["entity"] for r in train}
    test_entities = {r["entity"] for r in test}
    assert not (train_entities & test_entities)
    assert not M.leakage_keys(train, test, ["entity"])


def test_grouped_split_deterministic():
    rows = [{"entity": f"e{i}", "id": i} for i in range(200)]
    a = M.grouped_split(rows, "entity", test_fraction=0.25, seed=1)
    b = M.grouped_split(rows, "entity", test_fraction=0.25, seed=1)
    assert [r["id"] for r in a[1]] == [r["id"] for r in b[1]]


def test_leakage_keys_detects_overlap():
    train = [{"id": 1}, {"id": 2}]
    test = [{"id": 2}, {"id": 3}]
    assert M.leakage_keys(train, test, ["id"]) == {(2,)}


def test_roc_auc_perfect_separation():
    y_true = [0, 0, 1, 1]
    y_score = [0.1, 0.2, 0.8, 0.9]
    assert M.roc_auc(y_true, y_score) == 1.0


def test_roc_auc_inverted_is_zero():
    y_true = [0, 0, 1, 1]
    y_score = [0.9, 0.8, 0.2, 0.1]
    assert M.roc_auc(y_true, y_score) == 0.0


def test_roc_auc_ties_are_half():
    y_true = [0, 1, 0, 1]
    y_score = [0.5, 0.5, 0.5, 0.5]
    assert abs(M.roc_auc(y_true, y_score) - 0.5) < 1e-9


def test_roc_auc_single_class_is_neutral():
    assert M.roc_auc([1, 1, 1], [0.2, 0.7, 0.9]) == 0.5
    assert M.roc_auc([0, 0, 0], [0.2, 0.7, 0.9]) == 0.5


def test_precision_recall_f1():
    y_true = [1, 1, 0, 0]
    y_pred = [1, 0, 1, 0]
    assert M.precision(y_true, y_pred) == 0.5
    assert M.recall(y_true, y_pred) == 0.5
    assert abs(M.f1(y_true, y_pred) - 0.5) < 1e-9


def test_base_rate():
    assert M.base_rate([1, 0, 0, 0]) == 0.25
    assert M.base_rate([]) == 0.0


def test_gate_promotes_strong_model():
    g = M.promotion_gate(test_auc=0.85, train_auc=0.88, labels_base_rate=0.2)
    assert g["promote"]
    assert g["reasons"] == []


def test_gate_rejects_below_floor():
    g = M.promotion_gate(test_auc=0.62, train_auc=0.63, labels_base_rate=0.2)
    assert not g["promote"]
    assert any("floor" in r for r in g["reasons"])


def test_gate_rejects_no_lift_over_baseline():
    g = M.promotion_gate(
        test_auc=0.52, train_auc=0.52, labels_base_rate=0.2, min_test_auc=0.5
    )
    assert not g["promote"]
    assert any("baseline" in r for r in g["reasons"])


def test_gate_rejects_overfit():
    g = M.promotion_gate(test_auc=0.72, train_auc=0.98, labels_base_rate=0.2)
    assert not g["promote"]
    assert any("overfit" in r for r in g["reasons"])


def test_gate_rejects_degenerate_labels():
    g = M.promotion_gate(test_auc=0.9, train_auc=0.9, labels_base_rate=0.0)
    assert not g["promote"]
    assert any("degenerate" in r for r in g["reasons"])


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

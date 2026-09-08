"""
Leakage-safe model evaluation harness and artifact-promotion gate (REV2-14,
REV2-28 model side).

A model is only as trustworthy as the evaluation that measured it. Two failure
modes this module guards against:

- Leakage (REV2-14): a random row split lets the same entity or the same moment
  in time land in both train and test, so the test score measures memorisation,
  not generalisation. `temporal_split` and `grouped_split` partition by time or
  by entity so a unit never straddles the boundary, and `leakage_keys` proves a
  split is clean.

- Promotion without a baseline (REV2-28, model side): a model that cannot beat a
  coin flip, or that scores far better on train than on held-out test, must not
  be promoted to serving. `promotion_gate` encodes that decision from scalar
  metrics so the training notebook can refuse to register a weak or overfit
  artifact.

Pure stdlib: importable inside notebooks (bare import, _shared is on sys.path)
and exercised directly by offline tests with no Spark, MLflow or model artifact.
"""

import hashlib

# A random or majority-class classifier has ROC-AUC 0.5; that is the floor any
# real model must clear.
BASELINE_AUC = 0.5


def temporal_split(rows, time_key, test_fraction=0.2):
    """Split rows so every test row is at or after every train row.

    Rows are ordered by time_key; the latest `test_fraction` of the timeline
    becomes the test set. The boundary timestamp is kept whole -- all rows
    sharing the cutoff time go to test -- so no single instant appears in both
    partitions. Returns (train, test).
    """
    if not 0.0 < test_fraction < 1.0:
        raise ValueError("test_fraction must be in (0, 1)")
    ordered = sorted(rows, key=lambda r: r[time_key])
    n = len(ordered)
    if n < 2:
        return list(ordered), []
    cutoff_index = int(round(n * (1.0 - test_fraction)))
    cutoff_index = max(1, min(cutoff_index, n - 1))
    cutoff_time = ordered[cutoff_index][time_key]
    train = [r for r in ordered if r[time_key] < cutoff_time]
    test = [r for r in ordered if r[time_key] >= cutoff_time]
    # If every row shares one timestamp the whole set is inseparable in time;
    # fall back to keeping one row for test so callers still get two partitions.
    if not train:
        train, test = ordered[:cutoff_index], ordered[cutoff_index:]
    return train, test


def _group_in_test(group_value, seed, test_fraction):
    digest = hashlib.sha256(f"{seed}:{group_value}".encode("utf-8")).hexdigest()
    # Map the first 8 hex digits to a stable fraction in [0, 1).
    bucket = int(digest[:8], 16) / 0x100000000
    return bucket < test_fraction


def grouped_split(rows, group_key, test_fraction=0.2, seed=0):
    """Assign whole groups (e.g. entities) to train or test.

    Every row of a given group_key value lands in the same partition, chosen by
    a deterministic hash, so an entity never appears in both train and test.
    Returns (train, test).
    """
    if not 0.0 < test_fraction < 1.0:
        raise ValueError("test_fraction must be in (0, 1)")
    train, test = [], []
    for row in rows:
        if _group_in_test(row[group_key], seed, test_fraction):
            test.append(row)
        else:
            train.append(row)
    return train, test


def leakage_keys(train, test, keys):
    """Return the set of key tuples present in both partitions (empty == clean)."""
    def key_of(row):
        return tuple(row[k] for k in keys)

    train_keys = {key_of(r) for r in train}
    return {key_of(r) for r in test} & train_keys


def base_rate(y_true):
    """Fraction of positive labels."""
    if not y_true:
        return 0.0
    return sum(1 for y in y_true if y) / len(y_true)


def roc_auc(y_true, y_score):
    """Rank-based ROC-AUC (Mann-Whitney U), tolerant of ties.

    Returns 0.5 when either class is absent, because AUC is undefined there and
    a neutral score must not let a degenerate set look skilful.
    """
    if len(y_true) != len(y_score):
        raise ValueError("y_true and y_score length mismatch")
    positives = [s for y, s in zip(y_true, y_score) if y]
    negatives = [s for y, s in zip(y_true, y_score) if not y]
    if not positives or not negatives:
        return 0.5
    # Average ranks over the pooled scores (1-based), so ties share credit.
    pooled = sorted((s, i) for i, s in enumerate(y_score))
    ranks = [0.0] * len(y_score)
    i = 0
    while i < len(pooled):
        j = i
        while j + 1 < len(pooled) and pooled[j + 1][0] == pooled[i][0]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[pooled[k][1]] = avg_rank
        i = j + 1
    rank_sum_pos = sum(rank for rank, y in zip(ranks, y_true) if y)
    n_pos, n_neg = len(positives), len(negatives)
    return (rank_sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def confusion(y_true, y_pred):
    tp = sum(1 for t, p in zip(y_true, y_pred) if t and p)
    fp = sum(1 for t, p in zip(y_true, y_pred) if not t and p)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t and not p)
    tn = sum(1 for t, p in zip(y_true, y_pred) if not t and not p)
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def precision(y_true, y_pred):
    c = confusion(y_true, y_pred)
    denom = c["tp"] + c["fp"]
    return c["tp"] / denom if denom else 0.0


def recall(y_true, y_pred):
    c = confusion(y_true, y_pred)
    denom = c["tp"] + c["fn"]
    return c["tp"] / denom if denom else 0.0


def f1(y_true, y_pred):
    p, r = precision(y_true, y_pred), recall(y_true, y_pred)
    return 2 * p * r / (p + r) if (p + r) else 0.0


def promotion_gate(
    test_auc,
    train_auc,
    labels_base_rate,
    min_test_auc=0.7,
    min_lift=0.05,
    max_overfit_gap=0.1,
):
    """Decide whether a trained artifact may be promoted to serving.

    Refuses promotion unless the model clears an absolute floor, beats the
    coin-flip baseline by a margin, is not badly overfit (train minus test AUC
    within a gap), and was trained on a non-degenerate label mix. Returns a dict
    with `promote`, the ordered list of failed `reasons`, and the raw `checks`.
    """
    beats_baseline = test_auc >= BASELINE_AUC + min_lift
    meets_floor = test_auc >= min_test_auc
    overfit_gap = train_auc - test_auc
    not_overfit = overfit_gap <= max_overfit_gap
    non_degenerate = 0.0 < labels_base_rate < 1.0

    checks = {
        "meets_floor": meets_floor,
        "beats_baseline": beats_baseline,
        "not_overfit": not_overfit,
        "non_degenerate_labels": non_degenerate,
        "test_auc": test_auc,
        "train_auc": train_auc,
        "baseline_auc": BASELINE_AUC,
        "overfit_gap": overfit_gap,
        "labels_base_rate": labels_base_rate,
    }

    reasons = []
    if not non_degenerate:
        reasons.append(
            f"degenerate label mix (base_rate={labels_base_rate:.3f}); "
            "test set has only one class"
        )
    if not meets_floor:
        reasons.append(f"test AUC {test_auc:.3f} below floor {min_test_auc:.3f}")
    if not beats_baseline:
        reasons.append(
            f"test AUC {test_auc:.3f} does not beat baseline "
            f"{BASELINE_AUC:.3f} by {min_lift:.3f}"
        )
    if not not_overfit:
        reasons.append(
            f"overfit: train AUC {train_auc:.3f} exceeds test AUC "
            f"{test_auc:.3f} by more than {max_overfit_gap:.3f}"
        )

    return {"promote": not reasons, "reasons": reasons, "checks": checks}

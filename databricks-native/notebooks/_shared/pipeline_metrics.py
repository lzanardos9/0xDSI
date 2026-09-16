"""
Pipeline observability metrics (REV2-26).

The audit found the platform emits execution logs but not the SLO signals an
operator needs to know a streaming pipeline is actually healthy: how far behind
real time it is, whether records are being quarantined or silently lost, whether
the delivery outbox is draining, and whether evidence verification is passing.
This module computes those four metric families as structured, thresholded rows.

Every metric is scored against a `Threshold` into one of OK / WARN / BREACH, so
a dashboard or alerting rule keys off `status` instead of re-deriving limits.
`collect_pipeline_metrics` assembles the full set in one call and `worst_status`
rolls them up into a single pipeline verdict.

Design notes:
  * Data loss is never a soft signal. `reconcile` (reused from ingest_accounting,
    the shipped REV2-21 logic) drives the loss metric, and ANY non-zero
    unaccounted count -- a drop or a double-count -- is a BREACH regardless of
    thresholds. We do not let a "small" loss read as merely a warning.
  * Pure stdlib so notebooks import it on a cluster and the offline property
    tests exercise the exact shipped logic with no Spark session.
"""

from dataclasses import dataclass

from ingest_accounting import reconcile

OK = "ok"
WARN = "warn"
BREACH = "breach"

# Ordered worst-first so worst_status can pick the max severity.
_SEVERITY = {OK: 0, WARN: 1, BREACH: 2}

UPPER = "upper"   # larger value is worse (lag, backlog, loss)
LOWER = "lower"   # larger value is better (pass rate)


@dataclass(frozen=True)
class Threshold:
    """A warn/breach boundary and which direction is unhealthy."""
    warn: float
    breach: float
    direction: str = UPPER

    def __post_init__(self):
        if self.direction not in (UPPER, LOWER):
            raise ValueError(f"unknown direction: {self.direction!r}")
        if self.direction == UPPER and not self.breach >= self.warn:
            raise ValueError("upper threshold needs breach >= warn")
        if self.direction == LOWER and not self.breach <= self.warn:
            raise ValueError("lower threshold needs breach <= warn")

    def classify(self, value):
        if self.direction == UPPER:
            if value >= self.breach:
                return BREACH
            if value >= self.warn:
                return WARN
            return OK
        if value <= self.breach:
            return BREACH
        if value <= self.warn:
            return WARN
        return OK


# Defaults tuned for a sub-minute streaming SOC pipeline; callers override per job.
DEFAULT_THRESHOLDS = {
    "ingestion_lag_seconds": Threshold(warn=120.0, breach=600.0, direction=UPPER),
    "quarantine_rate": Threshold(warn=0.05, breach=0.20, direction=UPPER),
    "outbox_backlog": Threshold(warn=1000.0, breach=10000.0, direction=UPPER),
    "outbox_oldest_age_seconds": Threshold(warn=300.0, breach=1800.0, direction=UPPER),
    "verification_pass_rate": Threshold(warn=0.99, breach=0.95, direction=LOWER),
}


def _metric(name, value, unit, status, detail=None):
    return {
        "name": name,
        "value": float(value),
        "unit": unit,
        "status": status,
        "detail": detail or {},
    }


def ingestion_lag_metric(now_ts, last_event_ts, threshold=None):
    """How far behind real time the pipeline is, in seconds.

    A missing `last_event_ts` (no events seen yet) is a BREACH: we cannot prove
    the pipeline is live, so it must not read as healthy.
    """
    threshold = threshold or DEFAULT_THRESHOLDS["ingestion_lag_seconds"]
    if last_event_ts is None:
        return _metric("ingestion_lag_seconds", 0.0, "s", BREACH,
                       {"reason": "no_events_observed"})
    lag = float(now_ts) - float(last_event_ts)
    if lag < 0:
        lag = 0.0  # clock skew; never report a negative lag
    return _metric("ingestion_lag_seconds", lag, "s", threshold.classify(lag))


def data_integrity_metrics(received, valid, quarantined, threshold=None):
    """Quarantine rate plus a hard loss check, from the shipped reconcile logic.

    Returns two metrics: the quarantine rate (thresholded) and unaccounted
    records (any non-zero value is a BREACH -- loss or double-count is never OK).
    """
    threshold = threshold or DEFAULT_THRESHOLDS["quarantine_rate"]
    acct = reconcile(received, valid, quarantined)
    total = acct["received"]
    rate = (acct["quarantined"] / total) if total > 0 else 0.0
    quarantine = _metric(
        "quarantine_rate", rate, "ratio", threshold.classify(rate),
        {"received": acct["received"], "quarantined": acct["quarantined"]},
    )
    loss_status = OK if acct["unaccounted"] == 0 else BREACH
    loss = _metric(
        "unaccounted_records", acct["unaccounted"], "count", loss_status,
        {"balanced": acct["balanced"]},
    )
    return [quarantine, loss]


def outbox_backlog_metrics(pending, oldest_age_seconds,
                           backlog_threshold=None, age_threshold=None):
    """Delivery outbox depth and the age of its oldest undelivered row.

    A backlog that is small but stuck (old oldest-row) is as bad as a large one,
    so depth and age are scored independently and both returned.
    """
    backlog_threshold = backlog_threshold or DEFAULT_THRESHOLDS["outbox_backlog"]
    age_threshold = age_threshold or DEFAULT_THRESHOLDS["outbox_oldest_age_seconds"]
    pending = max(int(pending), 0)
    age = max(float(oldest_age_seconds), 0.0) if pending > 0 else 0.0
    depth = _metric("outbox_backlog", pending, "count",
                    backlog_threshold.classify(pending))
    oldest = _metric("outbox_oldest_age_seconds", age, "s",
                     age_threshold.classify(age))
    return [depth, oldest]


def verification_metric(passed, failed, threshold=None):
    """Evidence-verification pass rate.

    With no verifications attempted the rate is undefined; we report 1.0 / OK
    rather than a divide-by-zero, and record the zero sample in the detail.
    """
    threshold = threshold or DEFAULT_THRESHOLDS["verification_pass_rate"]
    passed = max(int(passed), 0)
    failed = max(int(failed), 0)
    total = passed + failed
    rate = (passed / total) if total > 0 else 1.0
    status = OK if total == 0 else threshold.classify(rate)
    return _metric("verification_pass_rate", rate, "ratio", status,
                   {"passed": passed, "failed": failed})


def collect_pipeline_metrics(*, now_ts, last_event_ts, received, valid,
                             quarantined, outbox_pending, outbox_oldest_age_seconds,
                             verifications_passed, verifications_failed,
                             thresholds=None):
    """Assemble the full observability metric set for one pipeline snapshot."""
    thresholds = thresholds or DEFAULT_THRESHOLDS
    metrics = [ingestion_lag_metric(now_ts, last_event_ts,
                                    thresholds.get("ingestion_lag_seconds"))]
    metrics += data_integrity_metrics(received, valid, quarantined,
                                      thresholds.get("quarantine_rate"))
    metrics += outbox_backlog_metrics(
        outbox_pending, outbox_oldest_age_seconds,
        thresholds.get("outbox_backlog"), thresholds.get("outbox_oldest_age_seconds"),
    )
    metrics.append(verification_metric(verifications_passed, verifications_failed,
                                       thresholds.get("verification_pass_rate")))
    return metrics


def worst_status(metrics):
    """Roll a list of metric rows up into a single OK / WARN / BREACH verdict."""
    if not metrics:
        return OK
    return max((m["status"] for m in metrics), key=lambda s: _SEVERITY[s])

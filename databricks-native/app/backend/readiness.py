"""
Honest readiness: a dependency is only "ready" when it actually answers (REV2-25).

The prior `/ready` probe reported ready as soon as a connection handle could be
constructed. A Databricks SQL warehouse that is still STARTING will accept a
connection and even trigger its own start-up, so "handle exists" is not "the
dependency can serve queries" -- the probe returned a false green during exactly
the window a load balancer must keep traffic away.

This module fixes that by classifying the result of a *bounded canary* -- a
trivial query whose answer is known -- and by aggregating dependencies with a
deny-by-default rule: readiness is granted only when every required dependency
is READY. STARTING, UNKNOWN, TIMEOUT and FAILED never count as ready.

Pure stdlib: the classification and the aggregator are exercised by offline
tests with no database.
"""

# --- Dependency states ---
READY = "ready"
STARTING = "starting"
UNKNOWN = "unknown"
TIMEOUT = "timeout"
FAILED = "failed"

STATES = (READY, STARTING, UNKNOWN, TIMEOUT, FAILED)

# Everything that is not READY blocks readiness. Spelled out so a new state
# added later is non-ready by default rather than silently permissive.
NON_READY_STATES = frozenset({STARTING, UNKNOWN, TIMEOUT, FAILED})


def classify_canary(returned_value, expected, elapsed_ms, budget_ms, error_text=None):
    """Classify a bounded canary query into a dependency state.

    Order matters: an error is inspected first (a warehouse reporting itself
    starting is STARTING, an explicit timeout is TIMEOUT, anything else FAILED);
    then a run that overran its time budget is TIMEOUT; then a wrong answer is
    FAILED; only a correct answer inside the budget is READY. There is no path
    that turns a missing or wrong result into READY.
    """
    if error_text:
        low = str(error_text).lower()
        if "starting" in low or "warming up" in low or "warehouse is stopped" in low:
            return STARTING
        if "timeout" in low or "timed out" in low or "deadline" in low:
            return TIMEOUT
        return FAILED
    if elapsed_ms is not None and budget_ms is not None and elapsed_ms > budget_ms:
        return TIMEOUT
    if returned_value != expected:
        return FAILED
    return READY


def probe(name, state, required=True, detail=""):
    """Build a single dependency probe result."""
    if state not in STATES:
        raise ValueError(f"unknown readiness state: {state!r}")
    return {"name": name, "state": state, "required": bool(required), "detail": detail}


def aggregate_readiness(probes):
    """Combine dependency probes into an overall readiness verdict.

    Ready only when every *required* probe is READY. Optional probes are
    reported but never block. Returns a dict with `ready`, per-dependency
    `states`, the list of `not_ready` required dependencies, and a `summary`.
    """
    states = {p["name"]: p["state"] for p in probes}
    not_ready = [
        p["name"] for p in probes if p["required"] and p["state"] != READY
    ]
    required_total = sum(1 for p in probes if p["required"])
    ready = not not_ready and required_total > 0
    return {
        "ready": ready,
        "states": states,
        "not_ready": not_ready,
        "summary": {
            "required": required_total,
            "ready": sum(1 for p in probes if p["required"] and p["state"] == READY),
            "optional": sum(1 for p in probes if not p["required"]),
        },
    }

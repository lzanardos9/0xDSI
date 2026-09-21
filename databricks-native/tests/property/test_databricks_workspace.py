"""
Shape tests for the live workspace client (Phase 7).

The DatabricksWorkspaceClient cannot be run against a real workspace here, but its
*shape* can be pinned with a FakeSpark that records every `spark.sql(sql, args=...)`
call: that apply invokes the Unity Catalog function, that observe reads the state
back and returns it (or None), that action_type/target are passed as bound
parameters and never concatenated into the SQL text (so a crafted target cannot
inject SQL), and that a live dispatch stamps `provenance="live"` so and only so it
can promote. Nothing here talks to Databricks; FakeSpark is entirely in-memory.

Run:  python3 databricks-native/tests/property/test_databricks_workspace.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import enforcement as E  # noqa: E402
import databricks_workspace as D  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}


class FakeDF:
    def __init__(self, rows):
        self._rows = rows

    def collect(self):
        return list(self._rows)


class FakeRow(dict):
    pass


class FakeSpark:
    """Records sql calls. Read-back queries return `observe_state`; others [].

    calls: list of (sql, args) so a test can assert what was issued and that
    values were bound, not embedded.
    """

    def __init__(self, observe_state="isolated"):
        self.observe_state = observe_state
        self.calls = []

    def sql(self, sql, args=None):
        self.calls.append((sql, dict(args or {})))
        if "AS observed" in sql:
            if self.observe_state is None:
                return FakeDF([])
            return FakeDF([FakeRow(observed=self.observe_state)])
        return FakeDF([])


def _cfg():
    return D.LiveWorkspaceConfig(catalog="soc_platform", schema="response")


def _ctx(**over):
    c = {"agent": {"autonomy": K.A3, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": "op-ciso", "live_finding": CONFIRMED}
    c.update(over)
    return c


def _prop(**over):
    p = {"action_type": "isolate_host", "target": "host:WIN-1", "reason": "threat",
         "proposed_by": "vanguard", "confidence": 0.9, "finding_id": "f1"}
    p.update(over)
    return p


def test_requires_a_spark_session():
    try:
        D.DatabricksWorkspaceClient(None, _cfg())
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_apply_invokes_the_uc_function_with_bound_args():
    spark = FakeSpark()
    client = D.DatabricksWorkspaceClient(spark, _cfg())
    client.apply("isolate_host", "host:WIN-1")
    sql, args = spark.calls[-1]
    assert "execute_response_action" in sql
    assert "`soc_platform`.`response`.`execute_response_action`" in sql
    assert ":action_type" in sql and ":target" in sql
    assert args == {"action_type": "isolate_host", "target": "host:WIN-1"}


def test_observe_reads_state_back_and_returns_it():
    spark = FakeSpark(observe_state="isolated")
    client = D.DatabricksWorkspaceClient(spark, _cfg())
    assert client.observe("isolate_host", "host:WIN-1") == "isolated"
    sql, args = spark.calls[-1]
    assert "AS observed" in sql
    assert "`soc_platform`.`response`.`response_action_state`" in sql
    assert args == {"action_type": "isolate_host", "target": "host:WIN-1"}


def test_observe_returns_none_when_no_state():
    spark = FakeSpark(observe_state=None)
    client = D.DatabricksWorkspaceClient(spark, _cfg())
    assert client.observe("isolate_host", "host:UNKNOWN") is None


def test_values_are_bound_never_concatenated_into_sql():
    spark = FakeSpark()
    client = D.DatabricksWorkspaceClient(spark, _cfg())
    evil = "host:1'); DROP TABLE response_action_state; --"
    client.apply("isolate_host", evil)
    sql, args = spark.calls[-1]
    assert evil not in sql              # never embedded in the statement text
    assert "DROP TABLE" not in sql
    assert args["target"] == evil       # carried only as a bound parameter


def test_live_dispatch_verifies_and_stamps_provenance_live():
    spark = FakeSpark(observe_state="isolated")
    ledger = []
    rec = D.live_dispatch("vanguard", _prop(), _ctx(), spark, _cfg(), ledger)
    assert rec["outcome"] == E.VERIFIED
    assert rec["executed"] is True
    assert rec["provenance"] == "live"
    assert len(ledger) == 1 and ledger[0]["provenance"] == "live"


def test_live_dispatch_readback_disagrees_is_failed_still_live():
    spark = FakeSpark(observe_state="online")  # command ran but target not contained
    ledger = []
    rec = D.live_dispatch("vanguard", _prop(), _ctx(), spark, _cfg(), ledger)
    assert rec["outcome"] == E.FAILED
    assert rec["provenance"] == "live"


def test_live_dispatch_blocked_never_calls_spark():
    spark = FakeSpark()
    ledger = []
    rec = D.live_dispatch("vanguard", _prop(), _ctx(target_in_scope=False), spark, _cfg(), ledger)
    assert rec["outcome"] == E.BLOCKED
    assert spark.calls == []            # workspace never touched
    assert rec["provenance"] == "live"  # provenance stamped even on a refused row


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

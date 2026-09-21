"""
Live workspace client -- the real dispatch target (Phase 7).

Phase 6 proved the production binding (`workspace_dispatch`) against a *simulated*
workspace. This module supplies the real one: a `WorkspaceClient` whose `apply`
invokes the Unity Catalog `execute_response_action` function and whose `observe`
reads the target's state back from the response-state table. Feed it to
`workspace_dispatch.dispatch(..., provenance="live")` (see `live_dispatch`) and the
same fail-closed chokepoint now drives the actual workspace.

This is deployment code. It runs inside a Databricks notebook with a live
`SparkSession` and a populated Unity Catalog; it CANNOT run in the offline test
harness, and running it is the one step that has not been performed. It is written
and reviewable, but until it is executed against the real workspace and its
read-back observed, no agent is `VERIFIED_IN_DEPLOYMENT` -- the promotion gate in
`deployment_promotion` enforces exactly that, because only rows this client writes
carry `provenance="live"`.

`spark` is injected (duck-typed), so this module imports no pyspark and stays
import-safe offline. Identifiers come from operator-supplied config and are
validated against a strict character whitelist before being backtick-quoted; the
action_type/target *values* are passed as bound parameters (`spark.sql(sql,
args=...)`), never string-concatenated, so a crafted target cannot inject SQL.
"""

import re

import workspace_dispatch as W

# Rows this client writes are the only ones allowed to promote to deployment.
LIVE = "live"

# One SQL identifier part: a letter/underscore start, then letters/digits/underscore.
_IDENT_PART = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_ident(name):
    """Backtick-quote a dotted identifier after validating every part.

    Only names built from operator config pass through here (function, table and
    column names), never user input, and the character whitelist rejects anything
    that is not a plain identifier -- so no keyword blocklist is needed and
    legitimate names like `execute_response_action` or `updated_at` are allowed.
    """
    parts = [p for p in str(name).split(".") if p != ""]
    if not parts:
        raise ValueError(f"empty SQL identifier: {name!r}")
    for part in parts:
        if not _IDENT_PART.match(part):
            raise ValueError(f"invalid SQL identifier part: {part!r}")
    return ".".join(f"`{p}`" for p in parts)


class LiveWorkspaceConfig:
    """Names of the Unity Catalog objects the live client talks to.

    function:     UC function that performs the response action, signature
                  (action_type STRING, target STRING).
    state_table:  table holding the observed state per target/action.
    state_column / target_column / action_column / recorded_column: columns of
                  state_table used to read the latest observed state back.
    """

    def __init__(self, catalog, schema,
                 function="execute_response_action",
                 state_table="response_action_state",
                 state_column="observed_state",
                 target_column="target",
                 action_column="action_type",
                 recorded_column="updated_at"):
        self.catalog = catalog
        self.schema = schema
        self.function = function
        self.state_table = state_table
        self.state_column = state_column
        self.target_column = target_column
        self.action_column = action_column
        self.recorded_column = recorded_column

    def _qualified(self, name):
        return _quote_ident(f"{self.catalog}.{self.schema}.{name}")

    def function_ref(self):
        return self._qualified(self.function)

    def state_table_ref(self):
        return self._qualified(self.state_table)


class DatabricksWorkspaceClient:
    """Real WorkspaceClient backed by Unity Catalog. apply/observe are separate."""

    def __init__(self, spark, config):
        if spark is None or not hasattr(spark, "sql"):
            raise ValueError("DatabricksWorkspaceClient requires a live SparkSession")
        self.spark = spark
        self.cfg = config

    def apply(self, action_type, target):
        """Invoke the Unity Catalog response function for one action.

        The function name is a validated identifier; action_type and target are
        bound parameters, so no value reaches the SQL text unescaped.
        """
        sql = f"SELECT {self.cfg.function_ref()}(:action_type, :target) AS result"
        # .collect() forces the function to actually execute.
        self.spark.sql(sql, args={"action_type": action_type, "target": target}).collect()

    def observe(self, action_type, target):
        """Read the workspace's own view of the target's state back.

        Returns the latest observed-state string, or None if the workspace has no
        state for this target -- which the chokepoint treats as not-verified.
        """
        state_col = _quote_ident(self.cfg.state_column)
        target_col = _quote_ident(self.cfg.target_column)
        action_col = _quote_ident(self.cfg.action_column)
        recorded_col = _quote_ident(self.cfg.recorded_column)
        sql = (
            f"SELECT {state_col} AS observed FROM {self.cfg.state_table_ref()} "
            f"WHERE {target_col} = :target AND {action_col} = :action_type "
            f"ORDER BY {recorded_col} DESC LIMIT 1"
        )
        rows = self.spark.sql(sql, args={"action_type": action_type, "target": target}).collect()
        if not rows:
            return None
        value = rows[0]["observed"]
        return None if value is None else str(value)


def live_dispatch(agent_key, proposal, context, spark, config, ledger):
    """Dispatch one governed action against the live workspace.

    Identical to `workspace_dispatch.dispatch` but wires the real
    `DatabricksWorkspaceClient` and stamps the recorded row `provenance="live"`,
    so and only so it can ever promote an agent to `VERIFIED_IN_DEPLOYMENT`.
    """
    client = DatabricksWorkspaceClient(spark, config)
    return W.dispatch(agent_key, proposal, context, client, ledger, provenance=LIVE)

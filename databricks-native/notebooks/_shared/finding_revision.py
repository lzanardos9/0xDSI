# Databricks notebook source
# MAGIC %md
# MAGIC # Finding Revision State Machine
# MAGIC
# MAGIC A finding (an alert / correlation result the platform asserts) has a
# MAGIC lifecycle. Before this module the lifecycle was implicit: a single mutable
# MAGIC `status` string edited in place, so history was destroyed on every change
# MAGIC and illegal jumps (e.g. reviving a withdrawn finding) were unchecked
# MAGIC (REV2-08).
# MAGIC
# MAGIC This module makes the lifecycle explicit and **append-only**:
# MAGIC
# MAGIC * A finding has a stable `finding_id` and an ordered chain of immutable
# MAGIC   revisions (`revision` = 1, 2, 3, ...). You never edit a revision; you
# MAGIC   append a new one describing the new state.
# MAGIC * Transitions are validated against a fixed table. Terminal states
# MAGIC   (WITHDRAWN / EXPIRED / SUPERSEDED) accept no further transitions.
# MAGIC * Every revision carries the execution-identity fields (REV2-05) so two
# MAGIC   distinct runs that touch the same finding never collapse into one.
# MAGIC
# MAGIC Pure and stdlib-only (plus the shared `contracts` vocabulary), so notebooks
# MAGIC import it on a cluster and the offline property tests exercise the exact
# MAGIC shipped logic without Spark. The durable ledger table is `finding_revisions`.

# COMMAND ----------

from contracts import EXECUTION_IDENTITY_FIELDS, SCHEMA_VERSION

# COMMAND ----------

# Lifecycle states.
PROVISIONAL = "PROVISIONAL"
CONFIRMED = "CONFIRMED"
WITHDRAWN = "WITHDRAWN"
EXPIRED = "EXPIRED"
SUPERSEDED = "SUPERSEDED"

STATES = (PROVISIONAL, CONFIRMED, WITHDRAWN, EXPIRED, SUPERSEDED)

# A finding always begins as an unconfirmed assertion.
INITIAL_STATE = PROVISIONAL

# States that end the chain: no revision may follow one of these.
TERMINAL_STATES = frozenset({WITHDRAWN, EXPIRED, SUPERSEDED})

# Named actions and where they lead. A finding is either still live
# (PROVISIONAL/CONFIRMED) or terminal. Confirmation can only happen once
# (PROVISIONAL -> CONFIRMED); re-confirming a CONFIRMED finding is not a state
# change and is rejected so the chain never contains meaningless revisions.
CONFIRM = "confirm"
WITHDRAW = "withdraw"
EXPIRE = "expire"
SUPERSEDE = "supersede"

ALLOWED_TRANSITIONS = {
    PROVISIONAL: {
        CONFIRM: CONFIRMED,
        WITHDRAW: WITHDRAWN,
        EXPIRE: EXPIRED,
        SUPERSEDE: SUPERSEDED,
    },
    CONFIRMED: {
        WITHDRAW: WITHDRAWN,
        EXPIRE: EXPIRED,
        SUPERSEDE: SUPERSEDED,
    },
    WITHDRAWN: {},
    EXPIRED: {},
    SUPERSEDED: {},
}


def is_valid_state(state) -> bool:
    return state in STATES


def is_terminal(state) -> bool:
    return state in TERMINAL_STATES


def allowed_actions(state):
    """The actions legal from ``state`` (empty for terminal / unknown states)."""
    return tuple(ALLOWED_TRANSITIONS.get(state, {}).keys())


def can_transition(current_state, action) -> bool:
    return action in ALLOWED_TRANSITIONS.get(current_state, {})


def next_state(current_state, action) -> str:
    """Resolve the state reached by applying ``action`` to ``current_state``.

    Raises ValueError for an unknown state or an illegal transition (including
    any transition out of a terminal state), so an invalid lifecycle jump fails
    loudly instead of silently corrupting the chain."""
    if not is_valid_state(current_state):
        raise ValueError(f"unknown state: {current_state!r}")
    table = ALLOWED_TRANSITIONS[current_state]
    if action not in table:
        raise ValueError(
            f"illegal transition: {action!r} from {current_state!r} "
            f"(allowed: {tuple(table.keys()) or 'none — terminal'})"
        )
    return table[action]


def _require_identity(identity):
    """Validate the producer-supplied identity carries the three fields only the
    producer can know. `schema_version` and `produced_at` are stamped by this
    module, so they are not required from the caller."""
    if not isinstance(identity, dict):
        raise ValueError("identity must be a dict")
    required = ("execution_id", "run_id", "producer")
    missing = [k for k in required if not identity.get(k)]
    if missing:
        raise ValueError(f"identity missing required fields: {missing}")


def _stamp(row, identity, produced_at):
    for field in ("execution_id", "run_id", "producer"):
        row[field] = identity[field]
    row["schema_version"] = SCHEMA_VERSION
    row["produced_at"] = produced_at
    # Guard against drift between this stamping and the shared vocabulary.
    assert all(f in row for f in EXECUTION_IDENTITY_FIELDS)
    return row


def initial_revision(finding_id, identity, produced_at, **attributes) -> dict:
    """Build revision 1 of a finding: the initial PROVISIONAL assertion.

    ``attributes`` carries finding-specific payload (fingerprint, source, score,
    supporting event ids, ...) and is passed through onto the revision row."""
    _require_identity(identity)
    row = dict(attributes)
    row.update({
        "finding_id": str(finding_id),
        "revision": 1,
        "prev_revision": None,
        "state": INITIAL_STATE,
        "action": None,
        "supersedes_finding_id": None,
    })
    return _stamp(row, identity, produced_at)


def next_revision(prev_row, action, identity, produced_at,
                  supersedes_finding_id=None, **attributes) -> dict:
    """Build the next immutable revision by applying ``action`` to ``prev_row``.

    ``prev_row`` is the most recent revision (a dict as produced here). The new
    row keeps the same ``finding_id``, increments ``revision``, records which
    revision it follows, and is validated against the transition table — a jump
    out of a terminal state raises. For a SUPERSEDE, ``supersedes_finding_id``
    names the finding that replaces this one."""
    _require_identity(identity)
    prev_state = prev_row.get("state")
    resolved = next_state(prev_state, action)

    if action == SUPERSEDE and not supersedes_finding_id:
        raise ValueError("supersede requires supersedes_finding_id")

    row = dict(attributes)
    row.update({
        "finding_id": str(prev_row["finding_id"]),
        "revision": int(prev_row["revision"]) + 1,
        "prev_revision": int(prev_row["revision"]),
        "state": resolved,
        "action": action,
        "supersedes_finding_id": supersedes_finding_id,
    })
    return _stamp(row, identity, produced_at)


# Column order for the durable `finding_revisions` ledger. Kept beside the
# builders so the DDL and the emitted rows cannot drift apart.
REVISION_COLUMNS = (
    "finding_id",
    "revision",
    "prev_revision",
    "state",
    "action",
    "supersedes_finding_id",
    "execution_id",
    "run_id",
    "producer",
    "schema_version",
    "produced_at",
)

"""
Production dispatch binding (Phase 6).

Phase 5 proved the enforcement chokepoint (`enforcement.guard_and_dispatch`)
fails closed: the injected `execute` callback is unreachable on any path the
kernel or the approval lifecycle rejects. But in the harness that `execute` both
performed the side effect and reported the result -- it observed its own success.
That is fine to prove fail-closed routing, but it is not how a real workspace
works, and it is not enough to ever claim an action was `VERIFIED_IN_DEPLOYMENT`.

This module is the deployment-shaped binding. It builds the `execute` callback
out of a `WorkspaceClient` with two *separate* responsibilities:

    execute() = client.apply(action_type, target)      # issue the command
                then return client.observe(action_type, target)   # read it back

The state fed to verification is the independent read-back, never the command's
own claim of success. So a command that returns without error but did not
actually take effect (a firewall that silently dropped the rule, an isolation
that a race re-enabled) is observed as still-wrong and recorded FAILED, not a
false success. That independent-observation property is the whole point of the
deployment binding.

`WorkspaceClient` is a duck-typed protocol -- any object with `apply` and
`observe`. In deployment it wraps the Unity Catalog `execute_response_action`
function plus a status read-back query; in tests and the dry-run harness it is an
in-memory fake. This module therefore imports no Spark and no live SDK: the same
binding runs offline, exactly like the rest of `_shared`.

The ledger sink is likewise injected. `make_ledger_writer(sink)` adapts any
`append(record)`-style writer (a list in tests, a Delta/Supabase writer in
deployment) into the `record` callback the chokepoint calls exactly once per
attempt.

Nothing here re-decides anything: `dispatch` composes the injected client and
ledger with `enforcement.guard_and_dispatch`, so the enforced behaviour is
exactly what the kernel, lifecycle and enforcement tests already pin.
"""

import enforcement as E


class WorkspaceBindingError(Exception):
    """Raised when the binding is handed a client missing apply/observe."""


def make_execute(client, action_type, target):
    """Build the `execute` callback for one action against a workspace client.

    The callback issues the command via `client.apply(...)` and then returns the
    *independently observed* state via `client.observe(...)`. The command's own
    return value is deliberately ignored: only the read-back is trusted, so a
    command that "succeeds" without taking effect is caught at verification.
    """
    if not (hasattr(client, "apply") and callable(client.apply)):
        raise WorkspaceBindingError("workspace client must have a callable apply(action_type, target)")
    if not (hasattr(client, "observe") and callable(client.observe)):
        raise WorkspaceBindingError("workspace client must have a callable observe(action_type, target)")

    def _execute():
        client.apply(action_type, target)
        return client.observe(action_type, target)

    return _execute


def make_ledger_writer(sink, provenance="simulated"):
    """Adapt an `append(record)`-style ledger writer into the `record` callback.

    `sink` may be a plain list (tests) or any object exposing `append`. The
    returned callback stamps each audit dict with its `provenance` -- 'simulated'
    for a dry-run against a fake workspace, 'live' only when the command was run
    against the real workspace -- then appends it. Provenance is what lets the
    promotion gate refuse to call a simulated success `VERIFIED_IN_DEPLOYMENT`.
    """
    if isinstance(sink, list):
        appender = sink.append
    elif hasattr(sink, "append") and callable(sink.append):
        appender = sink.append
    else:
        raise WorkspaceBindingError("ledger sink must be a list or expose a callable append(record)")

    def _record(rec):
        rec["provenance"] = provenance
        appender(rec)

    return _record


def dispatch(agent_key, proposal, context, client, ledger, provenance="simulated"):
    """Run one governed action through the chokepoint bound to a real workspace.

    client: a WorkspaceClient (apply/observe). In deployment this wraps the
            Unity Catalog `execute_response_action` and a status read-back.
    ledger: an append-only sink for the audit record (list or `.append`-able).
    provenance: 'simulated' for a dry-run, 'live' only against the real
            workspace. Stamped onto the recorded row for the promotion gate.

    Returns the audit record. `rec["executed"]` is true only when the workspace
    was actually commanded, and `rec["outcome"]` is `VERIFIED` only when the
    independent read-back matched the intended effect.
    """
    action_type = (proposal.get("action_type") or "").strip().lower()
    target = proposal.get("target")
    execute = make_execute(client, action_type, target)
    record = make_ledger_writer(ledger, provenance=provenance)
    return E.guard_and_dispatch(agent_key, proposal, context, execute, record)

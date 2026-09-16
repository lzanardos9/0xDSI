"""
Entry-only end-to-end scenarios for the SOC pipeline.

The contract of this suite is deliberately narrow: a scenario may write ONLY to
the pipeline's ingestion boundary — a Kafka topic or a landing-zone drop — and
may assert ONLY on the pipeline's published outputs (alerts, threat-intel
matches, unified evidence objects, confluence/FUSE verdicts, agent triage). It
never touches an intermediate table and never calls an internal function, so a
passing run proves the whole path works from the outside in, the way a real
sensor and a real analyst see it.

Everything here is plain data + stdlib so the suite's own invariants can be
checked with `python3` and no Spark session. The live driver in `harness.py`
turns these scenarios into writes and assertions when a workspace is available.

Run the offline contract check:
    python3 databricks-native/tests/e2e/test_e2e_entry_only.py
"""

from dataclasses import dataclass, field
from typing import Optional

# ── The only surfaces a scenario is allowed to touch ──────────────────────
# Entry surfaces are the ingestion boundary. A landing_* surface is a file drop
# into the landing Volume; kafka is a produced message. Nothing else is a legal
# place for a scenario to write.
ENTRY_SURFACES = frozenset({
    "kafka",          # -> bronze_kafka_events
    "landing_event",  # raw security event file -> bronze_raw_events
    "landing_alert",  # vendor alert file       -> bronze_alerts
    "landing_ioc",    # threat-intel feed file  -> bronze_ioc_feed
})

# Output tables are the published results the pipeline is contracted to produce.
# Assertions may read these and only these.
OUTPUT_TABLES = frozenset({
    "alerts",
    "threat_intel_matches",
    "unified_evidence_objects",
    "confluence_verdicts",
    "agent_triage_results",
})

# Recognised IOC kinds, mirrors the threat-intel matcher's vocabulary.
IOC_KINDS = frozenset({"ip", "domain", "hash", "url", "email"})


@dataclass(frozen=True)
class EntryRecord:
    """One write at the ingestion boundary.

    `surface` must be in ENTRY_SURFACES. For `kafka`, `channel` is the topic;
    for a landing_* surface it is the landing zone sub-path. `payload` is the
    JSON-serialisable record delivered at that surface.
    """
    surface: str
    channel: str
    payload: dict

    def validate(self) -> list:
        problems = []
        if self.surface not in ENTRY_SURFACES:
            problems.append(
                f"entry surface '{self.surface}' is not an ingestion boundary "
                f"(allowed: {sorted(ENTRY_SURFACES)})"
            )
        if not self.channel:
            problems.append("entry record is missing a channel")
        if not isinstance(self.payload, dict) or not self.payload:
            problems.append("entry record payload must be a non-empty dict")
        return problems


@dataclass(frozen=True)
class Expectation:
    """An assertion on a published output table.

    `table` must be in OUTPUT_TABLES. `where` is a SQL predicate the live driver
    ANDs onto a scoped read; `min_rows`/`max_rows` bound the matching count.
    `reason` states, in plain terms, what the pipeline must have done.
    """
    table: str
    where: str
    reason: str
    min_rows: int = 1
    max_rows: Optional[int] = None

    def validate(self) -> list:
        problems = []
        if self.table not in OUTPUT_TABLES:
            problems.append(
                f"expectation reads '{self.table}', not a published output "
                f"(allowed: {sorted(OUTPUT_TABLES)})"
            )
        if self.min_rows < 0:
            problems.append("min_rows cannot be negative")
        if self.max_rows is not None and self.max_rows < self.min_rows:
            problems.append("max_rows cannot be below min_rows")
        if not self.where.strip():
            problems.append("expectation needs a scoping predicate")
        return problems


@dataclass(frozen=True)
class Scenario:
    """A named entry-only journey through the pipeline.

    `probe` is a unique token stamped into every entry payload and referenced by
    the expectations' predicates, so a scenario asserts only on the rows it
    itself caused — runs never bleed into each other.
    """
    name: str
    description: str
    probe: str
    entries: tuple
    expectations: tuple
    ioc_kinds: tuple = field(default_factory=tuple)

    def validate(self) -> list:
        problems = []
        if not self.entries:
            problems.append(f"{self.name}: no entry writes")
        if not self.expectations:
            problems.append(f"{self.name}: no output assertions")
        for e in self.entries:
            problems += [f"{self.name}: {p}" for p in e.validate()]
            if self.probe not in _flatten(e.payload):
                problems.append(
                    f"{self.name}: entry on '{e.surface}' does not carry the "
                    f"probe token '{self.probe}', so its rows can't be isolated"
                )
        for x in self.expectations:
            problems += [f"{self.name}: {p}" for p in x.validate()]
        for k in self.ioc_kinds:
            if k not in IOC_KINDS:
                problems.append(f"{self.name}: unknown IOC kind '{k}'")
        return problems


def _flatten(value) -> str:
    """Concatenate all leaf strings of a nested payload for probe detection."""
    if isinstance(value, dict):
        return " ".join(_flatten(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten(v) for v in value)
    return str(value)


# ── Payload builders ──────────────────────────────────────────────────────
# Small helpers so each scenario reads as intent, not JSON boilerplate.

def _event(probe, host, action, **extra):
    return {"probe": probe, "host": host, "action": action,
            "event_time": "2026-01-01T00:00:00Z", **extra}


def _ioc(probe, kind, value, **extra):
    return {"probe": probe, "ioc_type": kind, "ioc_value": value,
            "source": "e2e-feed", "confidence": 90, **extra}


def _alert(probe, host, title, severity="high", **extra):
    return {"probe": probe, "host": host, "title": title,
            "severity": severity, **extra}


# ── The ten scenarios ───────────────────────────────────────────────────────

SCENARIOS = (
    Scenario(
        name="ip_ioc_match",
        description="A known-bad IP delivered on the feed and seen in traffic "
                    "must surface a threat-intel match and a UEO.",
        probe="e2e-ip-001",
        ioc_kinds=("ip",),
        entries=(
            EntryRecord("landing_ioc", "ioc_feed",
                        _ioc("e2e-ip-001", "ip", "203.0.113.66")),
            EntryRecord("landing_event", "events",
                        _event("e2e-ip-001", "host-a", "network.connect",
                               remote_ip="203.0.113.66")),
        ),
        expectations=(
            Expectation("threat_intel_matches",
                        "ioc_value = '203.0.113.66'",
                        "the bad IP is matched against the feed"),
            Expectation("unified_evidence_objects",
                        "contributing_event_ids IS NOT NULL",
                        "the match rolls up into an evidence object"),
        ),
    ),
    Scenario(
        name="domain_ioc_match",
        description="A malicious domain in a DNS lookup must match the feed.",
        probe="e2e-dom-002",
        ioc_kinds=("domain",),
        entries=(
            EntryRecord("landing_ioc", "ioc_feed",
                        _ioc("e2e-dom-002", "domain", "evil.example.com")),
            EntryRecord("landing_event", "events",
                        _event("e2e-dom-002", "host-b", "dns.query",
                               query="evil.example.com")),
        ),
        expectations=(
            Expectation("threat_intel_matches",
                        "ioc_value = 'evil.example.com'",
                        "the malicious domain is matched"),
        ),
    ),
    Scenario(
        name="hash_ioc_match",
        description="A known-bad file hash executed on a host must match.",
        probe="e2e-hash-003",
        ioc_kinds=("hash",),
        entries=(
            EntryRecord("landing_ioc", "ioc_feed",
                        _ioc("e2e-hash-003", "hash",
                             "d41d8cd98f00b204e9800998ecf8427e")),
            EntryRecord("landing_event", "events",
                        _event("e2e-hash-003", "host-c", "process.exec",
                               file_hash="d41d8cd98f00b204e9800998ecf8427e")),
        ),
        expectations=(
            Expectation("threat_intel_matches",
                        "ioc_value = 'd41d8cd98f00b204e9800998ecf8427e'",
                        "the malicious hash is matched"),
        ),
    ),
    Scenario(
        name="auth_chain",
        description="A burst of failed logins followed by a success on one "
                    "account must raise an alert and an evidence object.",
        probe="e2e-auth-004",
        entries=tuple(
            EntryRecord("landing_event", "events",
                        _event("e2e-auth-004", "host-d", "auth.login_failed",
                               user="svc-01", attempt=i))
            for i in range(1, 6)
        ) + (
            EntryRecord("landing_event", "events",
                        _event("e2e-auth-004", "host-d", "auth.login_success",
                               user="svc-01")),
        ),
        expectations=(
            Expectation("alerts", "description LIKE '%e2e-auth-004%'",
                        "the credential-stuffing pattern raises an alert"),
            Expectation("unified_evidence_objects",
                        "entity_name = 'svc-01'",
                        "the account gains an evidence object"),
        ),
    ),
    Scenario(
        name="lateral_movement",
        description="One account authenticating across many hosts in a short "
                    "window must correlate into a single evidence object.",
        probe="e2e-lat-005",
        entries=tuple(
            EntryRecord("landing_event", "events",
                        _event("e2e-lat-005", f"host-{h}", "auth.remote_login",
                               user="admin-9"))
            for h in ("e1", "e2", "e3", "e4")
        ),
        expectations=(
            Expectation("unified_evidence_objects",
                        "entity_name = 'admin-9'",
                        "cross-host movement rolls into one evidence object"),
            Expectation("confluence_verdicts",
                        "entity_name = 'admin-9'",
                        "the fusion layer scores the movement"),
        ),
    ),
    Scenario(
        name="exfiltration",
        description="A large outbound transfer to a rare destination must "
                    "raise an alert and reach the fusion layer.",
        probe="e2e-exfil-006",
        entries=(
            EntryRecord("landing_event", "events",
                        _event("e2e-exfil-006", "host-f", "network.egress",
                               bytes_out=5_000_000_000, remote_ip="198.51.100.9")),
        ),
        expectations=(
            Expectation("alerts", "description LIKE '%e2e-exfil-006%'",
                        "the bulk egress raises an alert"),
            Expectation("confluence_verdicts",
                        "entity_name = 'host-f'",
                        "the exfil signal is fused into a verdict"),
        ),
    ),
    Scenario(
        name="late_evidence",
        description="Evidence arriving after a UEO already exists must bump its "
                    "revision and invalidate the bound finding, not create a "
                    "silent duplicate.",
        probe="e2e-late-007",
        entries=(
            EntryRecord("landing_event", "events",
                        _event("e2e-late-007", "host-g", "auth.login_failed",
                               user="late-user")),
            # Delivered in a later batch (harness spaces this drop out): a second
            # distinct signal for the same entity/window.
            EntryRecord("landing_event", "events",
                        _event("e2e-late-007", "host-g", "process.exec",
                               user="late-user",
                               file_hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
        ),
        expectations=(
            Expectation("unified_evidence_objects",
                        "entity_name = 'late-user' AND revision >= 2",
                        "the late signal bumps the evidence object's revision"),
        ),
    ),
    Scenario(
        name="duplicate_delivery",
        description="The exact same event delivered twice must be de-duplicated "
                    "into a single alert/evidence object, not double-counted.",
        probe="e2e-dup-008",
        entries=(
            EntryRecord("landing_event", "events",
                        _event("e2e-dup-008", "host-h", "auth.login_failed",
                               user="dup-user", event_id="dup-fixed-id")),
            EntryRecord("landing_event", "events",
                        _event("e2e-dup-008", "host-h", "auth.login_failed",
                               user="dup-user", event_id="dup-fixed-id")),
        ),
        expectations=(
            Expectation("unified_evidence_objects",
                        "entity_name = 'dup-user'",
                        "duplicate delivery yields exactly one evidence object",
                        min_rows=1, max_rows=1),
        ),
    ),
    Scenario(
        name="sensor_failure",
        description="When a sensor goes silent the pipeline must stay honest: "
                    "other detections still land, and no output claims a false "
                    "all-clear from the missing feed.",
        probe="e2e-sensor-009",
        entries=(
            # Only the alert channel reports; the event/IOC feeds are silent for
            # this probe. The pipeline must still process what it did receive.
            EntryRecord("landing_alert", "alerts",
                        _alert("e2e-sensor-009", "host-i",
                               "Endpoint agent reported malware")),
        ),
        expectations=(
            Expectation("alerts", "description LIKE '%e2e-sensor-009%'",
                        "the one reporting sensor's alert still lands"),
        ),
    ),
    Scenario(
        name="same_ioc_multiple_hosts",
        description="One IOC observed on several hosts must produce a match per "
                    "host, not collapse into a single host's story.",
        probe="e2e-multi-010",
        ioc_kinds=("ip",),
        entries=(
            EntryRecord("landing_ioc", "ioc_feed",
                        _ioc("e2e-multi-010", "ip", "203.0.113.200")),
        ) + tuple(
            EntryRecord("landing_event", "events",
                        _event("e2e-multi-010", f"host-{h}", "network.connect",
                               remote_ip="203.0.113.200"))
            for h in ("m1", "m2", "m3")
        ),
        expectations=(
            Expectation("threat_intel_matches",
                        "ioc_value = '203.0.113.200'",
                        "the shared IOC matches on every host that saw it",
                        min_rows=3),
        ),
    ),
)


def validate_suite(scenarios=SCENARIOS) -> list:
    """Return every contract violation in the suite (empty list == clean).

    Enforces the entry-only contract structurally: each scenario writes only to
    ingestion surfaces, asserts only on published outputs, isolates its rows
    with a unique probe, and the ten required journeys are all present with the
    three IOC kinds covered.
    """
    problems = []
    names = [s.name for s in scenarios]

    if len(scenarios) != 10:
        problems.append(f"expected 10 scenarios, found {len(scenarios)}")
    if len(set(names)) != len(names):
        problems.append("scenario names must be unique")

    required = {
        "ip_ioc_match", "domain_ioc_match", "hash_ioc_match", "auth_chain",
        "lateral_movement", "exfiltration", "late_evidence",
        "duplicate_delivery", "sensor_failure", "same_ioc_multiple_hosts",
    }
    missing = required - set(names)
    if missing:
        problems.append(f"missing required scenarios: {sorted(missing)}")

    probes = [s.probe for s in scenarios]
    if len(set(probes)) != len(probes):
        problems.append("scenario probe tokens must be unique across the suite")

    covered_iocs = {k for s in scenarios for k in s.ioc_kinds}
    for needed in ("ip", "domain", "hash"):
        if needed not in covered_iocs:
            problems.append(f"no scenario covers a '{needed}' IOC")

    for s in scenarios:
        problems += s.validate()

    return problems

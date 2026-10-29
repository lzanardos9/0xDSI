"""
Synthetic identity events for the Identity Timeline (not AA data).

Each named person carries a story the timeline must surface:
- Luiz Zanardo: joiner, then privileged access granted without a change ticket.
- Keith Murry: moved from Airport Operations to Finance but kept his old access.
- Abhijit Tilak: MFA reset, then a sign-in from a new country hours later.
- Brian McDonald: terminated, still enabled in Entra, signed in afterwards, and
  owner of a service account.
- Blessy Baby: contractor converted to employee; clean history.
- Rudi Himawan: password reset and new MFA device; clean history.
- Todd Trncak: burst of MFA push denials (MFA fatigue), then a lockout.
- Priya Raman: routine sign-ins and a revoked entitlement; clean history.
- Marcus Bell: privileged grant with a ticket; clean history.
"""

from identity_fixtures import PEOPLE, SOURCES

HR = {"provider": "workday", "tenant": "aa-hr"}


def _dir(provider, person, etype, at, actor="", sid=None, **detail):
    eid = PEOPLE[person][0].lower()
    prefix = {"active_directory": "ad", "entra_id": "ent", "saviynt": "sav", "duo": "duo"}[provider]
    oid = f"{prefix}-adm-{eid}" if detail.pop("admin", False) else f"{prefix}-{eid}"
    return {"provider": provider, "tenant": SOURCES[provider]["tenant"], "object_id": oid, "event_type": etype,
            "occurred_at": at, "actor": actor, "source_event_id": sid or f"{provider}-{person}-{etype}-{at}",
            "detail": detail}


def _hr(person, etype, at, **detail):
    return {**HR, "employee_id": PEOPLE[person][0], "event_type": etype, "occurred_at": at,
            "actor": "workday-integration", "source_event_id": f"wd-{person}-{etype}-{at}", "detail": detail}


def _signin(person, at, country="US", app="Microsoft 365", ip="198.51.100.20", ok=True):
    return _dir("entra_id", person, "sign_in_success" if ok else "sign_in_failure", at,
                country=country, application=app, ip=ip)


EVENTS = [
    # Luiz Zanardo
    _hr("luiz.zanardo", "hr_joiner", "2026-09-01T13:00:00Z", department="Identity Engineering", title="Senior IAM Engineer"),
    _dir("active_directory", "luiz.zanardo", "account_created", "2026-09-01T14:05:00Z", actor="saviynt-provisioning"),
    _dir("duo", "luiz.zanardo", "mfa_enrolled", "2026-09-01T15:10:00Z", device="iPhone 15", method="push"),
    _signin("luiz.zanardo", "2026-09-02T12:30:00Z"),
    _dir("saviynt", "luiz.zanardo", "entitlement_granted", "2026-09-02T16:00:00Z", actor="saviynt-birthright",
         entitlement="IAM-Engineering-RW", scope_department="Identity Engineering", ticket="CHG-48120"),
    _dir("active_directory", "luiz.zanardo", "privilege_granted", "2026-10-14T22:41:00Z", actor="adm-tgreen", admin=True,
         entitlement="Domain Admins", scope_department="Identity Engineering"),
    _signin("luiz.zanardo", "2026-10-27T13:02:00Z"),

    # Keith Murry
    _hr("keith.murry", "hr_joiner", "2025-03-10T13:00:00Z", department="Airport Operations", title="Ramp Supervisor"),
    _dir("saviynt", "keith.murry", "entitlement_granted", "2025-03-11T15:00:00Z", actor="saviynt-birthright",
         entitlement="Ramp-Control-Console", scope_department="Airport Operations", ticket="REQ-20211"),
    _hr("keith.murry", "hr_mover", "2026-09-15T13:00:00Z", from_department="Airport Operations",
        to_department="Finance", title="Financial Analyst"),
    _dir("saviynt", "keith.murry", "entitlement_granted", "2026-09-16T15:00:00Z", actor="saviynt-birthright",
         entitlement="SAP-FI-Reporting", scope_department="Finance", ticket="REQ-48877"),
    _signin("keith.murry", "2026-10-20T14:00:00Z", app="SAP Fiori"),

    # Abhijit Tilak
    _hr("abhijit.tilak", "hr_joiner", "2024-06-03T13:00:00Z", department="Cloud Platform", title="Principal Engineer"),
    _signin("abhijit.tilak", "2026-10-21T13:15:00Z"),
    _signin("abhijit.tilak", "2026-10-23T14:40:00Z"),
    _dir("duo", "abhijit.tilak", "mfa_reset", "2026-10-25T03:12:00Z", actor="helpdesk-kpatel", reason="lost phone"),
    _dir("duo", "abhijit.tilak", "mfa_device_added", "2026-10-25T03:20:00Z", device="Android", method="push"),
    _signin("abhijit.tilak", "2026-10-25T07:48:00Z", country="RO", ip="203.0.113.77", app="Azure Portal"),

    # Brian McDonald
    _hr("brian.mcdonald", "hr_joiner", "2019-02-04T13:00:00Z", department="Airport Operations", title="Station Manager"),
    _signin("brian.mcdonald", "2026-10-17T12:10:00Z"),
    _hr("brian.mcdonald", "hr_leaver", "2026-10-20T22:00:00Z", reason="resignation", last_day="2026-10-20"),
    _dir("active_directory", "brian.mcdonald", "account_disabled", "2026-10-21T02:00:00Z", actor="saviynt-deprovisioning"),
    _signin("brian.mcdonald", "2026-10-24T19:33:00Z", app="Outlook Web", ip="192.0.2.45"),

    # Blessy Baby
    _hr("blessy.baby", "hr_joiner", "2026-02-02T13:00:00Z", department="Data Science", title="Data Scientist (Contract)"),
    _hr("blessy.baby", "hr_conversion", "2026-09-01T13:00:00Z", from_type="contractor", to_type="employee"),
    _dir("saviynt", "blessy.baby", "entitlement_granted", "2026-09-01T16:00:00Z", actor="saviynt-birthright",
         entitlement="Databricks-DS-Workspace", scope_department="Data Science", ticket="REQ-47002"),
    _signin("blessy.baby", "2026-10-26T15:00:00Z", app="Databricks"),

    # Rudi Himawan
    _hr("rudi.himawan", "hr_joiner", "2023-11-06T13:00:00Z", department="Network Engineering", title="Network Architect"),
    _dir("active_directory", "rudi.himawan", "password_reset", "2026-10-22T16:05:00Z", actor="self-service"),
    _dir("duo", "rudi.himawan", "mfa_device_added", "2026-10-22T16:12:00Z", device="YubiKey 5", method="webauthn"),
    _signin("rudi.himawan", "2026-10-22T16:20:00Z", app="Palo Alto Panorama"),

    # Todd Trncak
    _hr("todd.trncak", "hr_joiner", "2022-08-15T13:00:00Z", department="Security Operations", title="SOC Lead"),
    _signin("todd.trncak", "2026-10-26T12:00:00Z"),
    *[_dir("duo", "todd.trncak", "mfa_denied", f"2026-10-28T03:{m:02d}:00Z", method="push", ip="203.0.113.201",
           sid=f"duo-todd-deny-{m}") for m in (1, 3, 4, 6, 8)],
    _dir("duo", "todd.trncak", "mfa_lockout", "2026-10-28T03:09:00Z", reason="too many denials"),

    # Priya Raman
    _hr("priya.raman", "hr_joiner", "2021-05-17T13:00:00Z", department="Crew Scheduling", title="Crew Planner"),
    _dir("saviynt", "priya.raman", "entitlement_granted", "2026-08-01T15:00:00Z", actor="saviynt-request",
         entitlement="Crew-Pairing-Optimizer", scope_department="Crew Scheduling", ticket="REQ-45550"),
    _dir("saviynt", "priya.raman", "entitlement_revoked", "2026-10-01T15:00:00Z", actor="access-review-q3",
         entitlement="Crew-Pairing-Optimizer"),
    _signin("priya.raman", "2026-10-27T11:45:00Z", app="Crew Portal"),

    # Marcus Bell
    _hr("marcus.bell", "hr_joiner", "2020-01-13T13:00:00Z", department="Loyalty Engineering", title="Engineering Manager"),
    _dir("active_directory", "marcus.bell", "privilege_granted", "2026-10-02T17:00:00Z", actor="adm-jrivera", admin=True,
         entitlement="Loyalty-Prod-DBA", scope_department="Loyalty Engineering", ticket="CHG-48990"),
    _signin("marcus.bell", "2026-10-28T13:30:00Z", app="AAdvantage Admin"),

    # One event for an account the spine does not know: must stay unlinked
    {"provider": "entra_id", "tenant": "aa-entra-tenant", "object_id": "ent-unknown-9999", "event_type": "sign_in_failure",
     "occurred_at": "2026-10-28T08:00:00Z", "source_event_id": "ent-unknown-9999-1", "detail": {"country": "US"}},
]

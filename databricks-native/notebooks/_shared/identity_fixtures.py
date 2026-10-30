"""
Synthetic identity fixtures for the Identity Datalake (not AA data).

Each scenario exercises a Phase 0 exit-gate behavior: renamed user, rehire
with a reused employee id, duplicate names, privileged persona, cross-tenant
guest, disabled-vs-active state conflict, orphaned workload, discovered agent,
unmapped provider state and an incomplete snapshot.
"""

SNAPSHOT_AT = "2026-10-29T06:00:00Z"

SOURCES = {
    "active_directory": {"tenant": "corp.aa.example", "snapshot_complete": True},
    "entra_id": {"tenant": "aa-entra-tenant", "snapshot_complete": True},
    "ping_directory": {"tenant": "ping-prod", "snapshot_complete": True},
    "saviynt": {"tenant": "saviynt-prod", "snapshot_complete": True},
    "duo": {"tenant": "duo-prod", "snapshot_complete": False},
    "app_local": {"tenant": "crew-portal", "snapshot_complete": True},
}


def _acc(provider, object_id, **kw):
    rec = {"provider": provider, "tenant": kw.pop("tenant", SOURCES[provider]["tenant"]),
           "object_id": object_id, "last_seen": SNAPSHOT_AT}
    rec.update(kw)
    return rec


ACCOUNTS = [
    # Jordan Rivera: standard + privileged persona, linked by HR and employee id
    _acc("active_directory", "ad-0001", username="jrivera", upn="jordan.rivera@aa.example", email="jordan.rivera@aa.example",
         employee_id="E1001", display_name="Jordan Rivera", department="Flight Operations", manager="Pat Gomez", raw_state="enabled"),
    _acc("active_directory", "ad-0002", username="adm-jrivera", upn="adm-jrivera@aa.example", employee_id="E1001",
         display_name="Jordan Rivera (Admin)", persona_type="privileged", department="Flight Operations", raw_state="enabled"),
    _acc("entra_id", "ent-0001", username="jordan.rivera", upn="jordan.rivera@aa.example", email="jordan.rivera@aa.example",
         employee_id="E1001", display_name="Jordan Rivera", department="Flight Operations", raw_state="true"),
    _acc("saviynt", "sav-0001", username="jrivera", authoritative_person_id="W-1001", employee_id="E1001",
         display_name="Jordan Rivera", raw_state="active"),
    _acc("duo", "duo-0001", username="jrivera", email="jordan.rivera@aa.example", display_name="Jordan Rivera",
         department="Flight Operations", raw_state="active"),
    # Cross-tenant guest with the same name: must stay separate until reviewed
    _acc("entra_id", "ent-guest-01", tenant="aa-partner-tenant", username="jordan.rivera_partner#EXT#",
         email="jordan.rivera@partner.example", display_name="Jordan Rivera", persona_type="guest", raw_state="true"),

    # Renamed user: Sam Taylor became Sam Brooks; employee id keeps the link
    _acc("active_directory", "ad-0101", username="sbrooks", upn="sam.brooks@aa.example", email="sam.brooks@aa.example",
         employee_id="E1101", display_name="Sam Brooks", department="Revenue Management", raw_state="enabled"),
    _acc("entra_id", "ent-0101", username="sam.taylor", upn="sam.taylor@aa.example", email="sam.taylor@aa.example",
         employee_id="E1101", display_name="Sam Taylor", department="Revenue Management", raw_state="true"),

    # Two different people named Alex Chen, plus an ambiguous app-local Alex Chen
    _acc("active_directory", "ad-0201", username="achen", upn="alex.chen@aa.example", email="alex.chen@aa.example",
         employee_id="E2001", display_name="Alex Chen", department="Maintenance", raw_state="enabled"),
    _acc("active_directory", "ad-0202", username="achen2", upn="alex.chen2@aa.example", email="alex.chen2@aa.example",
         employee_id="E2002", display_name="Alex Chen", department="Airport Customer Service", raw_state="enabled"),
    _acc("app_local", "crew-0201", username="alex.chen", email="alex.chen@crew.aa.example", display_name="Alex Chen",
         department="Maintenance", raw_state="active"),

    # Rehire: employee id E3001 reused by a different HR worker
    _acc("active_directory", "ad-0301", username="mlee", upn="morgan.lee@aa.example", employee_id="E3001",
         authoritative_person_id="W-3001", display_name="Morgan Lee", raw_state="disabled", deleted=True),
    _acc("saviynt", "sav-0302", username="mpatel", authoritative_person_id="W-3099", employee_id="E3001",
         display_name="Morgan Patel", raw_state="active"),

    # Disabled in AD but still active in an app-local directory
    _acc("active_directory", "ad-0401", username="cmorgan", upn="casey.morgan@aa.example", employee_id="E4001",
         display_name="Casey Morgan", department="Cargo", raw_state="disabled"),
    _acc("app_local", "crew-0401", username="cmorgan", employee_id="E4001", display_name="Casey Morgan",
         department="Cargo", raw_state="active"),

    # Contractor persona
    _acc("active_directory", "ad-0501", username="rquinn-c", upn="riley.quinn.c@aa.example", employee_id="C5001",
         display_name="Riley Quinn", persona_type="contractor", raw_state="enabled"),
    _acc("saviynt", "sav-0501", username="rquinn-c", authoritative_person_id="CW-5001", employee_id="C5001",
         display_name="Riley Quinn", persona_type="contractor", raw_state="active"),

    # Locked MFA account and an unmapped Ping state
    _acc("duo", "duo-0601", username="tnguyen", email="taylor.nguyen@aa.example", display_name="Taylor Nguyen",
         raw_state="locked out"),
    _acc("ping_directory", "ping-0601", username="tnguyen", email="taylor.nguyen@aa.example", employee_id="E6001",
         display_name="Taylor Nguyen", raw_state="pending_review"),

    # Non-human identities
    _acc("entra_id", "sp-crew-sched", principal_type="workload", username="svc-crew-scheduler",
         display_name="Crew Scheduler Service", owner="team-crew-ops", grc_application_id="APP-0042",
         credential_fingerprint="sha256:9f2c...a71e", credential_expires_at="2027-03-01T00:00:00Z", raw_state="true"),
    _acc("active_directory", "ad-svc-ftp", principal_type="workload", username="svc-legacy-ftp",
         display_name="Legacy FTP Transfer", credential_fingerprint="sha256:41bd...0c9e",
         credential_expires_at="2026-08-15T00:00:00Z", raw_state="enabled"),
    _acc("ping_directory", "ping-api-fares", principal_type="workload", username="api-fare-sync",
         display_name="Fare Sync API Client", owner="team-revenue-eng", raw_state="active"),
    _acc("entra_id", "sp-agent-bag", principal_type="agent", username="agent-baggage-triage",
         display_name="Baggage Triage Agent", runtime_host="aks-ops-east-07", registration_source="discovered",
         raw_state="true"),
    _acc("entra_id", "sp-agent-pricing", principal_type="agent", username="agent-fare-pricing-copilot",
         display_name="Fare Pricing Copilot", runtime_host="gpu-ds-west-02", registration_source="discovered",
         credential_fingerprint="sha256:c0p1...7e44", credential_expires_at="2027-06-30T00:00:00Z", raw_state="true"),
]


def _person(eid, worker, first, last, dept, *, duo=True, admin=False, ent_state="true", ad_state="enabled",
            persona="standard", manager=None):
    user = f"{first[0]}{last}".lower()
    email = f"{first}.{last}@aa.example".lower()
    name = f"{first} {last}"
    rows = [
        _acc("active_directory", f"ad-{eid.lower()}", username=user, upn=email, email=email, employee_id=eid,
             display_name=name, department=dept, manager=manager, persona_type=persona, raw_state=ad_state),
        _acc("entra_id", f"ent-{eid.lower()}", username=f"{first}.{last}".lower(), upn=email, email=email,
             employee_id=eid, display_name=name, department=dept, persona_type=persona, raw_state=ent_state),
        _acc("saviynt", f"sav-{eid.lower()}", username=user, authoritative_person_id=worker, employee_id=eid,
             display_name=name, persona_type=persona, raw_state="active" if ad_state == "enabled" else "inactive"),
    ]
    if duo:
        rows.append(_acc("duo", f"duo-{eid.lower()}", username=user, email=email, employee_id=eid,
                         display_name=name, raw_state="active"))
    if admin:
        rows.append(_acc("active_directory", f"ad-adm-{eid.lower()}", username=f"adm-{user}", upn=f"adm-{user}@aa.example",
                         employee_id=eid, display_name=f"{name} (Admin)", persona_type="privileged", department=dept,
                         raw_state="enabled"))
    return rows


# Named sample people used by the Identity Timeline (synthetic, not real AA records)
PEOPLE = {
    "luiz.zanardo": ("E7001", "W-7001", "Luiz", "Zanardo", "Identity Engineering", {"admin": True}),
    "keith.murry": ("E7002", "W-7002", "Keith", "Murry", "Finance", {}),
    "abhijit.tilak": ("E7003", "W-7003", "Abhijit", "Tilak", "Cloud Platform", {"admin": True}),
    "brian.mcdonald": ("E7004", "W-7004", "Brian", "McDonald", "Airport Operations", {"ad_state": "disabled"}),
    "blessy.baby": ("E7005", "W-7005", "Blessy", "Baby", "Data Science", {}),
    "rudi.himawan": ("E7006", "W-7006", "Rudi", "Himawan", "Network Engineering", {}),
    "todd.trncak": ("E7007", "W-7007", "Todd", "Trncak", "Security Operations", {"admin": True}),
    "priya.raman": ("E7008", "W-7008", "Priya", "Raman", "Crew Scheduling", {}),
    "marcus.bell": ("E7009", "W-7009", "Marcus", "Bell", "Loyalty Engineering", {"admin": True}),
}

for _eid, _worker, _first, _last, _dept, _opts in PEOPLE.values():
    ACCOUNTS.extend(_person(_eid, _worker, _first, _last, _dept, **_opts))

ACCOUNTS.append(_acc("active_directory", "ad-svc-bagrec", principal_type="workload", username="svc-bag-reconcile",
                     display_name="Baggage Reconciliation Service", owner="brian.mcdonald@aa.example",
                     grc_application_id="APP-0117", credential_fingerprint="sha256:c03a...19f2",
                     credential_expires_at="2027-01-31T00:00:00Z", raw_state="enabled"))


def _guest(object_id, first, last, domain, sponsor, last_seen=SNAPSHOT_AT):
    email = f"{first}.{last}@{domain}".lower()
    return _acc("entra_id", object_id, username=f"{email.replace('@', '_')}#EXT#", email=email,
                display_name=f"{first} {last}", persona_type="guest", owner=sponsor, raw_state="true", last_seen=last_seen)


# Partner guests in our Entra tenant, used by Federation Posture (owner = sponsor)
ACCOUNTS.extend([
    _guest("ent-guest-ba-01", "Sarah", "Okafor", "ba.example", "keith.murry@aa.example"),
    _guest("ent-guest-dl-01", "Tom", "Ellis", "deloitte.example", "brian.mcdonald@aa.example"),
    _guest("ent-guest-sky-01", "Nina", "Park", "skyserve.example", "", last_seen="2026-03-15T09:00:00Z"),
    _guest("ent-guest-envoy-01", "Carlos", "Mendes", "envoy.example", "abhijit.tilak@aa.example"),
])

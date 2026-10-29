"""
Synthetic access data for the Phase 2 demo: crown-jewel systems, groups with
nesting, grants and a password-reset delegation, built around the sample people
in identity_fixtures. Each story is meant to surface one Phase 2 signal.

  Rudi Himawan    everyday account in NOC-OnCall, nested into Tier0 > Domain Admins
  Abhijit Tilak   standing cloud-owner rights on his everyday Entra account
  Keith Murry     can both approve payments and create vendors in SAP
  Blessy Baby     Helpdesk can reset Marcus Bell's admin account, which owns the loyalty DB
  Brian McDonald  departed owner of Airport-Ramp-Ops, disabled account still a member
  svc-legacy-ftp  orphaned workload with read access to SAP Finance
"""

from identity_fixtures import SOURCES


def _r(provider, object_id, tenant=None):
    return {"provider": provider, "tenant": tenant or SOURCES[provider]["tenant"], "object_id": object_id}


AD, ENTRA, SAV = "active_directory", "entra_id", "saviynt"

RESOURCES = [
    {"resource_id": "res-dc", "name": "Domain Controllers", "crown_jewel": True, "tier": "tier0",
     "owner": "luiz.zanardo@aa.example", "description": "Active Directory domain controllers for corp.aa.example"},
    {"resource_id": "res-azure-prod", "name": "Azure Production Subscriptions", "crown_jewel": True, "tier": "tier0",
     "owner": "abhijit.tilak@aa.example", "description": "Production cloud subscriptions"},
    {"resource_id": "res-sap-fi", "name": "SAP Finance (Payments)", "crown_jewel": True, "tier": "tier1",
     "owner": "team-finance-controls", "description": "Accounts payable, vendor master and payment runs"},
    {"resource_id": "res-flight-ops", "name": "Flight Operations Control", "crown_jewel": True, "tier": "tier1",
     "owner": "team-ops-control", "description": "Dispatch, turn management and operational control"},
    {"resource_id": "res-loyalty-db", "name": "AAdvantage Loyalty Database", "crown_jewel": True, "tier": "tier1",
     "owner": "marcus.bell@aa.example", "description": "Member profiles and mileage balances"},
    {"resource_id": "res-ramp", "name": "Ramp Control Console", "crown_jewel": False, "tier": "tier2",
     "owner": "team-airport-ops", "description": "Gate and ramp coordination"},
    {"resource_id": "res-crew", "name": "Crew Pairing Optimizer", "crown_jewel": False, "tier": "tier2",
     "owner": "team-crew-ops", "description": "Crew pairing and roster optimisation"},
    {"resource_id": "res-ds", "name": "Data Science Workspace", "crown_jewel": False, "tier": "tier2",
     "owner": "team-data-science", "description": "Analytics notebooks and models"},
]

GROUPS = [
    {**_r(AD, "grp-domain-admins"), "name": "Domain Admins", "privileged": True, "owner": "luiz.zanardo@aa.example",
     "purpose": "Tier-0 directory administration", "department": "Identity Engineering",
     "members": [_r(AD, "ad-adm-e7001"), _r(AD, "grp-tier0-ops")]},
    {**_r(AD, "grp-tier0-ops"), "name": "Tier0-Operations", "privileged": True, "owner": "abhijit.tilak@aa.example",
     "purpose": "Break-glass operations on tier-0 systems", "department": "Cloud Platform",
     "members": [_r(AD, "ad-adm-e7003"), _r(AD, "grp-noc-oncall")]},
    {**_r(AD, "grp-noc-oncall"), "name": "NOC-OnCall", "privileged": False, "owner": "rudi.himawan@aa.example",
     "purpose": "Network on-call rota", "department": "Network Engineering",
     "members": [_r(AD, "ad-e7006")]},
    {**_r(AD, "grp-helpdesk-t1"), "name": "Helpdesk-Tier1", "privileged": False, "owner": "",
     "purpose": "Service desk password resets", "department": "Service Desk",
     "members": [_r(AD, "ad-e7005")]},
    {**_r(AD, "grp-loyalty-dba"), "name": "Loyalty-DB-Admins", "privileged": True, "owner": "marcus.bell@aa.example",
     "purpose": "Loyalty database administration", "department": "Loyalty Engineering",
     "members": [_r(AD, "ad-adm-e7009")]},
    {**_r(AD, "grp-ramp-ops"), "name": "Airport-Ramp-Ops", "privileged": False, "owner": "brian.mcdonald@aa.example",
     "purpose": "Ramp and gate operations staff", "department": "Airport Operations",
     "members": [_r(AD, "ad-e7002"), _r(AD, "ad-e7004")]},
    {**_r(ENTRA, "grp-cloud-owners"), "name": "Cloud-Subscription-Owners", "privileged": True,
     "owner": "abhijit.tilak@aa.example", "purpose": "Owner role on production subscriptions", "department": "Cloud Platform",
     "members": [_r(ENTRA, "ent-e7003"), _r(ENTRA, "sp-crew-sched")]},
    {**_r(ENTRA, "grp-crew-planners"), "name": "Crew-Planners", "privileged": False, "owner": "priya.raman@aa.example",
     "purpose": "Crew planning tools", "department": "Crew Scheduling",
     "members": [_r(ENTRA, "ent-e7008")]},
    {**_r(ENTRA, "grp-ds-users"), "name": "DataScience-Users", "privileged": False, "owner": "team-data-science",
     "purpose": "Data science workspace access", "department": "Data Science",
     "members": [_r(ENTRA, "ent-e7005")]},
    {**_r(SAV, "role-fi-approver"), "name": "SAP-FI-Payments-Approver", "privileged": True,
     "owner": "team-finance-controls", "purpose": "Release payment runs", "department": "Finance",
     "members": [_r(SAV, "sav-e7002")]},
    {**_r(SAV, "role-fi-vendor"), "name": "SAP-FI-Vendor-Maintenance", "privileged": False,
     "owner": "team-finance-controls", "purpose": "Create and edit vendor master records", "department": "Finance",
     "members": [_r(SAV, "sav-e7002")]},
]


def _grant(src, rid, perm):
    return {"source": src, "edge_type": "grants", "target": rid, "permission": perm}


EDGES = [
    _grant(_r(AD, "grp-domain-admins"), "res-dc", "admin"),
    _grant(_r(AD, "grp-loyalty-dba"), "res-loyalty-db", "admin"),
    _grant(_r(AD, "grp-ramp-ops"), "res-ramp", "operate"),
    _grant(_r(AD, "grp-ramp-ops"), "res-flight-ops", "read"),
    _grant(_r(ENTRA, "grp-cloud-owners"), "res-azure-prod", "owner"),
    _grant(_r(ENTRA, "grp-crew-planners"), "res-crew", "write"),
    _grant(_r(ENTRA, "grp-ds-users"), "res-ds", "write"),
    _grant(_r(SAV, "role-fi-approver"), "res-sap-fi", "approve_payment"),
    _grant(_r(SAV, "role-fi-vendor"), "res-sap-fi", "create_vendor"),
    _grant(_r(AD, "ad-svc-ftp"), "res-sap-fi", "read"),
    _grant(_r(ENTRA, "sp-agent-bag"), "res-flight-ops", "write"),
    {"source": _r(AD, "grp-helpdesk-t1"), "edge_type": "can_take_over", "target": _r(AD, "ad-adm-e7009"),
     "permission": "reset_password"},
]

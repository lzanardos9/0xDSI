"""Sample what-if scenarios built on the sample access data (Rudi, Blessy, Keith, Brian, Marcus...)."""
from identity_access_fixtures import AD, ENTRA, SAV
from identity_fixtures import SOURCES


def _k(provider, object_id):
    return f"{provider}:{SOURCES[provider]['tenant']}:{object_id}"


SCENARIOS = [
    {"scenario_id": "wi-unnest-noc", "name": "Un-nest NOC-OnCall from Tier0-Operations",
     "description": "NOC on-call staff inherit break-glass tier-0 rights through nesting. What breaks if we cut the link?",
     "created_by": "luiz.zanardo@aa.example",
     "changes": [{"type": "remove_membership", "group": _k(AD, "grp-tier0-ops"), "member": _k(AD, "grp-noc-oncall")}]},
    {"scenario_id": "wi-helpdesk-takeover", "name": "Remove Helpdesk reset rights over admin accounts",
     "description": "Helpdesk-Tier1 can reset Marcus Bell's admin password, which reaches the Loyalty database.",
     "created_by": "luiz.zanardo@aa.example",
     "changes": [{"type": "remove_takeover", "source": _k(AD, "grp-helpdesk-t1"), "target": _k(AD, "ad-adm-e7009")}]},
    {"scenario_id": "wi-keith-sod", "name": "Split Keith Murry's SAP duties",
     "description": "Keith can both create vendors and approve payments. Remove him from vendor maintenance.",
     "created_by": "abhijit.tilak@aa.example",
     "changes": [{"type": "remove_membership", "group": _k(SAV, "role-fi-vendor"), "member": _k(SAV, "sav-e7002")}]},
    {"scenario_id": "wi-offboard-brian", "name": "Finish Brian McDonald's offboarding",
     "description": "Brian has left but his Entra account is live and his disabled AD account is still in Airport-Ramp-Ops.",
     "created_by": "luiz.zanardo@aa.example",
     "changes": [{"type": "disable_account", "account": _k(ENTRA, "ent-e7004")},
                 {"type": "remove_membership", "group": _k(AD, "grp-ramp-ops"), "member": _k(AD, "ad-e7004")}]},
    {"scenario_id": "wi-drop-domain-admins", "name": "Delete Domain Admins (lockout check)",
     "description": "Shows the lockout warning: nobody would be able to administer the domain controllers.",
     "created_by": "luiz.zanardo@aa.example",
     "changes": [{"type": "delete_group", "group": _k(AD, "grp-domain-admins")}]},
]

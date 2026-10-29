"""
Synthetic federation data for the Phase 3 demo: partner tenant trusts, IdP
federations and an AD forest trust, plus a short log of setting changes.
Each trust is meant to surface one posture signal.

  British Airways   clean B2B trust owned by Keith Murry (the baseline to compare against)
  Deloitte          open to all apps, trusts partner MFA, owner Brian McDonald has left
  Envoy Air         partner MFA trust was switched on last week (drift with who/when)
  Ping -> Entra     signing certificate expires in two weeks
  Partner SSO       SHA-1 signing, external MFA accepted, no owner (Jordan Rivera's tenant)
  Cargo forest      two-way AD trust with SID filtering just switched off
"""

AS_OF = "2026-10-29T06:00:00Z"

TRUSTS = [
    {"trust_id": "ct-ba", "kind": "cross_tenant", "provider": "entra_id", "tenant": "aa-entra-tenant",
     "partner_name": "British Airways (oneworld)", "partner_tenant": "ba-tenant", "partner_domains": ["ba.example"],
     "owner": "keith.murry@aa.example", "description": "Joint crew scheduling with oneworld partner",
     "settings": {"allowed_apps": "crew-portal", "trust_partner_mfa": False, "auto_redeem": False,
                  "last_reviewed_at": "2026-06-01T00:00:00Z"}},
    {"trust_id": "ct-deloitte", "kind": "cross_tenant", "provider": "entra_id", "tenant": "aa-entra-tenant",
     "partner_name": "Deloitte (external audit)", "partner_tenant": "deloitte-tenant",
     "partner_domains": ["deloitte.example"], "owner": "brian.mcdonald@aa.example",
     "description": "Year-end audit fieldwork",
     "settings": {"allowed_apps": "all", "trust_partner_mfa": True, "auto_redeem": True,
                  "last_reviewed_at": "2025-02-10T00:00:00Z"}},
    {"trust_id": "ct-envoy", "kind": "cross_tenant", "provider": "entra_id", "tenant": "aa-entra-tenant",
     "partner_name": "Envoy Air (regional)", "partner_tenant": "envoy-tenant", "partner_domains": ["envoy.example"],
     "owner": "abhijit.tilak@aa.example", "description": "Regional carrier operations and cloud tooling",
     "settings": {"allowed_apps": "flight-ops", "trust_partner_mfa": True, "auto_redeem": False,
                  "last_reviewed_at": "2026-09-01T00:00:00Z"}},
    {"trust_id": "fed-ping-entra", "kind": "idp_federation", "provider": "ping_identity", "tenant": "ping-prod",
     "partner_name": "Ping to Entra ID", "partner_tenant": "aa-entra-tenant", "partner_domains": [],
     "owner": "luiz.zanardo@aa.example", "description": "Workforce SSO hand-off from PingFederate to Entra",
     "settings": {"signing_alg": "RS256", "signing_cert_expires_at": "2026-11-12T00:00:00Z",
                  "accept_external_mfa": False}},
    {"trust_id": "fed-partner-sso", "kind": "idp_federation", "provider": "entra_id", "tenant": "aa-entra-tenant",
     "partner_name": "Partner SSO (aa-partner-tenant)", "partner_tenant": "aa-partner-tenant",
     "partner_domains": ["partner.example"], "owner": "", "description": "Legacy SAML federation for a services partner",
     "settings": {"signing_alg": "RSA-SHA1", "signing_cert_expires_at": "2027-08-01T00:00:00Z",
                  "accept_external_mfa": True}},
    {"trust_id": "ad-cargo-forest", "kind": "ad_trust", "provider": "active_directory", "tenant": "corp.aa.example",
     "partner_name": "cargo.aa.example forest", "partner_tenant": "cargo.aa.example", "partner_domains": [],
     "owner": "rudi.himawan@aa.example", "description": "Legacy cargo forest kept for the freight booking system",
     "settings": {"direction": "bidirectional", "sid_filtering": False, "selective_auth": False}},
]

CHANGES = [
    {"trust_id": "ct-envoy", "setting": "trust_partner_mfa", "before": False, "after": True,
     "changed_at": "2026-10-24T14:12:00Z", "changed_by": "abhijit.tilak@aa.example"},
    {"trust_id": "ad-cargo-forest", "setting": "sid_filtering", "before": True, "after": False,
     "changed_at": "2026-10-27T02:41:00Z", "changed_by": "rudi.himawan@aa.example"},
    {"trust_id": "ct-ba", "setting": "allowed_apps", "before": "all", "after": "crew-portal",
     "changed_at": "2026-06-01T10:00:00Z", "changed_by": "keith.murry@aa.example"},
]

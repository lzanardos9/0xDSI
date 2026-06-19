use crate::define_connector;

define_connector!(Okta, "Okta", "okta", "iam", "System Log API / Event Hook");
define_connector!(CyberArk, "CyberArk Privileged Access", "cyberark", "iam", "REST API / Syslog / SIEM Integration");
define_connector!(PingIdentity, "Ping Identity", "ping_identity", "iam", "REST API / Audit Log Export");
define_connector!(OneLogin, "OneLogin", "onelogin", "iam", "Events API / Webhook");
define_connector!(SailPoint, "SailPoint IdentityNow", "sailpoint", "iam", "REST API / Event Trigger");

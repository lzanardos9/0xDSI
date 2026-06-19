use crate::define_connector;

define_connector!(ServiceNowGrc, "ServiceNow GRC", "servicenow_grc", "grc", "REST API / MID Server / Syslog");
define_connector!(RsaArcher, "RSA Archer", "rsa_archer", "grc", "REST API / Data Feed");
define_connector!(Drata, "Drata", "drata", "grc", "REST API / Webhook");
define_connector!(Vanta, "Vanta", "vanta", "grc", "REST API / Agent");

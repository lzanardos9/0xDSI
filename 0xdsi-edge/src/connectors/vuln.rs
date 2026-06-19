use crate::define_connector;

define_connector!(QualysVmdr, "Qualys VMDR", "qualys_vmdr", "vuln", "REST API v2 / Qualys Agent");
define_connector!(TenableVm, "Tenable Vulnerability Management", "tenable_vm", "vuln", "REST API / Syslog CEF");
define_connector!(Rapid7InsightVm, "Rapid7 InsightVM", "rapid7_insightvm", "vuln", "REST API / Syslog");
define_connector!(Snyk, "Snyk", "snyk", "vuln", "REST API / Webhook");
define_connector!(Wiz, "Wiz", "wiz", "vuln", "REST API / Webhook / S3 Export");

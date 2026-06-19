use crate::define_connector;

define_connector!(SlackAudit, "Slack Enterprise Audit", "slack_audit", "collaboration", "Audit Logs API / Event API");
define_connector!(Ms365Audit, "Microsoft 365 Audit Log", "ms_365_audit", "collaboration", "Management Activity API / Streaming");
define_connector!(GoogleWorkspace, "Google Workspace Audit", "google_workspace", "collaboration", "Reports API / Alert Center API");

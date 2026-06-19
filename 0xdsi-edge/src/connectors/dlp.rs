use crate::define_connector;

define_connector!(SymantecDlp, "Symantec DLP", "symantec_dlp", "dlp", "Syslog / REST API / ICAP");
define_connector!(DigitalGuardian, "Digital Guardian", "digital_guardian", "dlp", "REST API / Syslog CEF");
define_connector!(MsPurviewDlp, "Microsoft Purview DLP", "ms_purview_dlp", "dlp", "Management Activity API / Graph API");
define_connector!(ForcepointDlp, "Forcepoint DLP", "forcepoint_dlp", "dlp", "Syslog / REST API");

use crate::define_connector;

define_connector!(ProofpointTap, "Proofpoint TAP", "proofpoint_tap", "email", "SIEM API / Syslog CEF");
define_connector!(Mimecast, "Mimecast", "mimecast", "email", "SIEM Integration API / Syslog");
define_connector!(MsDefenderOffice, "Microsoft Defender for Office 365", "ms_defender_office", "email", "Management Activity API / Streaming");
define_connector!(BarracudaEmail, "Barracuda Email Protection", "barracuda_email", "email", "Syslog / REST API");

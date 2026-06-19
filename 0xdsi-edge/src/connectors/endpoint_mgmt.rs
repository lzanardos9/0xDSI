use crate::define_connector;

define_connector!(MsIntune, "Microsoft Intune", "ms_intune", "endpoint_mgmt", "Graph API / Log Analytics");
define_connector!(JamfPro, "Jamf Pro", "jamf_pro", "endpoint_mgmt", "REST API / Webhook / Syslog");
define_connector!(Tanium, "Tanium", "tanium", "endpoint_mgmt", "REST API / Connect Module / Syslog");
define_connector!(FalconDiscover, "CrowdStrike Falcon Discover", "falcon_discover", "endpoint_mgmt", "REST API / FDR");

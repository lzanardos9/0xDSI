use crate::define_connector;

define_connector!(Netskope, "Netskope Intelligent SSE", "netskope", "casb", "REST API v2 Iterator / CEF Syslog / S3 Export");
define_connector!(ZscalerZia, "Zscaler Internet Access", "zscaler_zia", "casb", "Nanolog Streaming / REST API");
define_connector!(MsDefenderCloudApps, "Microsoft Defender for Cloud Apps", "ms_defender_cloud_apps", "casb", "REST API / SIEM Agent / Streaming");
define_connector!(CiscoCloudlock, "Cisco Cloudlock", "cisco_cloudlock", "casb", "REST API / Syslog");

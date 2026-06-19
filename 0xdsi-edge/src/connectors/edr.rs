use crate::define_connector;

define_connector!(CrowdStrikeFalcon, "CrowdStrike Falcon", "crowdstrike_falcon", "edr", "Streaming API / FDR (S3)");
define_connector!(SentinelOne, "SentinelOne Singularity", "sentinelone", "edr", "REST API / Syslog CEF");
define_connector!(CarbonBlack, "VMware Carbon Black", "carbon_black", "edr", "REST API / Syslog / Event Forwarder");
define_connector!(MsDefenderEndpoint, "Microsoft Defender for Endpoint", "ms_defender_endpoint", "edr", "Streaming API / Graph Security API");
define_connector!(Cybereason, "Cybereason", "cybereason", "edr", "REST API / Syslog");

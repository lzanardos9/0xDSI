pub mod traits;
pub mod siem;
pub mod cloud_aws;
pub mod cloud_azure;
pub mod cloud_gcp;
pub mod edr;
pub mod firewall;
pub mod iam;
pub mod email;
pub mod vuln;
pub mod threat_intel;
pub mod waf;
pub mod dlp;
pub mod container;
pub mod devsecops;
pub mod ndr;
pub mod casb;
pub mod soar;
pub mod observability;
pub mod ics_ot;
pub mod plc_protocols;
pub mod dns;
pub mod endpoint_mgmt;
pub mod grc;
pub mod collaboration;
pub mod database_sec;
pub mod zero_trust;
pub mod bytecode;
pub mod ai_document;
pub mod dpi;
pub mod network_tap;

use anyhow::Result;
use crossbeam_channel::Sender;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::config::ConnectorConfig;
use crate::ocsf::OcsfEvent;
use traits::Connector;

pub fn print_available() {
    println!("=== 0xDSI Edge Collector - Supported Connectors ===\n");
    println!("{:<25} {:<40} {:<20}", "TYPE", "NAME", "CATEGORY");
    println!("{}", "=".repeat(85));

    let connectors = registry();
    for (ctype, name, category) in connectors {
        println!("{:<25} {:<40} {:<20}", ctype, name, category);
    }
    println!("\nTotal: {} connector types", registry().len());
}

fn registry() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        // SIEM Platforms
        ("splunk_hec", "Splunk Enterprise (HEC)", "siem"),
        ("ibm_qradar", "IBM QRadar", "siem"),
        ("ms_sentinel", "Microsoft Sentinel", "siem"),
        ("elastic_security", "Elastic Security", "siem"),
        ("arcsight", "ArcSight ESM", "siem"),
        ("logrhythm", "LogRhythm SIEM", "siem"),
        // Cloud - AWS
        ("aws_cloudtrail", "AWS CloudTrail", "cloud_aws"),
        ("aws_guardduty", "Amazon GuardDuty", "cloud_aws"),
        ("aws_security_hub", "AWS Security Hub", "cloud_aws"),
        ("aws_vpc_flow", "AWS VPC Flow Logs", "cloud_aws"),
        ("aws_waf", "AWS WAF Logs", "cloud_aws"),
        // Cloud - Azure
        ("azure_monitor", "Azure Monitor", "cloud_azure"),
        ("azure_defender", "Microsoft Defender for Cloud", "cloud_azure"),
        ("azure_entra_id", "Azure AD / Entra ID", "cloud_azure"),
        ("azure_network_watcher", "Azure Network Watcher", "cloud_azure"),
        // Cloud - GCP
        ("gcp_logging", "Google Cloud Logging", "cloud_gcp"),
        ("gcp_scc", "Security Command Center", "cloud_gcp"),
        ("gcp_chronicle", "Google Chronicle", "cloud_gcp"),
        ("gcp_vpc_flow", "GCP VPC Flow Logs", "cloud_gcp"),
        // EDR
        ("crowdstrike_falcon", "CrowdStrike Falcon", "edr"),
        ("sentinelone", "SentinelOne Singularity", "edr"),
        ("carbon_black", "VMware Carbon Black", "edr"),
        ("ms_defender_endpoint", "Microsoft Defender for Endpoint", "edr"),
        ("cybereason", "Cybereason", "edr"),
        // Firewalls
        ("paloalto_ngfw", "Palo Alto Networks NGFW", "firewall"),
        ("fortinet_fortigate", "Fortinet FortiGate", "firewall"),
        ("checkpoint_quantum", "Check Point Quantum", "firewall"),
        ("cisco_firewall", "Cisco Secure Firewall", "firewall"),
        ("juniper_srx", "Juniper SRX Series", "firewall"),
        // IAM
        ("okta", "Okta", "iam"),
        ("cyberark", "CyberArk Privileged Access", "iam"),
        ("ping_identity", "Ping Identity", "iam"),
        ("onelogin", "OneLogin", "iam"),
        ("sailpoint", "SailPoint IdentityNow", "iam"),
        // Email Security
        ("proofpoint_tap", "Proofpoint TAP", "email"),
        ("mimecast", "Mimecast", "email"),
        ("ms_defender_office", "Microsoft Defender for Office 365", "email"),
        ("barracuda_email", "Barracuda Email Protection", "email"),
        // Vulnerability Management
        ("qualys_vmdr", "Qualys VMDR", "vuln"),
        ("tenable_vm", "Tenable Vulnerability Management", "vuln"),
        ("rapid7_insightvm", "Rapid7 InsightVM", "vuln"),
        ("snyk", "Snyk", "vuln"),
        ("wiz", "Wiz", "vuln"),
        // Threat Intelligence
        ("misp", "MISP", "threat_intel"),
        ("recorded_future", "Recorded Future", "threat_intel"),
        ("mandiant_ti", "Mandiant Threat Intelligence", "threat_intel"),
        ("alienvault_otx", "AlienVault OTX", "threat_intel"),
        ("virustotal", "VirusTotal Enterprise", "threat_intel"),
        // WAF
        ("cloudflare_waf", "Cloudflare WAF", "waf"),
        ("aws_waf_logs", "AWS WAF", "waf"),
        ("akamai_waf", "Akamai App & API Protector", "waf"),
        ("imperva_waf", "Imperva WAF", "waf"),
        // DLP
        ("symantec_dlp", "Symantec DLP", "dlp"),
        ("digital_guardian", "Digital Guardian", "dlp"),
        ("ms_purview_dlp", "Microsoft Purview DLP", "dlp"),
        ("forcepoint_dlp", "Forcepoint DLP", "dlp"),
        // Container / K8s
        ("aqua_security", "Aqua Security", "container"),
        ("prisma_cloud", "Prisma Cloud", "container"),
        ("sysdig_secure", "Sysdig Secure", "container"),
        ("falco", "Falco", "container"),
        // DevSecOps
        ("github_security", "GitHub Advanced Security", "devsecops"),
        ("gitlab_security", "GitLab Ultimate Security", "devsecops"),
        ("sonarqube", "SonarQube", "devsecops"),
        ("checkmarx", "Checkmarx One", "devsecops"),
        // NDR
        ("darktrace", "Darktrace", "ndr"),
        ("vectra_ai", "Vectra AI", "ndr"),
        ("extrahop", "ExtraHop Reveal(x)", "ndr"),
        ("corelight", "Corelight", "ndr"),
        // CASB
        ("netskope", "Netskope Intelligent SSE", "casb"),
        ("zscaler_zia", "Zscaler Internet Access", "casb"),
        ("ms_defender_cloud_apps", "Microsoft Defender for Cloud Apps", "casb"),
        ("cisco_cloudlock", "Cisco Cloudlock", "casb"),
        // SOAR
        ("cortex_xsoar", "Cortex XSOAR", "soar"),
        ("splunk_soar", "Splunk SOAR", "soar"),
        ("swimlane", "Swimlane Turbine", "soar"),
        ("tines", "Tines", "soar"),
        // Observability
        ("datadog", "Datadog Security Monitoring", "observability"),
        ("sumo_logic", "Sumo Logic", "observability"),
        ("new_relic", "New Relic", "observability"),
        ("grafana_loki", "Grafana Loki", "observability"),
        // ICS / OT
        ("claroty", "Claroty", "ics_ot"),
        ("dragos", "Dragos Platform", "ics_ot"),
        ("nozomi", "Nozomi Networks", "ics_ot"),
        ("tenable_ot", "Tenable OT Security", "ics_ot"),
        // PLC & OT Protocols
        ("siemens_s7", "Siemens S7comm / S7comm-Plus", "plc_ot"),
        ("modbus_tcp", "Modbus TCP/RTU", "plc_ot"),
        ("ethernet_ip_cip", "EtherNet/IP & CIP", "plc_ot"),
        ("opc_ua", "OPC UA", "plc_ot"),
        ("dnp3", "DNP3 (IEEE 1815)", "plc_ot"),
        ("iec_61850", "IEC 61850 / GOOSE / MMS", "plc_ot"),
        ("iec_104", "IEC 60870-5-104", "plc_ot"),
        ("profinet", "PROFINET / PROFIBUS", "plc_ot"),
        ("bacnet", "BACnet/IP", "plc_ot"),
        ("hart_ip", "HART-IP", "plc_ot"),
        ("fins_omron", "FINS (Omron)", "plc_ot"),
        ("melsec", "MELSEC (Mitsubishi)", "plc_ot"),
        ("cc_link", "CC-Link IE / CC-Link", "plc_ot"),
        ("ge_srtp", "GE SRTP / EGD", "plc_ot"),
        ("codesys_v3", "CODESYS V3 Protocol", "plc_ot"),
        ("ethercat", "EtherCAT", "plc_ot"),
        ("foundation_fieldbus", "Foundation Fieldbus / FF-HSE", "plc_ot"),
        ("yokogawa_vnet", "Yokogawa CENTUM VP / Vnet/IP", "plc_ot"),
        ("abb_ac800m", "ABB AC 800M / Freelance", "plc_ot"),
        ("honeywell_cda", "Honeywell Experion CDA", "plc_ot"),
        // DNS Security
        ("cisco_umbrella", "Cisco Umbrella", "dns"),
        ("infoblox", "Infoblox BloxOne", "dns"),
        ("dnsfilter", "DNSFilter", "dns"),
        ("cloudflare_gateway", "Cloudflare Gateway", "dns"),
        // Endpoint Management
        ("ms_intune", "Microsoft Intune", "endpoint_mgmt"),
        ("jamf_pro", "Jamf Pro", "endpoint_mgmt"),
        ("tanium", "Tanium", "endpoint_mgmt"),
        ("falcon_discover", "CrowdStrike Falcon Discover", "endpoint_mgmt"),
        // Compliance & GRC
        ("servicenow_grc", "ServiceNow GRC", "grc"),
        ("rsa_archer", "RSA Archer", "grc"),
        ("drata", "Drata", "grc"),
        ("vanta", "Vanta", "grc"),
        // Collaboration
        ("slack_audit", "Slack Enterprise Audit", "collaboration"),
        ("ms_365_audit", "Microsoft 365 Audit Log", "collaboration"),
        ("google_workspace", "Google Workspace Audit", "collaboration"),
        // Database Security
        ("ibm_guardium", "IBM Guardium", "database_sec"),
        ("imperva_data", "Imperva Data Security", "database_sec"),
        ("oracle_audit_vault", "Oracle Audit Vault", "database_sec"),
        // Zero Trust
        ("zscaler_zpa", "Zscaler Private Access", "zero_trust"),
        ("cloudflare_access", "Cloudflare Access", "zero_trust"),
        ("prisma_access", "Palo Alto Prisma Access", "zero_trust"),
        ("tailscale", "Tailscale", "zero_trust"),
        // Special: Bytecode Instrumentation
        ("bytecode_jvm", "JVM Bytecode Weaving (AspectJ)", "instrumentation"),
        ("bytecode_dotnet", "CLR Profiler API (.NET)", "instrumentation"),
        ("bytecode_python", "Python sys.settrace", "instrumentation"),
        ("bytecode_ebpf", "eBPF Kernel Probe", "instrumentation"),
        ("bytecode_nodejs", "Node.js Module Shimming", "instrumentation"),
        // Special: AI Document Analysis
        ("ai_doc_pdf", "AI Document Analyzer (PDF)", "ai_analysis"),
        ("ai_doc_contract", "Contract Risk Extractor", "ai_analysis"),
        ("ai_doc_compliance", "Compliance Document Scanner", "ai_analysis"),
        ("ai_doc_bia", "Business Impact Analysis (BIA)", "ai_analysis"),
        // Special: DPI
        ("dpi_engine", "Deep Packet Inspection Engine", "network"),
        // Special: Network Tap
        ("network_tap_span", "SPAN Port Mirror", "network"),
        ("network_tap_inline", "Inline Network TAP", "network"),
        // Generic protocols
        ("syslog_tcp", "Syslog (TCP/TLS)", "generic"),
        ("syslog_udp", "Syslog (UDP)", "generic"),
        ("cef_receiver", "CEF/LEEF Receiver", "generic"),
        ("http_webhook", "HTTP Webhook Receiver", "generic"),
        ("kafka_consumer", "Kafka Consumer", "generic"),
        ("s3_poller", "S3/Blob Poller", "generic"),
        ("file_tail", "File Tail (log files)", "generic"),
        ("snmp_trap", "SNMP Trap Receiver", "generic"),
        ("netflow_ipfix", "NetFlow/IPFIX Collector", "generic"),
        ("stix_taxii", "STIX/TAXII Client", "generic"),
        ("wasm_plugin", "WASM Custom Plugin", "plugin"),
    ]
}

pub async fn spawn_all(
    configs: &[ConnectorConfig],
    tx: Sender<OcsfEvent>,
) -> Result<Vec<JoinHandle<()>>> {
    let mut handles = Vec::new();

    for cfg in configs.iter().filter(|c| c.enabled) {
        let connector: Box<dyn Connector> = match cfg.connector_type.as_str() {
            // SIEM
            "splunk_hec" => Box::new(siem::SplunkHec::from_config(cfg)?),
            "ibm_qradar" => Box::new(siem::IbmQradar::from_config(cfg)?),
            "ms_sentinel" => Box::new(siem::MsSentinel::from_config(cfg)?),
            "elastic_security" => Box::new(siem::ElasticSecurity::from_config(cfg)?),
            "arcsight" => Box::new(siem::ArcSight::from_config(cfg)?),
            "logrhythm" => Box::new(siem::LogRhythm::from_config(cfg)?),
            // Cloud AWS
            "aws_cloudtrail" => Box::new(cloud_aws::AwsCloudTrail::from_config(cfg)?),
            "aws_guardduty" => Box::new(cloud_aws::AwsGuardDuty::from_config(cfg)?),
            "aws_security_hub" => Box::new(cloud_aws::AwsSecurityHub::from_config(cfg)?),
            "aws_vpc_flow" => Box::new(cloud_aws::AwsVpcFlow::from_config(cfg)?),
            "aws_waf" => Box::new(cloud_aws::AwsWaf::from_config(cfg)?),
            // Cloud Azure
            "azure_monitor" => Box::new(cloud_azure::AzureMonitor::from_config(cfg)?),
            "azure_defender" => Box::new(cloud_azure::AzureDefender::from_config(cfg)?),
            "azure_entra_id" => Box::new(cloud_azure::AzureEntraId::from_config(cfg)?),
            "azure_network_watcher" => Box::new(cloud_azure::AzureNetworkWatcher::from_config(cfg)?),
            // Cloud GCP
            "gcp_logging" => Box::new(cloud_gcp::GcpLogging::from_config(cfg)?),
            "gcp_scc" => Box::new(cloud_gcp::GcpScc::from_config(cfg)?),
            "gcp_chronicle" => Box::new(cloud_gcp::GcpChronicle::from_config(cfg)?),
            "gcp_vpc_flow" => Box::new(cloud_gcp::GcpVpcFlow::from_config(cfg)?),
            // EDR
            "crowdstrike_falcon" => Box::new(edr::CrowdStrikeFalcon::from_config(cfg)?),
            "sentinelone" => Box::new(edr::SentinelOne::from_config(cfg)?),
            "carbon_black" => Box::new(edr::CarbonBlack::from_config(cfg)?),
            "ms_defender_endpoint" => Box::new(edr::MsDefenderEndpoint::from_config(cfg)?),
            "cybereason" => Box::new(edr::Cybereason::from_config(cfg)?),
            // Firewalls
            "paloalto_ngfw" => Box::new(firewall::PaloAltoNgfw::from_config(cfg)?),
            "fortinet_fortigate" => Box::new(firewall::FortinetFortigate::from_config(cfg)?),
            "checkpoint_quantum" => Box::new(firewall::CheckPointQuantum::from_config(cfg)?),
            "cisco_firewall" => Box::new(firewall::CiscoFirewall::from_config(cfg)?),
            "juniper_srx" => Box::new(firewall::JuniperSrx::from_config(cfg)?),
            // IAM
            "okta" => Box::new(iam::Okta::from_config(cfg)?),
            "cyberark" => Box::new(iam::CyberArk::from_config(cfg)?),
            "ping_identity" => Box::new(iam::PingIdentity::from_config(cfg)?),
            "onelogin" => Box::new(iam::OneLogin::from_config(cfg)?),
            "sailpoint" => Box::new(iam::SailPoint::from_config(cfg)?),
            // Email
            "proofpoint_tap" => Box::new(email::ProofpointTap::from_config(cfg)?),
            "mimecast" => Box::new(email::Mimecast::from_config(cfg)?),
            "ms_defender_office" => Box::new(email::MsDefenderOffice::from_config(cfg)?),
            "barracuda_email" => Box::new(email::BarracudaEmail::from_config(cfg)?),
            // Vuln
            "qualys_vmdr" => Box::new(vuln::QualysVmdr::from_config(cfg)?),
            "tenable_vm" => Box::new(vuln::TenableVm::from_config(cfg)?),
            "rapid7_insightvm" => Box::new(vuln::Rapid7InsightVm::from_config(cfg)?),
            "snyk" => Box::new(vuln::Snyk::from_config(cfg)?),
            "wiz" => Box::new(vuln::Wiz::from_config(cfg)?),
            // Threat Intel
            "misp" => Box::new(threat_intel::Misp::from_config(cfg)?),
            "recorded_future" => Box::new(threat_intel::RecordedFuture::from_config(cfg)?),
            "mandiant_ti" => Box::new(threat_intel::MandiantTi::from_config(cfg)?),
            "alienvault_otx" => Box::new(threat_intel::AlienVaultOtx::from_config(cfg)?),
            "virustotal" => Box::new(threat_intel::VirusTotal::from_config(cfg)?),
            // WAF
            "cloudflare_waf" => Box::new(waf::CloudflareWaf::from_config(cfg)?),
            "aws_waf_logs" => Box::new(waf::AwsWafLogs::from_config(cfg)?),
            "akamai_waf" => Box::new(waf::AkamaiWaf::from_config(cfg)?),
            "imperva_waf" => Box::new(waf::ImpervaWaf::from_config(cfg)?),
            // DLP
            "symantec_dlp" => Box::new(dlp::SymantecDlp::from_config(cfg)?),
            "digital_guardian" => Box::new(dlp::DigitalGuardian::from_config(cfg)?),
            "ms_purview_dlp" => Box::new(dlp::MsPurviewDlp::from_config(cfg)?),
            "forcepoint_dlp" => Box::new(dlp::ForcepointDlp::from_config(cfg)?),
            // Container
            "aqua_security" => Box::new(container::AquaSecurity::from_config(cfg)?),
            "prisma_cloud" => Box::new(container::PrismaCloud::from_config(cfg)?),
            "sysdig_secure" => Box::new(container::SysdigSecure::from_config(cfg)?),
            "falco" => Box::new(container::Falco::from_config(cfg)?),
            // DevSecOps
            "github_security" => Box::new(devsecops::GithubSecurity::from_config(cfg)?),
            "gitlab_security" => Box::new(devsecops::GitlabSecurity::from_config(cfg)?),
            "sonarqube" => Box::new(devsecops::SonarQube::from_config(cfg)?),
            "checkmarx" => Box::new(devsecops::Checkmarx::from_config(cfg)?),
            // NDR
            "darktrace" => Box::new(ndr::Darktrace::from_config(cfg)?),
            "vectra_ai" => Box::new(ndr::VectraAi::from_config(cfg)?),
            "extrahop" => Box::new(ndr::ExtraHop::from_config(cfg)?),
            "corelight" => Box::new(ndr::Corelight::from_config(cfg)?),
            // CASB
            "netskope" => Box::new(casb::Netskope::from_config(cfg)?),
            "zscaler_zia" => Box::new(casb::ZscalerZia::from_config(cfg)?),
            "ms_defender_cloud_apps" => Box::new(casb::MsDefenderCloudApps::from_config(cfg)?),
            "cisco_cloudlock" => Box::new(casb::CiscoCloudlock::from_config(cfg)?),
            // SOAR
            "cortex_xsoar" => Box::new(soar::CortexXsoar::from_config(cfg)?),
            "splunk_soar" => Box::new(soar::SplunkSoar::from_config(cfg)?),
            "swimlane" => Box::new(soar::Swimlane::from_config(cfg)?),
            "tines" => Box::new(soar::Tines::from_config(cfg)?),
            // Observability
            "datadog" => Box::new(observability::Datadog::from_config(cfg)?),
            "sumo_logic" => Box::new(observability::SumoLogic::from_config(cfg)?),
            "new_relic" => Box::new(observability::NewRelic::from_config(cfg)?),
            "grafana_loki" => Box::new(observability::GrafanaLoki::from_config(cfg)?),
            // ICS/OT
            "claroty" => Box::new(ics_ot::Claroty::from_config(cfg)?),
            "dragos" => Box::new(ics_ot::Dragos::from_config(cfg)?),
            "nozomi" => Box::new(ics_ot::Nozomi::from_config(cfg)?),
            "tenable_ot" => Box::new(ics_ot::TenableOt::from_config(cfg)?),
            // PLC Protocols
            "siemens_s7" => Box::new(plc_protocols::SiemensS7::from_config(cfg)?),
            "modbus_tcp" => Box::new(plc_protocols::ModbusTcp::from_config(cfg)?),
            "ethernet_ip_cip" => Box::new(plc_protocols::EthernetIpCip::from_config(cfg)?),
            "opc_ua" => Box::new(plc_protocols::OpcUa::from_config(cfg)?),
            "dnp3" => Box::new(plc_protocols::Dnp3::from_config(cfg)?),
            "iec_61850" => Box::new(plc_protocols::Iec61850::from_config(cfg)?),
            "iec_104" => Box::new(plc_protocols::Iec104::from_config(cfg)?),
            "profinet" => Box::new(plc_protocols::Profinet::from_config(cfg)?),
            "bacnet" => Box::new(plc_protocols::Bacnet::from_config(cfg)?),
            "hart_ip" => Box::new(plc_protocols::HartIp::from_config(cfg)?),
            "fins_omron" => Box::new(plc_protocols::FinsOmron::from_config(cfg)?),
            "melsec" => Box::new(plc_protocols::Melsec::from_config(cfg)?),
            "cc_link" => Box::new(plc_protocols::CcLink::from_config(cfg)?),
            "ge_srtp" => Box::new(plc_protocols::GeSrtp::from_config(cfg)?),
            "codesys_v3" => Box::new(plc_protocols::CodesysV3::from_config(cfg)?),
            "ethercat" => Box::new(plc_protocols::EtherCat::from_config(cfg)?),
            "foundation_fieldbus" => Box::new(plc_protocols::FoundationFieldbus::from_config(cfg)?),
            "yokogawa_vnet" => Box::new(plc_protocols::YokogawaVnet::from_config(cfg)?),
            "abb_ac800m" => Box::new(plc_protocols::AbbAc800m::from_config(cfg)?),
            "honeywell_cda" => Box::new(plc_protocols::HoneywellCda::from_config(cfg)?),
            // DNS
            "cisco_umbrella" => Box::new(dns::CiscoUmbrella::from_config(cfg)?),
            "infoblox" => Box::new(dns::Infoblox::from_config(cfg)?),
            "dnsfilter" => Box::new(dns::DnsFilter::from_config(cfg)?),
            "cloudflare_gateway" => Box::new(dns::CloudflareGateway::from_config(cfg)?),
            // Endpoint Mgmt
            "ms_intune" => Box::new(endpoint_mgmt::MsIntune::from_config(cfg)?),
            "jamf_pro" => Box::new(endpoint_mgmt::JamfPro::from_config(cfg)?),
            "tanium" => Box::new(endpoint_mgmt::Tanium::from_config(cfg)?),
            "falcon_discover" => Box::new(endpoint_mgmt::FalconDiscover::from_config(cfg)?),
            // GRC
            "servicenow_grc" => Box::new(grc::ServiceNowGrc::from_config(cfg)?),
            "rsa_archer" => Box::new(grc::RsaArcher::from_config(cfg)?),
            "drata" => Box::new(grc::Drata::from_config(cfg)?),
            "vanta" => Box::new(grc::Vanta::from_config(cfg)?),
            // Collaboration
            "slack_audit" => Box::new(collaboration::SlackAudit::from_config(cfg)?),
            "ms_365_audit" => Box::new(collaboration::Ms365Audit::from_config(cfg)?),
            "google_workspace" => Box::new(collaboration::GoogleWorkspace::from_config(cfg)?),
            // Database Security
            "ibm_guardium" => Box::new(database_sec::IbmGuardium::from_config(cfg)?),
            "imperva_data" => Box::new(database_sec::ImpervaData::from_config(cfg)?),
            "oracle_audit_vault" => Box::new(database_sec::OracleAuditVault::from_config(cfg)?),
            // Zero Trust
            "zscaler_zpa" => Box::new(zero_trust::ZscalerZpa::from_config(cfg)?),
            "cloudflare_access" => Box::new(zero_trust::CloudflareAccess::from_config(cfg)?),
            "prisma_access" => Box::new(zero_trust::PrismaAccess::from_config(cfg)?),
            "tailscale" => Box::new(zero_trust::Tailscale::from_config(cfg)?),
            // Bytecode
            "bytecode_jvm" => Box::new(bytecode::BytecodeJvm::from_config(cfg)?),
            "bytecode_dotnet" => Box::new(bytecode::BytecodeDotnet::from_config(cfg)?),
            "bytecode_python" => Box::new(bytecode::BytecodePython::from_config(cfg)?),
            "bytecode_ebpf" => Box::new(bytecode::BytecodeEbpf::from_config(cfg)?),
            "bytecode_nodejs" => Box::new(bytecode::BytecodeNodejs::from_config(cfg)?),
            // AI Doc
            "ai_doc_pdf" => Box::new(ai_document::AiDocPdf::from_config(cfg)?),
            "ai_doc_contract" => Box::new(ai_document::AiDocContract::from_config(cfg)?),
            "ai_doc_compliance" => Box::new(ai_document::AiDocCompliance::from_config(cfg)?),
            "ai_doc_bia" => Box::new(ai_document::AiDocBia::from_config(cfg)?),
            // DPI
            "dpi_engine" => Box::new(dpi::DpiEngine::from_config(cfg)?),
            // Network TAP
            "network_tap_span" => Box::new(network_tap::SpanMirror::from_config(cfg)?),
            "network_tap_inline" => Box::new(network_tap::InlineTap::from_config(cfg)?),
            // Generic
            "syslog_tcp" => Box::new(siem::SyslogTcp::from_config(cfg)?),
            "syslog_udp" => Box::new(siem::SyslogUdp::from_config(cfg)?),
            "cef_receiver" => Box::new(siem::CefReceiver::from_config(cfg)?),
            "http_webhook" => Box::new(siem::HttpWebhook::from_config(cfg)?),
            "kafka_consumer" => Box::new(siem::KafkaConsumer::from_config(cfg)?),
            "s3_poller" => Box::new(cloud_aws::S3Poller::from_config(cfg)?),
            "file_tail" => Box::new(siem::FileTail::from_config(cfg)?),
            "snmp_trap" => Box::new(network_tap::SnmpTrap::from_config(cfg)?),
            "netflow_ipfix" => Box::new(network_tap::NetflowIpfix::from_config(cfg)?),
            "stix_taxii" => Box::new(threat_intel::StixTaxii::from_config(cfg)?),
            unknown => {
                warn!(connector = unknown, "Unknown connector type, skipping");
                continue;
            }
        };

        let tx_clone = tx.clone();
        let connector_id = cfg.id.clone();
        let handle = tokio::spawn(async move {
            info!(id = %connector_id, "Connector running");
            if let Err(e) = connector.run(tx_clone).await {
                warn!(id = %connector_id, error = %e, "Connector exited with error");
            }
        });
        handles.push(handle);
    }

    Ok(handles)
}

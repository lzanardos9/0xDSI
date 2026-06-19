use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use tracing::{info, error};
use tracing_subscriber::{fmt, EnvFilter};
use oxdsi_core::{EdgeConfig, Pipeline};

#[derive(Parser, Debug)]
#[command(
    name = "0xdsi-edge",
    version,
    about = "0xDSI Edge Collector - Universal Security Data Collection Agent",
    long_about = "High-performance Rust edge agent supporting 97 connectors across 25 categories.\nCollects, normalizes (OCSF), and ships security telemetry to Databricks Lakehouse."
)]
struct Cli {
    #[arg(short, long, default_value = "/etc/0xdsi/edge.toml")]
    config: PathBuf,

    #[arg(long, default_value = "info")]
    log_level: String,

    #[arg(long)]
    validate_config: bool,

    #[arg(long)]
    list_connectors: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
        )
        .json()
        .init();

    if cli.list_connectors {
        print_connectors();
        return Ok(());
    }

    info!(
        version = env!("CARGO_PKG_VERSION"),
        config = %cli.config.display(),
        "Starting 0xDSI Edge Collector"
    );

    let config_str = tokio::fs::read_to_string(&cli.config).await?;
    let config: EdgeConfig = toml::from_str(&config_str)?;

    if cli.validate_config {
        info!("Configuration valid: {} connectors configured", config.connectors.len());
        return Ok(());
    }

    let mut pipeline = Pipeline::new(config.clone());

    for conn_cfg in &config.connectors {
        if !conn_cfg.enabled {
            continue;
        }
        if let Some(collector) = create_collector(&conn_cfg.connector_type) {
            pipeline.register_collector(collector);
        } else {
            error!(connector = %conn_cfg.connector_type, "Unknown connector type");
        }
    }

    pipeline.start().await?;

    info!("0xDSI Edge Collector running. Press Ctrl+C to stop.");
    tokio::signal::ctrl_c().await?;
    info!("Shutting down...");

    Ok(())
}

fn create_collector(connector_type: &str) -> Option<Box<dyn oxdsi_core::Collector>> {
    match connector_type {
        // SIEM
        "splunk_enterprise" => Some(Box::new(oxdsi_connector_siem::splunk::SplunkCollector::new())),
        "ibm_qradar" => Some(Box::new(oxdsi_connector_siem::qradar::QRadarCollector::new())),
        "microsoft_sentinel" => Some(Box::new(oxdsi_connector_siem::sentinel::SentinelCollector::new())),
        "elastic_security" => Some(Box::new(oxdsi_connector_siem::elastic::ElasticCollector::new())),
        "arcsight_esm" => Some(Box::new(oxdsi_connector_siem::arcsight::ArcSightCollector::new())),
        "logrhythm_siem" => Some(Box::new(oxdsi_connector_siem::logrhythm::LogRhythmCollector::new())),

        // Cloud AWS
        "aws_cloudtrail" => Some(Box::new(oxdsi_connector_cloud_aws::cloudtrail::CloudTrailCollector::new())),
        "amazon_guardduty" => Some(Box::new(oxdsi_connector_cloud_aws::guardduty::GuardDutyCollector::new())),
        "aws_security_hub" => Some(Box::new(oxdsi_connector_cloud_aws::security_hub::SecurityHubCollector::new())),
        "aws_vpc_flow_logs" => Some(Box::new(oxdsi_connector_cloud_aws::vpc_flow_logs::VpcFlowLogsCollector::new())),
        "aws_waf_logs" => Some(Box::new(oxdsi_connector_cloud_aws::waf_logs::WafLogsCollector::new())),

        // Cloud Azure
        "azure_monitor" => Some(Box::new(oxdsi_connector_cloud_azure::monitor::AzureMonitorCollector::new())),
        "microsoft_defender_cloud" => Some(Box::new(oxdsi_connector_cloud_azure::defender_cloud::DefenderCloudCollector::new())),
        "azure_entra_id" => Some(Box::new(oxdsi_connector_cloud_azure::entra_id::EntraIdCollector::new())),
        "azure_network_watcher" => Some(Box::new(oxdsi_connector_cloud_azure::network_watcher::NetworkWatcherCollector::new())),

        // Cloud GCP
        "google_cloud_logging" => Some(Box::new(oxdsi_connector_cloud_gcp::cloud_logging::CloudLoggingCollector::new())),
        "security_command_center" => Some(Box::new(oxdsi_connector_cloud_gcp::security_command_center::SecurityCommandCenterCollector::new())),
        "google_chronicle" => Some(Box::new(oxdsi_connector_cloud_gcp::chronicle::ChronicleCollector::new())),
        "gcp_vpc_flow_logs" => Some(Box::new(oxdsi_connector_cloud_gcp::vpc_flow_logs::GcpVpcFlowLogsCollector::new())),

        // EDR
        "crowdstrike_falcon" => Some(Box::new(oxdsi_connector_edr::crowdstrike::CrowdStrikeCollector::new())),
        "sentinelone" => Some(Box::new(oxdsi_connector_edr::sentinelone::SentinelOneCollector::new())),
        "carbon_black" => Some(Box::new(oxdsi_connector_edr::carbon_black::CarbonBlackCollector::new())),
        "defender_endpoint" => Some(Box::new(oxdsi_connector_edr::defender_endpoint::DefenderEndpointCollector::new())),
        "cybereason" => Some(Box::new(oxdsi_connector_edr::cybereason::CybereasonCollector::new())),

        // Firewall
        "palo_alto_ngfw" => Some(Box::new(oxdsi_connector_firewall::palo_alto::PaloAltoCollector::new())),
        "fortinet_fortigate" => Some(Box::new(oxdsi_connector_firewall::fortigate::FortiGateCollector::new())),
        "check_point_quantum" => Some(Box::new(oxdsi_connector_firewall::checkpoint::CheckPointCollector::new())),
        "cisco_secure_firewall" => Some(Box::new(oxdsi_connector_firewall::cisco_ftd::CiscoFtdCollector::new())),
        "juniper_srx" => Some(Box::new(oxdsi_connector_firewall::juniper_srx::JuniperSrxCollector::new())),

        // IAM
        "okta" => Some(Box::new(oxdsi_connector_iam::okta::OktaCollector::new())),
        "cyberark" => Some(Box::new(oxdsi_connector_iam::cyberark::CyberArkCollector::new())),
        "ping_identity" => Some(Box::new(oxdsi_connector_iam::ping_identity::PingIdentityCollector::new())),
        "onelogin" => Some(Box::new(oxdsi_connector_iam::onelogin::OneLoginCollector::new())),
        "sailpoint" => Some(Box::new(oxdsi_connector_iam::sailpoint::SailPointCollector::new())),

        // Email Security
        "proofpoint_tap" => Some(Box::new(oxdsi_connector_email_security::proofpoint::ProofpointCollector::new())),
        "mimecast" => Some(Box::new(oxdsi_connector_email_security::mimecast::MimecastCollector::new())),
        "defender_office365" => Some(Box::new(oxdsi_connector_email_security::defender_o365::DefenderO365Collector::new())),
        "barracuda" => Some(Box::new(oxdsi_connector_email_security::barracuda::BarracudaCollector::new())),

        // Vulnerability Management
        "qualys_vmdr" => Some(Box::new(oxdsi_connector_vuln::qualys::QualysCollector::new())),
        "tenable" => Some(Box::new(oxdsi_connector_vuln::tenable::TenableCollector::new())),
        "rapid7_insightvm" => Some(Box::new(oxdsi_connector_vuln::rapid7::Rapid7Collector::new())),
        "snyk" => Some(Box::new(oxdsi_connector_vuln::snyk::SnykCollector::new())),
        "wiz" => Some(Box::new(oxdsi_connector_vuln::wiz::WizCollector::new())),

        // Threat Intelligence
        "misp" => Some(Box::new(oxdsi_connector_threat_intel::misp::MispCollector::new())),
        "recorded_future" => Some(Box::new(oxdsi_connector_threat_intel::recorded_future::RecordedFutureCollector::new())),
        "mandiant" => Some(Box::new(oxdsi_connector_threat_intel::mandiant::MandiantCollector::new())),
        "alienvault_otx" => Some(Box::new(oxdsi_connector_threat_intel::alienvault_otx::AlienVaultOtxCollector::new())),
        "virustotal" => Some(Box::new(oxdsi_connector_threat_intel::virustotal::VirusTotalCollector::new())),

        // WAF
        "cloudflare_waf" => Some(Box::new(oxdsi_connector_waf::cloudflare::CloudflareWafCollector::new())),
        "aws_waf" => Some(Box::new(oxdsi_connector_waf::aws_waf::AwsWafCollector::new())),
        "akamai_waf" => Some(Box::new(oxdsi_connector_waf::akamai::AkamaiCollector::new())),
        "imperva_waf" => Some(Box::new(oxdsi_connector_waf::imperva::ImpervaWafCollector::new())),

        // DLP
        "symantec_dlp" => Some(Box::new(oxdsi_connector_dlp::symantec::SymantecDlpCollector::new())),
        "digital_guardian" => Some(Box::new(oxdsi_connector_dlp::digital_guardian::DigitalGuardianCollector::new())),
        "microsoft_purview" => Some(Box::new(oxdsi_connector_dlp::purview::PurviewCollector::new())),
        "forcepoint_dlp" => Some(Box::new(oxdsi_connector_dlp::forcepoint::ForcepointCollector::new())),

        // Container Security
        "aqua_security" => Some(Box::new(oxdsi_connector_container::aqua::AquaCollector::new())),
        "prisma_cloud" => Some(Box::new(oxdsi_connector_container::prisma_cloud::PrismaCloudCollector::new())),
        "sysdig_secure" => Some(Box::new(oxdsi_connector_container::sysdig::SysdigCollector::new())),
        "falco" => Some(Box::new(oxdsi_connector_container::falco::FalcoCollector::new())),

        // DevSecOps
        "github_advanced_security" => Some(Box::new(oxdsi_connector_devsecops::github_security::GitHubSecurityCollector::new())),
        "gitlab_security" => Some(Box::new(oxdsi_connector_devsecops::gitlab::GitLabCollector::new())),
        "sonarqube" => Some(Box::new(oxdsi_connector_devsecops::sonarqube::SonarQubeCollector::new())),
        "checkmarx" => Some(Box::new(oxdsi_connector_devsecops::checkmarx::CheckmarxCollector::new())),

        // NDR
        "darktrace" => Some(Box::new(oxdsi_connector_ndr::darktrace::DarktraceCollector::new())),
        "vectra_ai" => Some(Box::new(oxdsi_connector_ndr::vectra::VectraCollector::new())),
        "extrahop" => Some(Box::new(oxdsi_connector_ndr::extrahop::ExtraHopCollector::new())),
        "corelight" => Some(Box::new(oxdsi_connector_ndr::corelight::CorelightCollector::new())),

        // CASB
        "netskope" => Some(Box::new(oxdsi_connector_casb::netskope::NetskopeCollector::new())),
        "zscaler_zia" => Some(Box::new(oxdsi_connector_casb::zscaler::ZscalerCollector::new())),
        "defender_cloud_apps" => Some(Box::new(oxdsi_connector_casb::defender_cloud_apps::DefenderCloudAppsCollector::new())),
        "cisco_cloudlock" => Some(Box::new(oxdsi_connector_casb::cloudlock::CloudlockCollector::new())),

        // SOAR
        "cortex_xsoar" => Some(Box::new(oxdsi_connector_soar::cortex_xsoar::CortexXsoarCollector::new())),
        "splunk_soar" => Some(Box::new(oxdsi_connector_soar::splunk_soar::SplunkSoarCollector::new())),
        "swimlane" => Some(Box::new(oxdsi_connector_soar::swimlane::SwimlaneCollector::new())),
        "tines" => Some(Box::new(oxdsi_connector_soar::tines::TinesCollector::new())),

        // Observability
        "datadog" => Some(Box::new(oxdsi_connector_observability::datadog::DatadogCollector::new())),
        "sumo_logic" => Some(Box::new(oxdsi_connector_observability::sumo_logic::SumoLogicCollector::new())),
        "new_relic" => Some(Box::new(oxdsi_connector_observability::new_relic::NewRelicCollector::new())),
        "grafana_loki" => Some(Box::new(oxdsi_connector_observability::grafana_loki::GrafanaLokiCollector::new())),

        // ICS/OT
        "claroty" => Some(Box::new(oxdsi_connector_ics_ot::claroty::ClarotyCollector::new())),
        "dragos" => Some(Box::new(oxdsi_connector_ics_ot::dragos::DragosCollector::new())),
        "nozomi_networks" => Some(Box::new(oxdsi_connector_ics_ot::nozomi::NozomiCollector::new())),
        "tenable_ot" => Some(Box::new(oxdsi_connector_ics_ot::tenable_ot::TenableOtCollector::new())),

        // PLC & OT Protocols
        "s7comm" => Some(Box::new(oxdsi_connector_plc_ot_protocols::s7comm::S7commCollector::new())),
        "modbus" => Some(Box::new(oxdsi_connector_plc_ot_protocols::modbus::ModbusCollector::new())),
        "ethernet_ip_cip" => Some(Box::new(oxdsi_connector_plc_ot_protocols::ethernet_ip::EthernetIpCollector::new())),
        "opc_ua" => Some(Box::new(oxdsi_connector_plc_ot_protocols::opc_ua::OpcUaCollector::new())),
        "dnp3" => Some(Box::new(oxdsi_connector_plc_ot_protocols::dnp3::Dnp3Collector::new())),
        "iec_61850" => Some(Box::new(oxdsi_connector_plc_ot_protocols::iec61850::Iec61850Collector::new())),
        "iec_60870_5_104" => Some(Box::new(oxdsi_connector_plc_ot_protocols::iec60870_104::Iec104Collector::new())),
        "profinet_profibus" => Some(Box::new(oxdsi_connector_plc_ot_protocols::profinet::ProfinetCollector::new())),
        "bacnet_ip" => Some(Box::new(oxdsi_connector_plc_ot_protocols::bacnet::BacnetCollector::new())),
        "hart_ip" => Some(Box::new(oxdsi_connector_plc_ot_protocols::hart_ip::HartIpCollector::new())),
        "fins_omron" => Some(Box::new(oxdsi_connector_plc_ot_protocols::fins_omron::FinsCollector::new())),
        "melsec" => Some(Box::new(oxdsi_connector_plc_ot_protocols::melsec::MelsecCollector::new())),
        "cc_link" => Some(Box::new(oxdsi_connector_plc_ot_protocols::cc_link::CcLinkCollector::new())),
        "ge_srtp_egd" => Some(Box::new(oxdsi_connector_plc_ot_protocols::ge_srtp::GeSrtpCollector::new())),
        "codesys_v3" => Some(Box::new(oxdsi_connector_plc_ot_protocols::codesys::CodesysCollector::new())),
        "ethercat" => Some(Box::new(oxdsi_connector_plc_ot_protocols::ethercat::EthercatCollector::new())),
        "foundation_fieldbus" => Some(Box::new(oxdsi_connector_plc_ot_protocols::foundation_fieldbus::FoundationFieldbusCollector::new())),
        "yokogawa_centum" => Some(Box::new(oxdsi_connector_plc_ot_protocols::yokogawa::YokogawaCollector::new())),
        "abb_ac800m" => Some(Box::new(oxdsi_connector_plc_ot_protocols::abb::AbbCollector::new())),
        "honeywell_experion" => Some(Box::new(oxdsi_connector_plc_ot_protocols::honeywell::HoneywellCollector::new())),

        // DNS Security
        "cisco_umbrella" => Some(Box::new(oxdsi_connector_dns_security::cisco_umbrella::CiscoUmbrellaCollector::new())),
        "infoblox" => Some(Box::new(oxdsi_connector_dns_security::infoblox::InfobloxCollector::new())),
        "dnsfilter" => Some(Box::new(oxdsi_connector_dns_security::dnsfilter::DnsFilterCollector::new())),
        "cloudflare_gateway" => Some(Box::new(oxdsi_connector_dns_security::cloudflare_gateway::CloudflareGatewayCollector::new())),

        // Endpoint Management
        "microsoft_intune" => Some(Box::new(oxdsi_connector_endpoint_mgmt::intune::IntuneCollector::new())),
        "jamf_pro" => Some(Box::new(oxdsi_connector_endpoint_mgmt::jamf::JamfCollector::new())),
        "tanium" => Some(Box::new(oxdsi_connector_endpoint_mgmt::tanium::TaniumCollector::new())),
        "falcon_discover" => Some(Box::new(oxdsi_connector_endpoint_mgmt::falcon_discover::FalconDiscoverCollector::new())),

        // GRC
        "servicenow_grc" => Some(Box::new(oxdsi_connector_grc::servicenow::ServiceNowCollector::new())),
        "rsa_archer" => Some(Box::new(oxdsi_connector_grc::rsa_archer::RsaArcherCollector::new())),
        "drata" => Some(Box::new(oxdsi_connector_grc::drata::DrataCollector::new())),
        "vanta" => Some(Box::new(oxdsi_connector_grc::vanta::VantaCollector::new())),

        // Collaboration
        "slack_enterprise" => Some(Box::new(oxdsi_connector_collaboration::slack::SlackCollector::new())),
        "microsoft365_audit" => Some(Box::new(oxdsi_connector_collaboration::microsoft365::Microsoft365Collector::new())),
        "google_workspace" => Some(Box::new(oxdsi_connector_collaboration::google_workspace::GoogleWorkspaceCollector::new())),

        // Database Security
        "ibm_guardium" => Some(Box::new(oxdsi_connector_database_security::guardium::GuardiumCollector::new())),
        "imperva_data_security" => Some(Box::new(oxdsi_connector_database_security::imperva_data::ImpervaDataCollector::new())),
        "oracle_audit_vault" => Some(Box::new(oxdsi_connector_database_security::oracle_audit::OracleAuditCollector::new())),

        // Zero Trust
        "zscaler_zpa" => Some(Box::new(oxdsi_connector_zero_trust::zscaler_zpa::ZscalerZpaCollector::new())),
        "cloudflare_access" => Some(Box::new(oxdsi_connector_zero_trust::cloudflare_access::CloudflareAccessCollector::new())),
        "prisma_access" => Some(Box::new(oxdsi_connector_zero_trust::prisma_access::PrismaAccessCollector::new())),
        "tailscale" => Some(Box::new(oxdsi_connector_zero_trust::tailscale::TailscaleCollector::new())),

        // Deep Packet Inspection
        "dpi_engine" => Some(Box::new(oxdsi_connector_dpi::engine::DpiEngineCollector::new())),

        // Bytecode Weaving / Instrumentation
        "jvm_bytecode_weaving" => Some(Box::new(oxdsi_connector_bytecode_weaving::jvm_agent::JvmBytecodeCollector::new())),
        "dotnet_profiler" => Some(Box::new(oxdsi_connector_bytecode_weaving::dotnet_profiler::DotNetProfilerCollector::new())),
        "python_tracer" => Some(Box::new(oxdsi_connector_bytecode_weaving::python_tracer::PythonTracerCollector::new())),
        "ebpf_probe" => Some(Box::new(oxdsi_connector_bytecode_weaving::ebpf_probe::EbpfProbeCollector::new())),
        "node_module_shimming" => Some(Box::new(oxdsi_connector_bytecode_weaving::node_shimmer::NodeShimCollector::new())),

        // AI Document Analysis
        "ai_contract_analyzer" => Some(Box::new(oxdsi_connector_ai_document::contract_analyzer::ContractAnalyzerCollector::new())),
        "ai_risk_assessment" => Some(Box::new(oxdsi_connector_ai_document::risk_assessment::RiskAssessmentCollector::new())),
        "ai_bia_extractor" => Some(Box::new(oxdsi_connector_ai_document::bia_extractor::BiaExtractorCollector::new())),
        "ai_asset_discovery" => Some(Box::new(oxdsi_connector_ai_document::asset_discovery::AssetDiscoveryCollector::new())),
        "ai_compliance_scanner" => Some(Box::new(oxdsi_connector_ai_document::compliance_scanner::ComplianceScannerCollector::new())),

        // Network Taps
        "full_duplex_tap" => Some(Box::new(oxdsi_connector_network_taps::full_duplex_tap::FullDuplexTapCollector::new())),
        "span_port_mirror" => Some(Box::new(oxdsi_connector_network_taps::span_mirror::SpanMirrorCollector::new())),
        "cloud_vpc_mirror" => Some(Box::new(oxdsi_connector_network_taps::cloud_vpc_mirror::CloudVpcMirrorCollector::new())),
        "ics_passive_tap" => Some(Box::new(oxdsi_connector_network_taps::ics_passive_tap::IcsPassiveTapCollector::new())),
        "wireless_monitor" => Some(Box::new(oxdsi_connector_network_taps::wireless_monitor::WirelessMonitorCollector::new())),

        _ => None,
    }
}

fn print_connectors() {
    println!("0xDSI Edge Collector - Supported Connectors (97 total)\n");
    println!("{:<24} {:<30} {:<24} {}", "CATEGORY", "CONNECTOR", "VENDOR", "PROTOCOLS");
    println!("{}", "=".repeat(110));

    let connectors = vec![
        ("SIEM", "Splunk Enterprise", "Splunk (Cisco)", "HEC / Syslog / REST"),
        ("SIEM", "IBM QRadar", "IBM", "Log Source / STIX"),
        ("SIEM", "Microsoft Sentinel", "Microsoft", "Log Analytics / CEF"),
        ("SIEM", "Elastic Security", "Elastic", "Fleet / Logstash / Beats"),
        ("SIEM", "ArcSight ESM", "OpenText", "SmartConnector / CEF"),
        ("SIEM", "LogRhythm SIEM", "LogRhythm", "System Monitor / Syslog"),
        ("Cloud AWS", "AWS CloudTrail", "AWS", "S3 / SNS / EventBridge"),
        ("Cloud AWS", "Amazon GuardDuty", "AWS", "EventBridge / S3"),
        ("Cloud AWS", "AWS Security Hub", "AWS", "ASFF / EventBridge"),
        ("Cloud AWS", "AWS VPC Flow Logs", "AWS", "CloudWatch / S3 / Kinesis"),
        ("Cloud AWS", "AWS WAF Logs", "AWS", "S3 / Kinesis Firehose"),
        ("Cloud Azure", "Azure Monitor", "Microsoft", "Log Analytics / Event Hub"),
        ("Cloud Azure", "Defender for Cloud", "Microsoft", "REST / Event Hub"),
        ("Cloud Azure", "Entra ID", "Microsoft", "Graph API / Event Hub"),
        ("Cloud Azure", "Network Watcher", "Microsoft", "REST / Storage Account"),
        ("Cloud GCP", "Cloud Logging", "Google", "Pub/Sub / REST"),
        ("Cloud GCP", "Security Command Center", "Google", "Pub/Sub / REST"),
        ("Cloud GCP", "Chronicle", "Google", "Ingestion API / Forwarder"),
        ("Cloud GCP", "VPC Flow Logs", "Google", "Pub/Sub / BigQuery"),
        ("EDR", "CrowdStrike Falcon", "CrowdStrike", "Streaming / FDR S3"),
        ("EDR", "SentinelOne", "SentinelOne", "REST / Syslog CEF"),
        ("EDR", "Carbon Black", "Broadcom", "REST / Event Forwarder"),
        ("EDR", "Defender for Endpoint", "Microsoft", "Streaming / Graph"),
        ("EDR", "Cybereason", "Cybereason", "REST / Syslog"),
        ("Firewall", "Palo Alto NGFW", "Palo Alto", "Syslog / Cortex DL"),
        ("Firewall", "FortiGate", "Fortinet", "Syslog / FortiAnalyzer"),
        ("Firewall", "Check Point Quantum", "Check Point", "LEA / OPSEC"),
        ("Firewall", "Cisco Secure FW", "Cisco", "eStreamer / Syslog"),
        ("Firewall", "Juniper SRX", "Juniper", "Syslog / NETCONF"),
        ("PLC/OT", "Siemens S7comm", "Siemens", "S7comm / TCP 102"),
        ("PLC/OT", "Modbus TCP/RTU", "Schneider", "TCP 502 / Serial"),
        ("PLC/OT", "EtherNet/IP CIP", "Rockwell", "TCP 44818 / UDP 2222"),
        ("PLC/OT", "OPC UA", "OPC Foundation", "Binary TCP 4840"),
        ("PLC/OT", "DNP3", "IEEE", "TCP 20000 / Serial"),
        ("PLC/OT", "IEC 61850 GOOSE/MMS", "IEC", "MMS TCP 102 / L2"),
        ("PLC/OT", "IEC 60870-5-104", "IEC", "TCP 2404"),
        ("PLC/OT", "PROFINET/PROFIBUS", "Siemens/PI", "RT/IRT / DP Serial"),
        ("PLC/OT", "BACnet/IP", "ASHRAE", "UDP 47808 / MS/TP"),
        ("PLC/OT", "HART-IP", "FieldComm", "UDP/TCP 5094"),
        ("PLC/OT", "FINS (Omron)", "Omron", "TCP/UDP 9600"),
        ("PLC/OT", "MELSEC", "Mitsubishi", "MC Protocol / SLMP"),
        ("PLC/OT", "CC-Link IE", "Mitsubishi/CLPA", "GbE / Serial"),
        ("PLC/OT", "GE SRTP/EGD", "GE Vernova", "TCP 18245 / UDP mcast"),
        ("PLC/OT", "CODESYS V3", "CODESYS GmbH", "TCP 11740"),
        ("PLC/OT", "EtherCAT", "Beckhoff/ETG", "EtherType 0x88A4"),
        ("PLC/OT", "Foundation Fieldbus", "FieldComm", "H1 / HSE"),
        ("PLC/OT", "Yokogawa CENTUM VP", "Yokogawa", "Vnet/IP"),
        ("PLC/OT", "ABB AC 800M", "ABB", "MMS / OPC UA"),
        ("PLC/OT", "Honeywell Experion", "Honeywell", "CDA / OPC UA / FTE"),
    ];

    for (cat, name, vendor, proto) in connectors {
        println!("{:<24} {:<30} {:<24} {}", cat, name, vendor, proto);
    }
    println!("\n... and 48 more across IAM, Email, Vuln, TI, WAF, DLP, K8s, DevSecOps, NDR, CASB, SOAR, Observability, DNS, Endpoint Mgmt, GRC, Collab, DB Security, Zero Trust");
    println!("\nRun with --config to start collection. See /etc/0xdsi/edge.toml for configuration.");
}

use crate::define_connector;

define_connector!(GcpLogging, "Google Cloud Logging", "gcp_logging", "cloud_gcp", "Pub/Sub / REST API");
define_connector!(GcpScc, "Security Command Center", "gcp_scc", "cloud_gcp", "Pub/Sub / REST API");
define_connector!(GcpChronicle, "Google Chronicle", "gcp_chronicle", "cloud_gcp", "Ingestion API / Forwarder");
define_connector!(GcpVpcFlow, "GCP VPC Flow Logs", "gcp_vpc_flow", "cloud_gcp", "Pub/Sub / BigQuery Export");

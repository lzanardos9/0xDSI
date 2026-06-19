use crate::define_connector;

define_connector!(AzureMonitor, "Azure Monitor", "azure_monitor", "cloud_azure", "Log Analytics API / Event Hub");
define_connector!(AzureDefender, "Microsoft Defender for Cloud", "azure_defender", "cloud_azure", "REST API / Event Hub");
define_connector!(AzureEntraId, "Azure AD / Entra ID", "azure_entra_id", "cloud_azure", "Graph API / Event Hub");
define_connector!(AzureNetworkWatcher, "Azure Network Watcher", "azure_network_watcher", "cloud_azure", "REST API / Storage Account");

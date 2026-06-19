use crate::define_connector;

define_connector!(Misp, "MISP", "misp", "threat_intel", "REST API / STIX/TAXII / ZMQ");
define_connector!(RecordedFuture, "Recorded Future", "recorded_future", "threat_intel", "Connect API / STIX/TAXII");
define_connector!(MandiantTi, "Mandiant Threat Intelligence", "mandiant_ti", "threat_intel", "REST API v4 / STIX 2.1");
define_connector!(AlienVaultOtx, "AlienVault OTX", "alienvault_otx", "threat_intel", "DirectConnect API / STIX/TAXII");
define_connector!(VirusTotal, "VirusTotal Enterprise", "virustotal", "threat_intel", "REST API v3 / VT Hunting");
define_connector!(StixTaxii, "STIX/TAXII Client", "stix_taxii", "threat_intel", "TAXII 2.1 / STIX 2.1 bundle polling");

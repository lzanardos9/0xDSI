use crate::define_connector;

define_connector!(CiscoUmbrella, "Cisco Umbrella", "cisco_umbrella", "dns", "S3 Log Export / REST API");
define_connector!(Infoblox, "Infoblox BloxOne Threat Defense", "infoblox", "dns", "REST API / Syslog / STIX/TAXII");
define_connector!(DnsFilter, "DNSFilter", "dnsfilter", "dns", "REST API / Syslog");
define_connector!(CloudflareGateway, "Cloudflare Gateway", "cloudflare_gateway", "dns", "Logpush / REST API");

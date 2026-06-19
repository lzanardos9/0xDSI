use crate::define_connector;

define_connector!(ZscalerZpa, "Zscaler Private Access", "zscaler_zpa", "zero_trust", "Nanolog Streaming / REST API");
define_connector!(CloudflareAccess, "Cloudflare Access", "cloudflare_access", "zero_trust", "Logpush / REST API");
define_connector!(PrismaAccess, "Palo Alto Prisma Access", "prisma_access", "zero_trust", "Cortex Data Lake / Syslog / REST API");
define_connector!(Tailscale, "Tailscale", "tailscale", "zero_trust", "REST API / Webhook / Audit Log");

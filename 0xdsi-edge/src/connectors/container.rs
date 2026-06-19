use crate::define_connector;

define_connector!(AquaSecurity, "Aqua Security", "aqua_security", "container", "REST API / Webhook / Syslog");
define_connector!(PrismaCloud, "Prisma Cloud", "prisma_cloud", "container", "REST API / Webhook");
define_connector!(SysdigSecure, "Sysdig Secure", "sysdig_secure", "container", "REST API / Syslog / Event Forwarding");
define_connector!(Falco, "Falco", "falco", "container", "gRPC / Webhook / Syslog");

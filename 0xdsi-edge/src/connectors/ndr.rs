use crate::define_connector;

define_connector!(Darktrace, "Darktrace", "darktrace", "ndr", "REST API / Syslog CEF / STIX");
define_connector!(VectraAi, "Vectra AI", "vectra_ai", "ndr", "REST API / Syslog CEF");
define_connector!(ExtraHop, "ExtraHop Reveal(x)", "extrahop", "ndr", "REST API / Syslog / Webhook");
define_connector!(Corelight, "Corelight", "corelight", "ndr", "Zeek Logs / Kafka / REST API");

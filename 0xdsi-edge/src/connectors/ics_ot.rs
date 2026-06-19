use crate::define_connector;

define_connector!(Claroty, "Claroty", "claroty", "ics_ot", "REST API / Syslog CEF / STIX");
define_connector!(Dragos, "Dragos Platform", "dragos", "ics_ot", "REST API / Syslog / STIX/TAXII");
define_connector!(Nozomi, "Nozomi Networks", "nozomi", "ics_ot", "REST API / Syslog / SNMP");
define_connector!(TenableOt, "Tenable OT Security", "tenable_ot", "ics_ot", "REST API / Syslog CEF");

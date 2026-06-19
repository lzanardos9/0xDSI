use crate::define_connector;

define_connector!(IbmGuardium, "IBM Guardium", "ibm_guardium", "database_sec", "S-TAP Agent / REST API / Syslog");
define_connector!(ImpervaData, "Imperva Data Security", "imperva_data", "database_sec", "Agent / REST API / Syslog CEF");
define_connector!(OracleAuditVault, "Oracle Audit Vault", "oracle_audit_vault", "database_sec", "Audit Collection Agent / REST API");

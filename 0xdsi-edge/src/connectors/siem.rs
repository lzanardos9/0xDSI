use crate::define_connector;

// Splunk HEC - HTTP Event Collector (TCP/8088 default)
define_connector!(SplunkHec, "Splunk Enterprise", "splunk_hec", "siem", "HEC / REST API");

// IBM QRadar - Log Source Protocol / STIX
define_connector!(IbmQradar, "IBM QRadar", "ibm_qradar", "siem", "Log Source Protocol / Syslog / STIX");

// Microsoft Sentinel - Log Analytics API
define_connector!(MsSentinel, "Microsoft Sentinel", "ms_sentinel", "siem", "Log Analytics API / CEF");

// Elastic Security - Fleet Agent / Logstash / Beats
define_connector!(ElasticSecurity, "Elastic Security", "elastic_security", "siem", "Fleet Agent / Logstash / Beats");

// ArcSight ESM - SmartConnector / CEF
define_connector!(ArcSight, "ArcSight ESM", "arcsight", "siem", "SmartConnector / CEF / Syslog");

// LogRhythm SIEM
define_connector!(LogRhythm, "LogRhythm SIEM", "logrhythm", "siem", "System Monitor Agent / Syslog");

// Generic protocol connectors
define_connector!(SyslogTcp, "Syslog TCP/TLS Receiver", "syslog_tcp", "generic", "Syslog RFC5424 / RFC3164 (TCP/TLS)");
define_connector!(SyslogUdp, "Syslog UDP Receiver", "syslog_udp", "generic", "Syslog RFC5424 / RFC3164 (UDP/514)");
define_connector!(CefReceiver, "CEF/LEEF Receiver", "cef_receiver", "generic", "CEF over Syslog / LEEF");
define_connector!(HttpWebhook, "HTTP Webhook Receiver", "http_webhook", "generic", "HTTP/HTTPS POST (JSON/CEF)");
define_connector!(KafkaConsumer, "Kafka Consumer", "kafka_consumer", "generic", "Apache Kafka / Confluent");
define_connector!(FileTail, "File Tail", "file_tail", "generic", "inotify / kqueue file watching");

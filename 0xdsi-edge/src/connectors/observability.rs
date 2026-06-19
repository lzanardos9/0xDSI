use crate::define_connector;

define_connector!(Datadog, "Datadog Security Monitoring", "datadog", "observability", "REST API / Agent / Syslog");
define_connector!(SumoLogic, "Sumo Logic", "sumo_logic", "observability", "REST API / Hosted Collector / Syslog");
define_connector!(NewRelic, "New Relic", "new_relic", "observability", "REST API / Agent / OpenTelemetry");
define_connector!(GrafanaLoki, "Grafana Loki", "grafana_loki", "observability", "REST API / Promtail / Fluentd");

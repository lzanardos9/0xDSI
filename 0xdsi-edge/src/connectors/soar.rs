use crate::define_connector;

define_connector!(CortexXsoar, "Cortex XSOAR", "cortex_xsoar", "soar", "REST API / Webhook / Demisto SDK");
define_connector!(SplunkSoar, "Splunk SOAR", "splunk_soar", "soar", "REST API / Webhook");
define_connector!(Swimlane, "Swimlane Turbine", "swimlane", "soar", "REST API / Webhook");
define_connector!(Tines, "Tines", "tines", "soar", "REST API / Webhook");

/*
  # Integrate All Security Events into Threat Hunting
  
  Consolidates physical, network, and infrastructure events for unified AI threat hunting.
*/

-- Physical security
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, raw_payload, similarity_cluster, threat_indicators)
SELECT created_at, 'physical_security', event_type,
  'Physical: ' || event_type || ' [' || severity || ']',
  jsonb_build_object('event_type', event_type, 'severity', severity, 'zone_id', zone_id, 'person_id', person_id, 'domain', 'physical'),
  CASE WHEN severity = 'critical' THEN 1 WHEN severity = 'high' THEN 2 ELSE NULL END,
  jsonb_build_object('severity', severity, 'type', event_type)
FROM physical_security_events LIMIT 100;

-- Personnel
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, raw_payload, similarity_cluster)
SELECT last_seen, 'personnel_tracking', 'location',
  'Personnel: ' || person_name || ' (' || badge_type || ')',
  jsonb_build_object('person_id', person_id, 'person_name', person_name, 'badge_type', badge_type, 'domain', 'physical'),
  3
FROM personnel_tracking WHERE badge_type IN ('contractor', 'visitor', 'unknown') LIMIT 80;

-- Packets
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, source_ip, destination_ip, raw_payload, similarity_cluster)
SELECT capture_time, 'dpi_capture', 'packet',
  'DPI: ' || protocol || ' ' || content_type,
  source_ip, destination_ip,
  jsonb_build_object('protocol', protocol, 'content_type', content_type, 'packet_size', packet_size, 'domain', 'network'),
  4
FROM packet_captures WHERE content_type IN ('encrypted', 'compressed', 'unknown') LIMIT 100;

-- Flows
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, source_ip, destination_ip, raw_payload, similarity_cluster)
SELECT start_time, 'dpi_flow', 'flow',
  'Flow: ' || protocol || ' ' || source_zone || ' → ' || destination_zone,
  source_ip, destination_ip,
  jsonb_build_object('flow_id', flow_id, 'protocol', protocol, 'packets', total_packets, 'bytes', total_bytes, 'domain', 'network'),
  5
FROM dpi_flows WHERE status = 'blocked' OR total_bytes > 1000000 LIMIT 100;

-- DLP
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, raw_payload, similarity_cluster, threat_indicators)
SELECT detected_at, 'dlp_detection', violation_type,
  'DLP: ' || violation_type || ' [' || risk_level || '] - ' || action_taken,
  jsonb_build_object('risk_level', risk_level, 'violation_type', violation_type, 'action_taken', action_taken, 'domain', 'network'),
  CASE WHEN action_taken = 'block' THEN 6 ELSE 7 END,
  jsonb_build_object('violation', violation_type, 'risk', risk_level, 'action', action_taken)
FROM dlp_detections LIMIT 100;

-- Assets
INSERT INTO raw_security_events (event_timestamp, source_system, event_type_detected, event_summary, source_ip, raw_payload, similarity_cluster)
SELECT last_scan, 'asset_inventory', 'asset',
  'Asset: ' || asset_name || ' [' || criticality || '] in ' || location,
  ip_address,
  jsonb_build_object('asset_name', asset_name, 'asset_type', asset_type, 'ip', ip_address, 'location', location, 'criticality', criticality, 'vulnerabilities', known_vulnerabilities, 'domain', 'infrastructure'),
  8
FROM asset_registry WHERE criticality IN ('very_high', 'high') LIMIT 60;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_domain ON raw_security_events((raw_payload->>'domain'));

-- Search
CREATE OR REPLACE FUNCTION hunt_events(q text, lim int DEFAULT 50)
RETURNS SETOF raw_security_events LANGUAGE sql AS $$
  SELECT * FROM raw_security_events
  WHERE lower(event_summary || ' ' || coalesce(event_type_detected, '') || ' ' || source_system) LIKE '%' || lower(q) || '%'
  ORDER BY event_timestamp DESC LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION hunt_events TO authenticated;

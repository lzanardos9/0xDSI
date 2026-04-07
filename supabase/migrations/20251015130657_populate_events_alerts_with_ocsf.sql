/*
  # Populate Events and Alerts with OCSF Classifications

  1. Purpose
    - Apply OCSF classification to existing events and alerts
    - Normalize event data to OCSF standard
    - Enrich data with OCSF metadata

  2. OCSF Severity Mapping
    - 0: Unknown
    - 1: Informational
    - 2: Low
    - 3: Medium
    - 4: High
    - 5: Critical
*/

-- Update authentication events
UPDATE events 
SET 
  ocsf_class_uid = 3002,
  ocsf_class_name = 'Authentication',
  ocsf_category_uid = 3,
  ocsf_category_name = 'Identity & Access Management',
  ocsf_activity_id = CASE 
    WHEN event_type ILIKE '%login%' OR event_type ILIKE '%signin%' THEN 1
    WHEN event_type ILIKE '%logout%' OR event_type ILIKE '%signout%' THEN 2
    WHEN event_type ILIKE '%failed%' OR event_type ILIKE '%deny%' THEN 3
    ELSE 0
  END,
  ocsf_activity_name = CASE 
    WHEN event_type ILIKE '%login%' OR event_type ILIKE '%signin%' THEN 'Logon'
    WHEN event_type ILIKE '%logout%' OR event_type ILIKE '%signout%' THEN 'Logoff'
    WHEN event_type ILIKE '%failed%' OR event_type ILIKE '%deny%' THEN 'Authentication Failure'
    ELSE 'Unknown'
  END,
  ocsf_type_uid = 3002000 + CASE 
    WHEN event_type ILIKE '%login%' OR event_type ILIKE '%signin%' THEN 1
    WHEN event_type ILIKE '%logout%' OR event_type ILIKE '%signout%' THEN 2
    WHEN event_type ILIKE '%failed%' OR event_type ILIKE '%deny%' THEN 3
    ELSE 0
  END,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%auth%' OR event_type ILIKE '%login%' OR event_type ILIKE '%access%')
  AND ocsf_class_uid IS NULL;

-- Update network events
UPDATE events 
SET 
  ocsf_class_uid = 4001,
  ocsf_class_name = 'Network Activity',
  ocsf_category_uid = 4,
  ocsf_category_name = 'Network Activity',
  ocsf_activity_id = CASE 
    WHEN event_type ILIKE '%connect%' THEN 1
    WHEN event_type ILIKE '%close%' THEN 2
    WHEN event_type ILIKE '%traffic%' THEN 6
    ELSE 0
  END,
  ocsf_activity_name = CASE 
    WHEN event_type ILIKE '%connect%' THEN 'Open'
    WHEN event_type ILIKE '%close%' THEN 'Close'
    WHEN event_type ILIKE '%traffic%' THEN 'Traffic'
    ELSE 'Unknown'
  END,
  ocsf_type_uid = 4001000 + CASE 
    WHEN event_type ILIKE '%connect%' THEN 1
    WHEN event_type ILIKE '%close%' THEN 2
    WHEN event_type ILIKE '%traffic%' THEN 6
    ELSE 0
  END,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%network%' OR event_type ILIKE '%connection%' OR event_type ILIKE '%traffic%')
  AND ocsf_class_uid IS NULL;

-- Update malware/threat detection events
UPDATE events 
SET 
  ocsf_class_uid = 2004,
  ocsf_class_name = 'Detection Finding',
  ocsf_category_uid = 2,
  ocsf_category_name = 'Findings',
  ocsf_activity_id = 1,
  ocsf_activity_name = 'Create',
  ocsf_type_uid = 2004001,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%malware%' OR event_type ILIKE '%threat%' OR event_type ILIKE '%attack%' 
       OR event_type ILIKE '%suspicious%' OR event_type ILIKE '%detection%')
  AND ocsf_class_uid IS NULL;

-- Update process execution events
UPDATE events 
SET 
  ocsf_class_uid = 1007,
  ocsf_class_name = 'Process Activity',
  ocsf_category_uid = 1,
  ocsf_category_name = 'System Activity',
  ocsf_activity_id = CASE 
    WHEN event_type ILIKE '%create%' OR event_type ILIKE '%start%' THEN 1
    WHEN event_type ILIKE '%terminate%' OR event_type ILIKE '%kill%' THEN 2
    ELSE 0
  END,
  ocsf_activity_name = CASE 
    WHEN event_type ILIKE '%create%' OR event_type ILIKE '%start%' THEN 'Launch'
    WHEN event_type ILIKE '%terminate%' OR event_type ILIKE '%kill%' THEN 'Terminate'
    ELSE 'Unknown'
  END,
  ocsf_type_uid = 1007000 + CASE 
    WHEN event_type ILIKE '%create%' OR event_type ILIKE '%start%' THEN 1
    WHEN event_type ILIKE '%terminate%' OR event_type ILIKE '%kill%' THEN 2
    ELSE 0
  END,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%process%' OR event_type ILIKE '%execution%')
  AND ocsf_class_uid IS NULL;

-- Update file activity events
UPDATE events 
SET 
  ocsf_class_uid = 1001,
  ocsf_class_name = 'File System Activity',
  ocsf_category_uid = 1,
  ocsf_category_name = 'System Activity',
  ocsf_activity_id = CASE 
    WHEN event_type ILIKE '%create%' THEN 1
    WHEN event_type ILIKE '%read%' THEN 2
    WHEN event_type ILIKE '%update%' OR event_type ILIKE '%modify%' THEN 3
    WHEN event_type ILIKE '%delete%' THEN 4
    ELSE 0
  END,
  ocsf_activity_name = CASE 
    WHEN event_type ILIKE '%create%' THEN 'Create'
    WHEN event_type ILIKE '%read%' THEN 'Read'
    WHEN event_type ILIKE '%update%' OR event_type ILIKE '%modify%' THEN 'Update'
    WHEN event_type ILIKE '%delete%' THEN 'Delete'
    ELSE 'Unknown'
  END,
  ocsf_type_uid = 1001000 + CASE 
    WHEN event_type ILIKE '%create%' THEN 1
    WHEN event_type ILIKE '%read%' THEN 2
    WHEN event_type ILIKE '%update%' OR event_type ILIKE '%modify%' THEN 3
    WHEN event_type ILIKE '%delete%' THEN 4
    ELSE 0
  END,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%file%')
  AND ocsf_class_uid IS NULL;

-- Update DNS events
UPDATE events 
SET 
  ocsf_class_uid = 4003,
  ocsf_class_name = 'DNS Activity',
  ocsf_category_uid = 4,
  ocsf_category_name = 'Network Activity',
  ocsf_activity_id = 1,
  ocsf_activity_name = 'Query',
  ocsf_type_uid = 4003001,
  ocsf_severity_id = CASE 
    WHEN severity = 'critical' THEN 5
    WHEN severity = 'high' THEN 4
    WHEN severity = 'medium' THEN 3
    WHEN severity = 'low' THEN 2
    WHEN severity = 'info' THEN 1
    ELSE 0
  END
WHERE (event_type ILIKE '%dns%')
  AND ocsf_class_uid IS NULL;

-- Update alerts with OCSF classification
UPDATE alerts
SET 
  ocsf_class_uid = 2001,
  ocsf_class_name = 'Security Finding',
  ocsf_finding = jsonb_build_object(
    'title', title,
    'severity_id', CASE 
      WHEN severity = 'critical' THEN 5
      WHEN severity = 'high' THEN 4
      WHEN severity = 'medium' THEN 3
      WHEN severity = 'low' THEN 2
      WHEN severity = 'info' THEN 1
      ELSE 0
    END,
    'types', ARRAY['Security Alert'],
    'first_seen_time', created_at,
    'last_seen_time', updated_at
  )
WHERE ocsf_class_uid IS NULL;

-- Update threat feeds with OCSF enrichment
UPDATE threat_feeds
SET 
  ocsf_threat_category = CASE 
    WHEN feed_type = 'malware' THEN 'Malware'
    WHEN feed_type = 'phishing' THEN 'Phishing'
    WHEN feed_type = 'c2' THEN 'Command and Control'
    WHEN feed_type = 'botnet' THEN 'Botnet'
    ELSE 'Unknown'
  END,
  ocsf_class_uid = 2001,
  ocsf_enrichment = jsonb_build_object(
    'feed_name', feed_name,
    'feed_source', feed_source,
    'feed_type', feed_type,
    'total_indicators', total_indicators,
    'last_sync_at', last_sync_at
  )
WHERE ocsf_threat_category IS NULL;

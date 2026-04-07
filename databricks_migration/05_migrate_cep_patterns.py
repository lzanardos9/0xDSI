#!/usr/bin/env python3
"""
Migrate Complex Event Processing (CEP) patterns to Databricks Structured Streaming
Converts PostgreSQL CEP patterns to Delta Live Tables
"""

import os
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

# CEP Pattern Definitions (from PostgreSQL)
CEP_PATTERNS = [
    {
        'name': 'lateral_movement_sequence',
        'description': 'Detect lateral movement patterns across network',
        'severity': 'high',
        'time_window': '5 minutes',
        'threshold': 3,
        'dlt_query': '''
CREATE OR REFRESH STREAMING LIVE TABLE lateral_movement_detected AS
SELECT
    source_vertex_id as user_id,
    COUNT(*) as movement_count,
    COLLECT_LIST(target_vertex_id) as accessed_assets,
    MAX(confidence_score) as max_confidence,
    window.start as window_start,
    window.end as window_end,
    'lateral_movement_sequence' as pattern_name,
    'high' as severity
FROM STREAM(live.streaming_graph_edges)
WHERE edge_type = 'lateral_movement'
    AND is_suspicious = true
GROUP BY
    source_vertex_id,
    window(last_event_time, '5 minutes')
HAVING COUNT(*) >= 3;
'''
    },
    {
        'name': 'privilege_escalation',
        'description': 'User gaining elevated privileges followed by sensitive access',
        'severity': 'critical',
        'time_window': '5 minutes',
        'threshold': 1,
        'dlt_query': '''
CREATE OR REFRESH STREAMING LIVE TABLE privilege_escalation_detected AS
WITH privilege_changes AS (
    SELECT
        source_vertex_id as user_id,
        properties,
        last_event_time,
        window(last_event_time, '5 minutes') as time_window
    FROM STREAM(live.streaming_graph_edges)
    WHERE edge_type = 'privilege_change'
        AND get_json_object(properties, '$.new_privilege') > get_json_object(properties, '$.old_privilege')
),
sensitive_access AS (
    SELECT
        source_vertex_id as user_id,
        target_vertex_id as asset_id,
        last_event_time,
        window(last_event_time, '5 minutes') as time_window
    FROM STREAM(live.streaming_graph_edges)
    WHERE edge_type = 'asset_access'
        AND get_json_object(properties, '$.asset_classification') = 'sensitive'
)
SELECT
    pc.user_id,
    pc.properties as privilege_change_details,
    COLLECT_LIST(sa.asset_id) as accessed_sensitive_assets,
    COUNT(DISTINCT sa.asset_id) as sensitive_asset_count,
    MIN(pc.last_event_time) as first_escalation_time,
    MAX(sa.last_event_time) as last_access_time,
    pc.time_window.start as window_start,
    pc.time_window.end as window_end,
    'privilege_escalation' as pattern_name,
    'critical' as severity
FROM privilege_changes pc
INNER JOIN sensitive_access sa
    ON pc.user_id = sa.user_id
    AND pc.time_window = sa.time_window
GROUP BY
    pc.user_id,
    pc.properties,
    pc.time_window;
'''
    },
    {
        'name': 'data_exfiltration',
        'description': 'Large data transfers to external IPs',
        'severity': 'critical',
        'time_window': '15 minutes',
        'threshold': 1000000000,  # 1GB
        'dlt_query': '''
CREATE OR REFRESH STREAMING LIVE TABLE data_exfiltration_detected AS
SELECT
    source_vertex_id as user_id,
    target_vertex_id as external_ip,
    SUM(CAST(get_json_object(properties, '$.bytes_transferred') AS BIGINT)) as total_bytes,
    COUNT(*) as transfer_count,
    COLLECT_LIST(
        struct(
            last_event_time,
            get_json_object(properties, '$.bytes_transferred') as bytes,
            get_json_object(properties, '$.protocol') as protocol
        )
    ) as transfer_details,
    window.start as window_start,
    window.end as window_end,
    'data_exfiltration' as pattern_name,
    'critical' as severity
FROM STREAM(live.streaming_graph_edges)
WHERE edge_type = 'data_transfer'
    AND get_json_object(properties, '$.destination_type') = 'external'
GROUP BY
    source_vertex_id,
    target_vertex_id,
    window(last_event_time, '15 minutes')
HAVING SUM(CAST(get_json_object(properties, '$.bytes_transferred') AS BIGINT)) >= 1000000000;
'''
    },
    {
        'name': 'reconnaissance_scan',
        'description': 'Port scanning or network enumeration',
        'severity': 'medium',
        'time_window': '1 minute',
        'threshold': 100,
        'dlt_query': '''
CREATE OR REFRESH STREAMING LIVE TABLE reconnaissance_scan_detected AS
SELECT
    source_vertex_id as scanner_ip,
    COUNT(DISTINCT target_vertex_id) as unique_targets,
    COUNT(DISTINCT get_json_object(properties, '$.port')) as unique_ports,
    COUNT(*) as total_connections,
    COLLECT_SET(get_json_object(properties, '$.port')) as scanned_ports,
    COLLECT_SET(target_vertex_id) as scanned_hosts,
    window.start as window_start,
    window.end as window_end,
    'reconnaissance_scan' as pattern_name,
    'medium' as severity
FROM STREAM(live.streaming_graph_edges)
WHERE edge_type = 'network_connection'
GROUP BY
    source_vertex_id,
    window(last_event_time, '1 minute')
HAVING COUNT(*) >= 100
    OR COUNT(DISTINCT get_json_object(properties, '$.port')) >= 20;
'''
    }
]

# Alert generation from pattern matches
ALERT_GENERATION_DLT = '''
-- ============================================================
-- Unified CEP Alert Generation
-- ============================================================
-- Combine all pattern matches into single alert stream
-- ============================================================

CREATE OR REFRESH STREAMING LIVE TABLE cep_alerts AS
SELECT
    uuid() as alert_id,
    pattern_name,
    severity,
    user_id,
    movement_count as event_count,
    concat('Lateral Movement: User accessed ', CAST(movement_count AS STRING), ' assets in ',
           CAST(round((unix_timestamp(window_end) - unix_timestamp(window_start)) / 60, 1) AS STRING), ' minutes') as description,
    accessed_assets as details,
    window_start,
    window_end,
    current_timestamp() as created_at,
    'new' as status
FROM live.lateral_movement_detected

UNION ALL

SELECT
    uuid() as alert_id,
    pattern_name,
    severity,
    user_id,
    sensitive_asset_count as event_count,
    concat('Privilege Escalation: User gained privileges and accessed ',
           CAST(sensitive_asset_count AS STRING), ' sensitive assets') as description,
    struct(privilege_change_details, accessed_sensitive_assets) as details,
    window_start,
    window_end,
    current_timestamp() as created_at,
    'new' as status
FROM live.privilege_escalation_detected

UNION ALL

SELECT
    uuid() as alert_id,
    pattern_name,
    severity,
    user_id,
    transfer_count as event_count,
    concat('Data Exfiltration: ', CAST(round(total_bytes / 1073741824, 2) AS STRING),
           ' GB transferred to ', external_ip) as description,
    struct(total_bytes, transfer_count, transfer_details) as details,
    window_start,
    window_end,
    current_timestamp() as created_at,
    'new' as status
FROM live.data_exfiltration_detected

UNION ALL

SELECT
    uuid() as alert_id,
    pattern_name,
    severity,
    scanner_ip as user_id,
    total_connections as event_count,
    concat('Reconnaissance Scan: ', CAST(total_connections AS STRING), ' connections to ',
           CAST(unique_targets AS STRING), ' hosts across ',
           CAST(unique_ports AS STRING), ' ports') as description,
    struct(unique_targets, unique_ports, scanned_ports, scanned_hosts) as details,
    window_start,
    window_end,
    current_timestamp() as created_at,
    'new' as status
FROM live.reconnaissance_scan_detected;
'''

def create_dlt_pipeline():
    """Generate complete Delta Live Tables pipeline"""
    pipeline = '''
-- ============================================================
-- Delta Live Tables Pipeline: CEP Pattern Detection
-- ============================================================
-- Real-time complex event processing for threat detection
-- ============================================================

'''

    # Add each pattern
    for pattern in CEP_PATTERNS:
        pipeline += f"-- Pattern: {pattern['name']}\n"
        pipeline += f"-- {pattern['description']}\n"
        pipeline += f"-- Severity: {pattern['severity']}, Window: {pattern['time_window']}\n"
        pipeline += pattern['dlt_query']
        pipeline += "\n\n"

    # Add alert generation
    pipeline += ALERT_GENERATION_DLT

    return pipeline

def create_dlt_config():
    """Generate Databricks DLT pipeline configuration"""
    config = {
        "name": "SIEM_CEP_Pattern_Detection",
        "storage": "/mnt/siem/dlt/cep",
        "target": "siem",
        "continuous": True,
        "libraries": [
            {
                "notebook": {
                    "path": "/Workspace/siem/dlt/cep_pipeline"
                }
            }
        ],
        "clusters": [
            {
                "label": "default",
                "num_workers": 2,
                "spark_conf": {
                    "spark.databricks.delta.preview.enabled": "true"
                }
            }
        ]
    }

    return config

def generate_structured_streaming_alternative():
    """Generate Structured Streaming version (alternative to DLT)"""
    ss_code = '''
# ============================================================
# Structured Streaming Alternative (if not using DLT)
# ============================================================
# Run this as a Databricks Job for CEP pattern detection
# ============================================================

from pyspark.sql.functions import *
from pyspark.sql.types import *

# Read streaming edges
edges_stream = spark.readStream \\
    .format("delta") \\
    .table("siem.streaming_graph_edges") \\
    .withWatermark("last_event_time", "10 seconds")

# Pattern 1: Lateral Movement
lateral_movement = edges_stream \\
    .filter(col("edge_type") == "lateral_movement") \\
    .filter(col("is_suspicious") == True) \\
    .groupBy(
        window("last_event_time", "5 minutes"),
        "source_vertex_id"
    ) \\
    .agg(
        count("*").alias("movement_count"),
        collect_list("target_vertex_id").alias("accessed_assets"),
        max("confidence_score").alias("max_confidence")
    ) \\
    .filter(col("movement_count") >= 3) \\
    .withColumn("pattern_name", lit("lateral_movement_sequence")) \\
    .withColumn("severity", lit("high"))

# Write to alerts table
lateral_movement.writeStream \\
    .format("delta") \\
    .outputMode("append") \\
    .option("checkpointLocation", "/mnt/siem/checkpoints/cep_lateral") \\
    .table("siem.cep_pattern_matches")

# Pattern 2: Data Exfiltration
data_exfiltration = edges_stream \\
    .filter(col("edge_type") == "data_transfer") \\
    .filter(get_json_object(col("properties"), "$.destination_type") == "external") \\
    .groupBy(
        window("last_event_time", "15 minutes"),
        "source_vertex_id",
        "target_vertex_id"
    ) \\
    .agg(
        sum(get_json_object(col("properties"), "$.bytes_transferred").cast("bigint")).alias("total_bytes"),
        count("*").alias("transfer_count")
    ) \\
    .filter(col("total_bytes") >= 1000000000) \\
    .withColumn("pattern_name", lit("data_exfiltration")) \\
    .withColumn("severity", lit("critical"))

data_exfiltration.writeStream \\
    .format("delta") \\
    .outputMode("append") \\
    .option("checkpointLocation", "/mnt/siem/checkpoints/cep_exfil") \\
    .table("siem.cep_pattern_matches")

print("✅ CEP Structured Streaming jobs started")
'''

    return ss_code

def main():
    """Main execution"""
    print("🚀 Migrating CEP Patterns to Databricks\n")

    # Create output directory
    output_dir = "databricks_migration/dlt"
    os.makedirs(output_dir, exist_ok=True)

    # Generate DLT pipeline
    print("📝 Generating Delta Live Tables pipeline...")
    dlt_sql = create_dlt_pipeline()
    with open(f"{output_dir}/cep_pipeline.sql", 'w') as f:
        f.write(dlt_sql)
    print(f"   ✅ Saved: {output_dir}/cep_pipeline.sql\n")

    # Generate DLT config
    print("📝 Generating DLT configuration...")
    import json
    dlt_config = create_dlt_config()
    with open(f"{output_dir}/cep_pipeline_config.json", 'w') as f:
        json.dump(dlt_config, f, indent=2)
    print(f"   ✅ Saved: {output_dir}/cep_pipeline_config.json\n")

    # Generate Structured Streaming alternative
    print("📝 Generating Structured Streaming alternative...")
    ss_code = generate_structured_streaming_alternative()
    with open(f"{output_dir}/cep_structured_streaming.py", 'w') as f:
        f.write(ss_code)
    print(f"   ✅ Saved: {output_dir}/cep_structured_streaming.py\n")

    # Summary
    print("="*60)
    print("📊 CEP MIGRATION SUMMARY")
    print("="*60)
    print(f"✅ Migrated {len(CEP_PATTERNS)} CEP patterns:")
    for pattern in CEP_PATTERNS:
        print(f"   - {pattern['name']} ({pattern['severity']})")

    print("\n📁 Generated files:")
    print(f"   - {output_dir}/cep_pipeline.sql (Delta Live Tables)")
    print(f"   - {output_dir}/cep_pipeline_config.json (DLT config)")
    print(f"   - {output_dir}/cep_structured_streaming.py (Alternative)")

    print("\n✨ CEP migration complete!")
    print("\n🎯 Next steps:")
    print("1. Review cep_pipeline.sql")
    print("2. Create DLT pipeline in Databricks UI:")
    print("   - Workflows → Delta Live Tables → Create Pipeline")
    print("   - Use cep_pipeline_config.json for settings")
    print("3. OR run cep_structured_streaming.py as Databricks Job")
    print("4. Monitor pattern matches in siem.cep_alerts table")
    print("5. Adjust thresholds based on false positive rate")

if __name__ == "__main__":
    main()

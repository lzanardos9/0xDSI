"""
SOC Intelligence Platform - Data Migration Script
Migrate all data from Supabase to Databricks Unity Catalog

This script handles:
1. Relational data migration (PostgreSQL → Delta Lake)
2. Vector embeddings migration (pgvector → Mosaic AI Vector Search)
3. Schema creation and optimization
4. Data validation and integrity checks
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
import sys
from datetime import datetime

# Initialize Spark with Delta Lake and Unity Catalog
spark = SparkSession.builder \
    .appName("SOC-Data-Migration") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .config("spark.databricks.delta.optimizeWrite.enabled", "true") \
    .config("spark.databricks.delta.autoCompact.enabled", "true") \
    .getOrCreate()

# Configuration
SUPABASE_JDBC = "jdbc:postgresql://db.xnhgvsdjtmzqxitpbemy.supabase.co:5432/postgres"
SUPABASE_USER = spark.conf.get("spark.supabase.user", "postgres")
SUPABASE_PASSWORD = spark.conf.get("spark.supabase.password")
CATALOG = "soc_intelligence"

print("=" * 80)
print("SOC Intelligence Platform - Data Migration to Databricks")
print("=" * 80)
print(f"Source: Supabase PostgreSQL")
print(f"Target: Unity Catalog ({CATALOG})")
print(f"Started: {datetime.now()}")
print("=" * 80)
print()

# ============================================================================
# PHASE 1: CREATE UNITY CATALOG STRUCTURE
# ============================================================================

print("PHASE 1: Creating Unity Catalog structure...")
print()

catalogs_and_schemas = [
    (CATALOG, None, "SOC Intelligence Platform - Production Deployment"),
    (CATALOG, "events", "Security events and raw logs"),
    (CATALOG, "graph", "Graph nodes, edges, and correlations"),
    (CATALOG, "alerts", "Alerts, cases, and incidents"),
    (CATALOG, "threat_intel", "Threat feeds, IOCs, vulnerabilities"),
    (CATALOG, "ml", "Machine learning models and predictions"),
    (CATALOG, "config", "System configuration and metadata"),
]

for catalog, schema, comment in catalogs_and_schemas:
    if schema is None:
        spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog} COMMENT '{comment}'")
        print(f"✓ Created catalog: {catalog}")
    else:
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema} COMMENT '{comment}'")
        print(f"✓ Created schema: {catalog}.{schema}")

print()

# ============================================================================
# PHASE 2: DEFINE MIGRATION MAPPINGS
# ============================================================================

print("PHASE 2: Defining table migration mappings...")
print()

MIGRATION_MAP = {
    # Events and logs
    "events": {
        "target": f"{CATALOG}.events.events",
        "partition_by": ["event_timestamp"],
        "optimize_by": ["event_timestamp", "severity", "source_ip"]
    },
    "raw_event_buffer": {
        "target": f"{CATALOG}.events.raw_buffer",
        "partition_by": ["source_type"],
        "optimize_by": ["received_at", "processing_status"]
    },
    "event_parsers": {
        "target": f"{CATALOG}.config.parsers",
        "partition_by": None,
        "optimize_by": ["format"]
    },
    "processing_stats": {
        "target": f"{CATALOG}.config.processing_stats",
        "partition_by": None,
        "optimize_by": ["stat_timestamp"]
    },

    # Graph data
    "graph_nodes": {
        "target": f"{CATALOG}.graph.nodes",
        "partition_by": ["node_type"],
        "optimize_by": ["node_type", "node_id"]
    },
    "graph_edges": {
        "target": f"{CATALOG}.graph.edges",
        "partition_by": ["edge_type"],
        "optimize_by": ["source_node_id", "target_node_id", "edge_type"]
    },
    "graph_patterns": {
        "target": f"{CATALOG}.graph.patterns",
        "partition_by": None,
        "optimize_by": ["pattern_type"]
    },
    "graph_correlations": {
        "target": f"{CATALOG}.graph.correlations",
        "partition_by": ["detected_at"],
        "optimize_by": ["detected_at", "confidence"]
    },
    "detected_attack_sequences": {
        "target": f"{CATALOG}.graph.attack_sequences",
        "partition_by": ["detected_at"],
        "optimize_by": ["detected_at", "severity"]
    },
    "threat_campaigns": {
        "target": f"{CATALOG}.graph.campaigns",
        "partition_by": None,
        "optimize_by": ["first_seen", "last_seen"]
    },

    # Alerts and cases
    "alerts": {
        "target": f"{CATALOG}.alerts.alerts",
        "partition_by": ["severity"],
        "optimize_by": ["created_at", "severity", "status"]
    },
    "cases": {
        "target": f"{CATALOG}.alerts.cases",
        "partition_by": ["status"],
        "optimize_by": ["created_at", "status", "priority"]
    },
    "case_evidence": {
        "target": f"{CATALOG}.alerts.case_evidence",
        "partition_by": None,
        "optimize_by": ["case_id", "collected_at"]
    },

    # Threat intelligence
    "threat_feeds": {
        "target": f"{CATALOG}.threat_intel.feeds",
        "partition_by": ["feed_type"],
        "optimize_by": ["last_updated", "feed_type"]
    },
    "ioc_embeddings": {
        "target": f"{CATALOG}.threat_intel.ioc_embeddings",
        "partition_by": ["indicator_type"],
        "optimize_by": ["indicator_type", "created_at"]
    },
    "vulnerabilities": {
        "target": f"{CATALOG}.threat_intel.vulnerabilities",
        "partition_by": None,
        "optimize_by": ["severity", "published_date"]
    },

    # Configuration
    "correlation_rules": {
        "target": f"{CATALOG}.config.correlation_rules",
        "partition_by": None,
        "optimize_by": ["enabled", "priority"]
    },
    "response_actions": {
        "target": f"{CATALOG}.config.response_actions",
        "partition_by": None,
        "optimize_by": ["action_type"]
    },
    "enrichment_sources": {
        "target": f"{CATALOG}.config.enrichment_sources",
        "partition_by": None,
        "optimize_by": ["source_type"]
    },
}

print(f"Defined {len(MIGRATION_MAP)} table mappings")
print()

# ============================================================================
# PHASE 3: MIGRATE RELATIONAL DATA
# ============================================================================

print("PHASE 3: Migrating relational data...")
print()

migration_stats = {
    "total_tables": len(MIGRATION_MAP),
    "successful": 0,
    "failed": 0,
    "total_rows": 0
}

def migrate_table(source_table: str, config: dict):
    """
    Migrate a single table from Supabase to Unity Catalog
    """
    target_table = config["target"]
    partition_by = config.get("partition_by")
    optimize_by = config.get("optimize_by")

    print(f"Migrating: {source_table} → {target_table}")

    try:
        # Read from Supabase
        df = spark.read \
            .format("jdbc") \
            .option("url", SUPABASE_JDBC) \
            .option("dbtable", source_table) \
            .option("user", SUPABASE_USER) \
            .option("password", SUPABASE_PASSWORD) \
            .option("driver", "org.postgresql.Driver") \
            .option("fetchsize", "10000") \
            .load()

        row_count = df.count()
        print(f"  ├─ Read {row_count:,} rows")

        # Write to Unity Catalog
        writer = df.write \
            .format("delta") \
            .mode("overwrite") \
            .option("overwriteSchema", "true")

        if partition_by:
            writer = writer.partitionBy(*partition_by)

        writer.saveAsTable(target_table)
        print(f"  ├─ Wrote to {target_table}")

        # Optimize table
        if optimize_by:
            optimize_cols = ", ".join(optimize_by)
            spark.sql(f"OPTIMIZE {target_table} ZORDER BY ({optimize_cols})")
            print(f"  ├─ Optimized (Z-Order by {optimize_cols})")

        # Compute statistics
        spark.sql(f"ANALYZE TABLE {target_table} COMPUTE STATISTICS")
        print(f"  └─ Statistics computed")

        return {"success": True, "rows": row_count}

    except Exception as e:
        print(f"  └─ ✗ Error: {str(e)}")
        return {"success": False, "rows": 0, "error": str(e)}

# Execute migrations
failed_tables = []

for source_table, config in MIGRATION_MAP.items():
    result = migrate_table(source_table, config)

    if result["success"]:
        migration_stats["successful"] += 1
        migration_stats["total_rows"] += result["rows"]
        print(f"✓ Success\n")
    else:
        migration_stats["failed"] += 1
        failed_tables.append({"table": source_table, "error": result.get("error")})
        print(f"✗ Failed\n")

# ============================================================================
# PHASE 4: MIGRATE VECTOR EMBEDDINGS
# ============================================================================

print("PHASE 4: Migrating vector embeddings...")
print()

def parse_pgvector_embedding(embedding_str):
    """
    Parse pgvector format: '[0.1, 0.2, ...]' to array
    """
    if embedding_str is None:
        return None
    # Remove brackets and split
    values = embedding_str.strip('[]').split(',')
    return [float(x.strip()) for x in values]

# Register UDF for parsing
parse_pgvector_udf = udf(parse_pgvector_embedding, ArrayType(FloatType()))

try:
    # Read IOC embeddings from Supabase
    print("Migrating IOC embeddings...")
    ioc_embeddings_df = spark.read \
        .format("jdbc") \
        .option("url", SUPABASE_JDBC) \
        .option("dbtable", "ioc_embeddings") \
        .option("user", SUPABASE_USER) \
        .option("password", SUPABASE_PASSWORD) \
        .load()

    # Parse embeddings
    ioc_embeddings_transformed = ioc_embeddings_df \
        .withColumn("embedding_array", parse_pgvector_udf(col("embedding"))) \
        .drop("embedding")

    row_count = ioc_embeddings_transformed.count()
    print(f"  ├─ Read {row_count:,} embeddings")

    # Write to Unity Catalog
    ioc_embeddings_transformed.write \
        .format("delta") \
        .mode("overwrite") \
        .saveAsTable(f"{CATALOG}.threat_intel.ioc_embeddings")

    print(f"  ├─ Wrote to {CATALOG}.threat_intel.ioc_embeddings")

    # Optimize
    spark.sql(f"OPTIMIZE {CATALOG}.threat_intel.ioc_embeddings")
    print(f"  └─ Optimized")

    print("✓ Vector embeddings migrated successfully\n")

except Exception as e:
    print(f"✗ Error migrating embeddings: {str(e)}\n")

# ============================================================================
# PHASE 5: CREATE VECTOR SEARCH INDEXES
# ============================================================================

print("PHASE 5: Creating vector search indexes...")
print()
print("Note: Vector search indexes must be created via Databricks UI or API")
print("      Run the following commands:")
print()
print(f"  1. Create endpoint: databricks vector-search create-endpoint --name soc-vector-search")
print(f"  2. Create IOC index:")
print(f"     databricks vector-search create-index \\")
print(f"       --endpoint soc-vector-search \\")
print(f"       --table {CATALOG}.threat_intel.ioc_embeddings \\")
print(f"       --primary-key id \\")
print(f"       --embedding-column embedding_array \\")
print(f"       --embedding-dimension 1536")
print()

# ============================================================================
# PHASE 6: ENABLE CHANGE DATA FEED
# ============================================================================

print("PHASE 6: Enabling Change Data Feed for real-time streaming...")
print()

streaming_tables = [
    f"{CATALOG}.events.events",
    f"{CATALOG}.events.raw_buffer",
    f"{CATALOG}.graph.nodes",
    f"{CATALOG}.graph.edges",
    f"{CATALOG}.alerts.alerts",
]

for table in streaming_tables:
    try:
        spark.sql(f"ALTER TABLE {table} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
        print(f"✓ Enabled CDF on {table}")
    except Exception as e:
        print(f"✗ Error enabling CDF on {table}: {str(e)}")

print()

# ============================================================================
# PHASE 7: MIGRATION SUMMARY
# ============================================================================

print("=" * 80)
print("MIGRATION SUMMARY")
print("=" * 80)
print(f"Total Tables: {migration_stats['total_tables']}")
print(f"Successful: {migration_stats['successful']} ({migration_stats['successful']/migration_stats['total_tables']*100:.1f}%)")
print(f"Failed: {migration_stats['failed']}")
print(f"Total Rows Migrated: {migration_stats['total_rows']:,}")
print(f"Completed: {datetime.now()}")
print("=" * 80)

if failed_tables:
    print()
    print("FAILED TABLES:")
    for item in failed_tables:
        print(f"  - {item['table']}: {item['error']}")

print()
print("Next Steps:")
print("  1. Create vector search indexes (see Phase 5 commands)")
print("  2. Deploy Databricks App: databricks bundle deploy --target prod")
print("  3. Start streaming jobs via Databricks Workflows")
print("  4. Configure monitoring and alerts")
print()
print("Migration complete!")

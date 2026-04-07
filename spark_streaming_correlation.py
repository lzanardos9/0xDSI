"""
SOC Intelligence Platform - Spark Streaming Graph Correlation Engine
Production-ready implementation for Databricks with Delta Lake

This module implements real-time graph-based threat detection using:
- Apache Spark Structured Streaming
- GraphX / GraphFrames for graph analytics
- Delta Lake for ACID transactions and time travel
- Spark MLlib for anomaly detection
- PostgreSQL (Supabase) for metadata and results

Architecture:
  Supabase → Delta Lake (Bronze→Silver→Gold) → Spark Streaming →
  GraphX Analytics → Pattern Discovery → ML Detection → Back to Supabase
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql.window import Window
from graphframes import GraphFrame
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.clustering import BisectingKMeans
import json
from datetime import datetime, timedelta

# ============================================================================
# CONFIGURATION
# ============================================================================

# Supabase connection
SUPABASE_JDBC_URL = "jdbc:postgresql://db.xnhgvsdjtmzqxitpbemy.supabase.co:5432/postgres"
SUPABASE_USER = "postgres"
SUPABASE_PASSWORD = "your_password_from_env"  # Load from env in production

# Delta Lake paths
DELTA_LAKE_PATH = "/mnt/delta"
BRONZE_PATH = f"{DELTA_LAKE_PATH}/bronze"
SILVER_PATH = f"{DELTA_LAKE_PATH}/silver"
GOLD_PATH = f"{DELTA_LAKE_PATH}/gold"
CHECKPOINT_PATH = f"{DELTA_LAKE_PATH}/checkpoints"

# Processing configuration
MICRO_BATCH_DURATION = "30 seconds"
TUMBLING_WINDOW = "5 minutes"
SLIDING_WINDOW_SIZE = "15 minutes"
SLIDING_WINDOW_SLIDE = "5 minutes"
WATERMARK_DELAY = "2 minutes"

# ============================================================================
# SPARK SESSION INITIALIZATION
# ============================================================================

def create_spark_session():
    """
    Initialize Spark session with Delta Lake and GraphFrames support
    """
    spark = SparkSession.builder \
        .appName("SOC-Streaming-Correlation") \
        .config("spark.jars.packages",
                "io.delta:delta-core_2.12:2.4.0,"
                "graphframes:graphframes:0.8.2-spark3.2-s_2.12") \
        .config("spark.sql.extensions",
                "io.delta.sql.DeltaSparkSessionExtension") \
        .config("spark.sql.catalog.spark_catalog",
                "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
        .config("spark.databricks.delta.optimizeWrite.enabled", "true") \
        .config("spark.databricks.delta.autoCompact.enabled", "true") \
        .config("spark.sql.shuffle.partitions", "200") \
        .config("spark.default.parallelism", "400") \
        .getOrCreate()

    spark.sparkContext.setLogLevel("WARN")
    return spark

# ============================================================================
# STREAM 1: EVENT INGESTION & NORMALIZATION
# ============================================================================

def ingest_from_supabase(spark):
    """
    Read events from Supabase and write to Delta Lake Bronze layer
    Uses JDBC streaming (simulated batch reads) or REST API
    """
    # Define schema for raw events
    raw_event_schema = StructType([
        StructField("id", StringType(), False),
        StructField("source_id", StringType(), False),
        StructField("source_type", StringType(), False),
        StructField("source_ip", StringType(), True),
        StructField("raw_data", StringType(), False),
        StructField("raw_text", StringType(), True),
        StructField("received_at", TimestampType(), False),
        StructField("processing_status", StringType(), False),
        StructField("metadata", StringType(), True)
    ])

    # Read from Supabase (batch mode, triggered frequently)
    # In production, use Kafka/Kinesis for true streaming
    raw_events = spark.read \
        .format("jdbc") \
        .option("url", SUPABASE_JDBC_URL) \
        .option("dbtable", "(SELECT * FROM raw_event_buffer WHERE processing_status = 'pending' ORDER BY received_at LIMIT 10000) as events") \
        .option("user", SUPABASE_USER) \
        .option("password", SUPABASE_PASSWORD) \
        .load()

    # Write to Bronze layer
    raw_events.write \
        .format("delta") \
        .mode("append") \
        .partitionBy("source_type") \
        .save(f"{BRONZE_PATH}/raw_events")

    return raw_events


def normalize_to_ocsf(spark):
    """
    Parse and normalize events from Bronze to Silver (OCSF format)
    """
    # Read from Bronze
    bronze_stream = spark.readStream \
        .format("delta") \
        .option("maxFilesPerTrigger", 100) \
        .load(f"{BRONZE_PATH}/raw_events")

    # Parse JSON raw_data
    parsed_schema = StructType([
        StructField("timestamp", TimestampType()),
        StructField("event_type", StringType()),
        StructField("severity", StringType()),
        StructField("source_ip", StringType()),
        StructField("dest_ip", StringType()),
        StructField("username", StringType()),
        StructField("message", StringType())
    ])

    normalized = bronze_stream \
        .withColumn("parsed", from_json(col("raw_data"), parsed_schema)) \
        .select(
            col("id").alias("event_id"),
            coalesce(col("parsed.timestamp"), col("received_at")).alias("event_timestamp"),
            col("parsed.event_type"),
            lower(col("parsed.severity")).alias("severity"),
            col("parsed.source_ip"),
            col("parsed.dest_ip"),
            col("parsed.username"),
            col("parsed.message").alias("description"),
            col("raw_data"),
            struct(
                col("source_id"),
                col("source_type"),
                lit("ocsf_1.0.0").alias("schema_version")
            ).alias("metadata"),
            current_timestamp().alias("normalized_at")
        ) \
        .filter(col("event_type").isNotNull())

    # Write to Silver layer
    query = normalized.writeStream \
        .format("delta") \
        .outputMode("append") \
        .option("checkpointLocation", f"{CHECKPOINT_PATH}/silver_events") \
        .partitionBy("event_type") \
        .start(f"{SILVER_PATH}/events")

    return query

# ============================================================================
# STREAM 2: GRAPH CONSTRUCTION
# ============================================================================

def extract_graph_nodes(events_df):
    """
    Extract entity nodes from events
    Returns DataFrame with columns: node_id, node_type, properties
    """
    # Extract IP address nodes (source)
    source_ips = events_df \
        .filter(col("source_ip").isNotNull()) \
        .select(
            col("source_ip").alias("node_id"),
            lit("ip_address").alias("node_type"),
            struct(
                col("event_timestamp").alias("first_seen"),
                col("event_timestamp").alias("last_seen"),
                col("severity"),
                lit(1).alias("event_count")
            ).alias("properties")
        )

    # Extract IP address nodes (destination)
    dest_ips = events_df \
        .filter(col("dest_ip").isNotNull()) \
        .select(
            col("dest_ip").alias("node_id"),
            lit("ip_address").alias("node_type"),
            struct(
                col("event_timestamp").alias("first_seen"),
                col("event_timestamp").alias("last_seen"),
                col("severity"),
                lit(1).alias("event_count")
            ).alias("properties")
        )

    # Extract user nodes
    users = events_df \
        .filter(col("username").isNotNull()) \
        .select(
            col("username").alias("node_id"),
            lit("user").alias("node_type"),
            struct(
                col("event_timestamp").alias("first_seen"),
                col("event_timestamp").alias("last_seen"),
                col("severity"),
                lit(1).alias("event_count")
            ).alias("properties")
        )

    # Union all nodes and aggregate
    all_nodes = source_ips.union(dest_ips).union(users)

    aggregated_nodes = all_nodes \
        .groupBy("node_id", "node_type") \
        .agg(
            min(col("properties.first_seen")).alias("first_seen"),
            max(col("properties.last_seen")).alias("last_seen"),
            count("*").alias("event_count"),
            max(col("properties.severity")).alias("max_severity"),
            collect_set(col("properties.severity")).alias("severity_values")
        ) \
        .withColumn("risk_score",
            when(col("max_severity") == "critical", 90)
            .when(col("max_severity") == "high", 70)
            .when(col("max_severity") == "medium", 50)
            .when(col("max_severity") == "low", 30)
            .otherwise(10)
        ) \
        .withColumn("properties",
            to_json(struct(
                col("first_seen"),
                col("last_seen"),
                col("event_count"),
                col("max_severity"),
                col("risk_score")
            ))
        ) \
        .select("node_id", "node_type", "properties", "risk_score", "first_seen", "last_seen", "event_count")

    return aggregated_nodes


def extract_graph_edges(events_df):
    """
    Extract relationship edges from events
    Returns DataFrame with columns: src, dst, relationship, weight, properties
    """
    # Connection edges (IP to IP)
    connections = events_df \
        .filter(col("source_ip").isNotNull() & col("dest_ip").isNotNull()) \
        .select(
            col("source_ip").alias("src"),
            col("dest_ip").alias("dst"),
            lit("CONNECTS_TO").alias("relationship"),
            col("event_timestamp"),
            col("severity"),
            col("event_id")
        )

    # Authentication edges (User to IP)
    authentications = events_df \
        .filter(
            col("username").isNotNull() &
            col("source_ip").isNotNull() &
            col("event_type").isin(["authentication_success", "authentication_failure", "login", "ssh_login"])
        ) \
        .select(
            col("username").alias("src"),
            col("source_ip").alias("dst"),
            lit("AUTHENTICATES_AS").alias("relationship"),
            col("event_timestamp"),
            col("severity"),
            col("event_id")
        )

    # Union all edges
    all_edges = connections.union(authentications)

    # Aggregate edges
    aggregated_edges = all_edges \
        .groupBy("src", "dst", "relationship") \
        .agg(
            count("*").alias("weight"),
            min("event_timestamp").alias("first_seen"),
            max("event_timestamp").alias("last_seen"),
            max("severity").alias("max_severity"),
            expr("percentile_approx((unix_timestamp(event_timestamp) - unix_timestamp(lag(event_timestamp) OVER (PARTITION BY src, dst ORDER BY event_timestamp))) / 60, 0.5)").alias("median_interval_minutes"),
            collect_list("event_id").alias("event_ids")
        ) \
        .withColumn("confidence",
            when(col("weight") > 100, 0.95)
            .when(col("weight") > 50, 0.85)
            .when(col("weight") > 10, 0.70)
            .otherwise(0.50)
        ) \
        .withColumn("properties",
            to_json(struct(
                col("first_seen"),
                col("last_seen"),
                col("max_severity"),
                col("median_interval_minutes"),
                col("confidence")
            ))
        )

    return aggregated_edges


def build_streaming_graph(spark):
    """
    Build graph continuously from streaming events
    """
    # Read from Silver layer
    events_stream = spark.readStream \
        .format("delta") \
        .load(f"{SILVER_PATH}/events")

    # Apply windowing (5-minute tumbling windows)
    windowed_events = events_stream \
        .withWatermark("event_timestamp", WATERMARK_DELAY) \
        .groupBy(
            window("event_timestamp", TUMBLING_WINDOW),
            "event_id", "event_type", "event_timestamp",
            "source_ip", "dest_ip", "username", "severity"
        ) \
        .agg(
            count("*").alias("occurrence_count")
        ) \
        .select("event_id", "event_type", "event_timestamp",
                "source_ip", "dest_ip", "username", "severity")

    # Process each window batch
    def process_graph_batch(batch_df, batch_id):
        if batch_df.isEmpty():
            return

        print(f"Processing batch {batch_id} with {batch_df.count()} events")

        # Extract nodes
        nodes = extract_graph_nodes(batch_df)
        nodes.write \
            .format("delta") \
            .mode("append") \
            .save(f"{GOLD_PATH}/graph_nodes")

        # Write to Supabase
        nodes.write \
            .format("jdbc") \
            .option("url", SUPABASE_JDBC_URL) \
            .option("dbtable", "graph_nodes") \
            .option("user", SUPABASE_USER) \
            .option("password", SUPABASE_PASSWORD) \
            .mode("append") \
            .save()

        # Extract edges
        edges = extract_graph_edges(batch_df)
        edges.write \
            .format("delta") \
            .mode("append") \
            .save(f"{GOLD_PATH}/graph_edges")

        # Write to Supabase
        edges.write \
            .format("jdbc") \
            .option("url", SUPABASE_JDBC_URL) \
            .option("dbtable", "graph_edges") \
            .option("user", SUPABASE_USER) \
            .option("password", SUPABASE_PASSWORD) \
            .mode("append") \
            .save()

        print(f"Batch {batch_id} complete: {nodes.count()} nodes, {edges.count()} edges")

    query = windowed_events.writeStream \
        .foreachBatch(process_graph_batch) \
        .option("checkpointLocation", f"{CHECKPOINT_PATH}/graph_construction") \
        .trigger(processingTime="5 minutes") \
        .start()

    return query

# ============================================================================
# STREAM 3: GRAPH ANALYTICS (GraphX Algorithms)
# ============================================================================

def run_graph_analytics(spark):
    """
    Execute graph algorithms on the latest graph snapshot
    """
    print("Running graph analytics...")

    # Load latest graph
    nodes = spark.read.format("delta").load(f"{GOLD_PATH}/graph_nodes")
    edges = spark.read.format("delta").load(f"{GOLD_PATH}/graph_edges")

    # Create GraphFrame
    graph = GraphFrame(nodes, edges)

    print(f"Graph loaded: {nodes.count()} nodes, {edges.count()} edges")

    # Algorithm 1: PageRank - Identify important/targeted nodes
    print("Running PageRank...")
    pagerank_result = graph.pageRank(resetProbability=0.15, maxIter=10)
    important_nodes = pagerank_result.vertices \
        .orderBy(desc("pagerank")) \
        .limit(100)

    important_nodes.write \
        .format("delta") \
        .mode("overwrite") \
        .save(f"{GOLD_PATH}/analytics/pagerank")

    # Algorithm 2: Connected Components - Find attack clusters
    print("Running Connected Components...")
    components = graph.connectedComponents()

    components.write \
        .format("delta") \
        .mode("overwrite") \
        .save(f"{GOLD_PATH}/analytics/components")

    # Algorithm 3: Label Propagation - Community detection
    print("Running Label Propagation...")
    communities = graph.labelPropagation(maxIter=5)

    communities.write \
        .format("delta") \
        .mode("overwrite") \
        .save(f"{GOLD_PATH}/analytics/communities")

    # Algorithm 4: Triangle Count - Detect complex relationships
    print("Running Triangle Count...")
    triangles = graph.triangleCount()

    triangles.write \
        .format("delta") \
        .mode("overwrite") \
        .save(f"{GOLD_PATH}/analytics/triangles")

    print("Graph analytics complete")

    return {
        "important_nodes": important_nodes.count(),
        "components": components.select("component").distinct().count(),
        "communities": communities.select("label").distinct().count()
    }

# ============================================================================
# STREAM 4: PATTERN DISCOVERY (Motif Finding)
# ============================================================================

def detect_attack_patterns(spark):
    """
    Use motif finding to detect attack patterns
    """
    print("Detecting attack patterns...")

    # Load graph
    nodes = spark.read.format("delta").load(f"{GOLD_PATH}/graph_nodes")
    edges = spark.read.format("delta").load(f"{GOLD_PATH}/graph_edges")
    graph = GraphFrame(nodes, edges)

    # Pattern 1: Lateral Movement (3-hop)
    print("Detecting lateral movement...")
    lateral_movement = graph.find(
        "(user)-[auth]->(host1); (host1)-[conn1]->(host2); (host2)-[conn2]->(host3)"
    ).filter(
        "auth.relationship = 'AUTHENTICATES_AS' AND " +
        "conn1.relationship = 'CONNECTS_TO' AND " +
        "conn2.relationship = 'CONNECTS_TO' AND " +
        "user.node_type = 'user'"
    ).select(
        lit("lateral_movement_3_hop").alias("pattern_name"),
        concat_ws(" -> ", col("user.node_id"), col("host1.node_id"),
                  col("host2.node_id"), col("host3.node_id")).alias("attack_path"),
        array(col("user.node_id"), col("host1.node_id"),
              col("host2.node_id"), col("host3.node_id")).alias("path_nodes"),
        lit(3).alias("hop_count"),
        lit("high").alias("severity"),
        lit(0.85).alias("confidence")
    )

    if not lateral_movement.isEmpty():
        lateral_movement.write \
            .format("delta") \
            .mode("append") \
            .save(f"{GOLD_PATH}/patterns/lateral_movement")

        print(f"Lateral movement patterns detected: {lateral_movement.count()}")

    # Pattern 2: Brute Force
    print("Detecting brute force...")
    brute_force = edges.filter(
        (col("relationship") == "AUTHENTICATES_AS") &
        (col("weight") > 10) &
        (col("max_severity").isin(["high", "critical"]))
    ).select(
        lit("brute_force_authentication").alias("pattern_name"),
        col("src").alias("attacker"),
        col("dst").alias("target"),
        col("weight").alias("attempt_count"),
        lit("high").alias("severity"),
        lit(0.90).alias("confidence")
    )

    if not brute_force.isEmpty():
        brute_force.write \
            .format("delta") \
            .mode("append") \
            .save(f"{GOLD_PATH}/patterns/brute_force")

        print(f"Brute force patterns detected: {brute_force.count()}")

    print("Pattern discovery complete")

# ============================================================================
# STREAM 5: ML ANOMALY DETECTION
# ============================================================================

def ml_anomaly_detection(spark):
    """
    Use Spark MLlib for anomaly detection based on graph features
    """
    print("Running ML anomaly detection...")

    # Load node data
    nodes = spark.read.format("delta").load(f"{GOLD_PATH}/graph_nodes")
    pagerank = spark.read.format("delta").load(f"{GOLD_PATH}/analytics/pagerank")

    # Feature engineering
    features_df = nodes.join(pagerank, "node_id", "left") \
        .select(
            "node_id",
            "node_type",
            col("event_count").cast("double"),
            col("risk_score").cast("double"),
            coalesce(col("pagerank"), lit(0.0)).cast("double").alias("pagerank")
        ) \
        .fillna(0.0)

    # Vector assembly
    assembler = VectorAssembler(
        inputCols=["event_count", "risk_score", "pagerank"],
        outputCol="features"
    )

    feature_vectors = assembler.transform(features_df)

    # Clustering
    kmeans = BisectingKMeans(k=10, seed=1, featuresCol="features")
    model = kmeans.fit(feature_vectors)

    # Predictions
    predictions = model.transform(feature_vectors)

    # Identify anomalies (outlier clusters)
    cluster_sizes = predictions.groupBy("prediction").count()
    small_clusters = cluster_sizes.filter(col("count") < 5).select("prediction")

    anomalies = predictions.join(small_clusters, "prediction") \
        .select(
            "node_id",
            "node_type",
            "event_count",
            "risk_score",
            "pagerank",
            "prediction",
            lit(0.75).alias("anomaly_score")
        )

    anomalies.write \
        .format("delta") \
        .mode("overwrite") \
        .save(f"{GOLD_PATH}/ml/anomalies")

    print(f"Anomalies detected: {anomalies.count()}")

    return anomalies.count()

# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def main():
    """
    Main orchestration function - start all streaming jobs
    """
    print("=" * 80)
    print("SOC Intelligence Platform - Spark Streaming Correlation Engine")
    print("=" * 80)

    # Initialize Spark
    spark = create_spark_session()

    # Start Stream 1: Normalization
    print("\n[STREAM 1] Starting event normalization stream...")
    normalization_query = normalize_to_ocsf(spark)

    # Start Stream 2: Graph construction
    print("\n[STREAM 2] Starting graph construction stream...")
    graph_query = build_streaming_graph(spark)

    # Batch processing loop (every 5 minutes)
    import time

    while True:
        try:
            print("\n" + "=" * 80)
            print(f"Batch processing cycle started at {datetime.now()}")
            print("=" * 80)

            # Stream 3: Graph analytics
            print("\n[STREAM 3] Running graph analytics...")
            analytics_results = run_graph_analytics(spark)
            print(f"Analytics results: {analytics_results}")

            # Stream 4: Pattern discovery
            print("\n[STREAM 4] Running pattern discovery...")
            detect_attack_patterns(spark)

            # Stream 5: ML anomaly detection
            print("\n[STREAM 5] Running ML anomaly detection...")
            anomaly_count = ml_anomaly_detection(spark)
            print(f"Anomalies detected: {anomaly_count}")

            print("\n" + "=" * 80)
            print(f"Batch processing cycle completed at {datetime.now()}")
            print("Sleeping for 5 minutes...")
            print("=" * 80)

            # Wait 5 minutes
            time.sleep(300)

        except KeyboardInterrupt:
            print("\nShutting down gracefully...")
            break
        except Exception as e:
            print(f"\nError in processing cycle: {e}")
            import traceback
            traceback.print_exc()
            print("Waiting 60 seconds before retry...")
            time.sleep(60)

    # Stop streaming queries
    print("\nStopping streaming queries...")
    normalization_query.stop()
    graph_query.stop()

    spark.stop()
    print("Spark session stopped. Goodbye!")


if __name__ == "__main__":
    main()

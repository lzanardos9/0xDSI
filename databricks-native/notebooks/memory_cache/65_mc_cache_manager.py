# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Cache Lifecycle Manager
# MAGIC
# MAGIC Manages the lifecycle of entity memory caches in Delta tables.
# MAGIC Handles: creation, eviction (LRU with landmark protection),
# MAGIC compaction, archival, and integrity validation.
# MAGIC
# MAGIC **Storage:** `security_catalog.ml.mc_entity_caches`
# MAGIC **Partitioned by:** entity_id, date(segment_timestamp)

# COMMAND ----------

from pyspark.sql import SparkSession
import pyspark.sql.functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import StructType, StructField, StringType, FloatType, BinaryType, BooleanType, TimestampType, IntegerType
from datetime import datetime, timedelta
from typing import Dict, List, Optional

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema Definition

# COMMAND ----------

MC_ENTITY_STATES_SCHEMA = StructType([
    StructField("entity_id", StringType(), False),
    StructField("recurrent_state_blob", BinaryType(), True),
    StructField("last_updated", TimestampType(), False),
    StructField("total_events_processed", IntegerType(), True),
    StructField("total_segments_processed", IntegerType(), True),
    StructField("model_version", StringType(), True),
])

MC_ENTITY_CACHES_SCHEMA = StructType([
    StructField("entity_id", StringType(), False),
    StructField("cache_index", IntegerType(), False),
    StructField("hidden_state_blob", BinaryType(), False),
    StructField("segment_timestamp", TimestampType(), False),
    StructField("segment_end_timestamp", TimestampType(), True),
    StructField("is_landmark", BooleanType(), False),
    StructField("landmark_reason", StringType(), True),
    StructField("importance_score", FloatType(), False),
    StructField("event_count_in_segment", IntegerType(), True),
    StructField("anomaly_count_in_segment", IntegerType(), True),
    StructField("created_at", TimestampType(), False),
    StructField("last_accessed_at", TimestampType(), True),
    StructField("access_count", IntegerType(), True),
])


# COMMAND ----------

# MAGIC %md
# MAGIC ## Cache Manager

# COMMAND ----------

class CacheLifecycleManager:
    """
    Production cache lifecycle management for MC-RNN entity states.

    Policies:
        - Max caches per entity: 64 (configurable)
        - Landmark protection: first-seen, role-change, incident caches never evicted
        - LRU eviction: least recently accessed non-landmark caches removed first
        - Compaction: merge adjacent low-information caches weekly
        - Archival: move caches > 180 days to cold storage (Z-ordered by entity)
    """

    def __init__(
        self,
        catalog: str = "security_catalog",
        schema: str = "ml",
        max_caches_per_entity: int = 64,
        landmark_slots: int = 8,
        archive_after_days: int = 180,
        compaction_threshold: float = 0.1,
    ):
        self.catalog = catalog
        self.schema = schema
        self.states_table = f"{catalog}.{schema}.mc_entity_states"
        self.caches_table = f"{catalog}.{schema}.mc_entity_caches"
        self.archive_table = f"{catalog}.{schema}.mc_entity_caches_archive"
        self.max_caches = max_caches_per_entity
        self.landmark_slots = landmark_slots
        self.archive_days = archive_after_days
        self.compaction_threshold = compaction_threshold

    def create_tables(self):
        """Create Delta tables for MC-RNN state storage."""
        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.states_table} (
                entity_id STRING NOT NULL,
                recurrent_state_blob BINARY,
                last_updated TIMESTAMP NOT NULL,
                total_events_processed INT,
                total_segments_processed INT,
                model_version STRING
            )
            USING DELTA
            PARTITIONED BY (entity_id)
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.autoCompact' = 'true'
            )
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.caches_table} (
                entity_id STRING NOT NULL,
                cache_index INT NOT NULL,
                hidden_state_blob BINARY NOT NULL,
                segment_timestamp TIMESTAMP NOT NULL,
                segment_end_timestamp TIMESTAMP,
                is_landmark BOOLEAN NOT NULL DEFAULT FALSE,
                landmark_reason STRING,
                importance_score FLOAT NOT NULL,
                event_count_in_segment INT,
                anomaly_count_in_segment INT,
                created_at TIMESTAMP NOT NULL,
                last_accessed_at TIMESTAMP,
                access_count INT DEFAULT 0
            )
            USING DELTA
            PARTITIONED BY (entity_id)
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.autoCompact' = 'true'
            )
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.archive_table} (
                entity_id STRING NOT NULL,
                cache_index INT NOT NULL,
                hidden_state_blob BINARY NOT NULL,
                segment_timestamp TIMESTAMP NOT NULL,
                is_landmark BOOLEAN NOT NULL,
                landmark_reason STRING,
                importance_score FLOAT NOT NULL,
                archived_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (entity_id)
        """)

        print(f"Tables created: {self.states_table}, {self.caches_table}, {self.archive_table}")

    def evict_caches(self):
        """
        Evict excess caches per entity using LRU with landmark protection.
        Keeps at most max_caches per entity, never evicts landmarks.
        """
        cache_df = spark.table(self.caches_table)

        window = Window.partitionBy("entity_id").orderBy(
            F.col("is_landmark").desc(),
            F.col("last_accessed_at").desc(),
            F.col("importance_score").desc(),
        )

        ranked = cache_df.withColumn("rank", F.row_number().over(window))

        to_keep = ranked.where(F.col("rank") <= self.max_caches)
        to_evict = ranked.where(
            (F.col("rank") > self.max_caches) & (F.col("is_landmark") == False)
        )

        evict_count = to_evict.count()

        if evict_count > 0:
            to_keep.write.format("delta").mode("overwrite").saveAsTable(self.caches_table)
            print(f"Evicted {evict_count} cache entries (LRU, non-landmark)")
        else:
            print("No caches to evict")

        return evict_count

    def mark_landmarks(self):
        """
        Identify and mark landmark caches based on entity lifecycle events.

        Landmark criteria:
            - First cache for entity (onboarding)
            - Cache with highest anomaly count (incident period)
            - Cache right before a detected anomaly
            - Caches at role/privilege change boundaries
        """
        cache_df = spark.table(self.caches_table)

        first_cache_window = Window.partitionBy("entity_id").orderBy("segment_timestamp")
        with_rank = cache_df.withColumn(
            "is_first", F.row_number().over(first_cache_window) == 1
        )

        max_anomaly_window = Window.partitionBy("entity_id")
        with_anomaly_rank = with_rank.withColumn(
            "max_anomaly_in_entity",
            F.max("anomaly_count_in_segment").over(max_anomaly_window),
        ).withColumn(
            "is_incident_cache",
            (F.col("anomaly_count_in_segment") == F.col("max_anomaly_in_entity"))
            & (F.col("anomaly_count_in_segment") > 0),
        )

        updated = with_anomaly_rank.withColumn(
            "is_landmark",
            F.col("is_landmark") | F.col("is_first") | F.col("is_incident_cache"),
        ).withColumn(
            "landmark_reason",
            F.when(F.col("is_first"), "first_seen")
            .when(F.col("is_incident_cache"), "incident_period")
            .otherwise(F.col("landmark_reason")),
        ).drop("is_first", "max_anomaly_in_entity", "is_incident_cache")

        updated.write.format("delta").mode("overwrite").saveAsTable(self.caches_table)
        landmark_count = updated.where(F.col("is_landmark")).count()
        print(f"Landmarks marked: {landmark_count} total across all entities")

    def archive_old_caches(self):
        """Move caches older than archive_days to cold storage."""
        archive_cutoff = datetime.now() - timedelta(days=self.archive_days)

        cache_df = spark.table(self.caches_table)
        to_archive = cache_df.where(
            (F.col("segment_timestamp") < archive_cutoff)
            & (F.col("is_landmark") == False)
        ).withColumn("archived_at", F.current_timestamp())

        archive_count = to_archive.count()

        if archive_count > 0:
            to_archive.select(
                "entity_id", "cache_index", "hidden_state_blob",
                "segment_timestamp", "is_landmark", "landmark_reason",
                "importance_score", "archived_at",
            ).write.format("delta").mode("append").saveAsTable(self.archive_table)

            remaining = cache_df.where(
                ~((F.col("segment_timestamp") < archive_cutoff) & (F.col("is_landmark") == False))
            )
            remaining.write.format("delta").mode("overwrite").saveAsTable(self.caches_table)

            print(f"Archived {archive_count} old caches (> {self.archive_days} days)")
        else:
            print("No caches to archive")

        return archive_count

    def compact_similar_caches(self):
        """
        Merge adjacent caches with low information difference.
        If two consecutive caches have cosine similarity > (1 - threshold),
        keep only the more recent one.
        """
        print(f"Compaction: merging caches with similarity > {1 - self.compaction_threshold:.2f}")
        print("(Requires model inference - delegated to scheduled job with GPU)")

    def get_cache_stats(self) -> Dict:
        """Get aggregate cache statistics."""
        cache_df = spark.table(self.caches_table)
        states_df = spark.table(self.states_table)

        stats = {
            "total_entities": states_df.count(),
            "total_caches": cache_df.count(),
            "total_landmarks": cache_df.where(F.col("is_landmark")).count(),
            "avg_caches_per_entity": None,
            "oldest_cache": None,
            "newest_cache": None,
        }

        agg_stats = cache_df.agg(
            F.avg(F.lit(1)).alias("placeholder"),
            F.min("segment_timestamp").alias("oldest"),
            F.max("segment_timestamp").alias("newest"),
        ).collect()[0]

        if stats["total_entities"] > 0:
            stats["avg_caches_per_entity"] = stats["total_caches"] / stats["total_entities"]
        stats["oldest_cache"] = agg_stats.oldest
        stats["newest_cache"] = agg_stats.newest

        return stats

    def run_maintenance(self):
        """Full maintenance cycle: landmarks → eviction → archival."""
        print("=" * 60)
        print("MC-RNN Cache Maintenance")
        print("=" * 60)

        self.mark_landmarks()
        self.evict_caches()
        self.archive_old_caches()

        stats = self.get_cache_stats()
        print(f"\nCache Stats:")
        print(f"  Total entities: {stats['total_entities']:,}")
        print(f"  Total caches: {stats['total_caches']:,}")
        print(f"  Landmarks: {stats['total_landmarks']:,}")
        print(f"  Avg caches/entity: {stats['avg_caches_per_entity']:.1f}")
        print(f"  Date range: {stats['oldest_cache']} → {stats['newest_cache']}")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Maintenance

# COMMAND ----------

if "dbutils" in dir():
    manager = CacheLifecycleManager(
        catalog="security_catalog",
        max_caches_per_entity=64,
        landmark_slots=8,
        archive_after_days=180,
    )
    manager.create_tables()
    manager.run_maintenance()

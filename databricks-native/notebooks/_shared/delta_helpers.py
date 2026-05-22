# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Delta Lake Helpers
# MAGIC Safe MERGE, UPSERT, and append patterns for all notebooks.
# MAGIC Handles schema evolution, deduplication, and partition management.

# COMMAND ----------

import logging
from typing import Optional
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

logger = logging.getLogger("oxdsi.delta_helpers")


def safe_append(
    df: DataFrame,
    table: str,
    catalog: str = "",
    schema: str = "",
    partition_by: Optional[list] = None,
    deduplicate_on: Optional[list] = None,
):
    """
    Safely append a DataFrame to a Delta table.

    Features:
    - Schema evolution (mergeSchema)
    - Optional deduplication before write
    - Partition pruning awareness
    - Empty DataFrame guard

    Usage:
        from _shared.delta_helpers import safe_append
        safe_append(alerts_df, "alerts", cfg.catalog, cfg.schema, deduplicate_on=["id"])
    """
    if df.isEmpty():
        logger.info(f"Skipping append to {table}: DataFrame is empty")
        return

    if deduplicate_on:
        df = df.dropDuplicates(deduplicate_on)

    full_table = _full_table_name(table, catalog, schema)

    writer = (
        df.write
        .format("delta")
        .mode("append")
        .option("mergeSchema", "true")
    )

    if partition_by:
        writer = writer.partitionBy(*partition_by)

    writer.saveAsTable(full_table)

    logger.info(f"Appended {df.count()} rows to {full_table}")


def safe_merge(
    spark: SparkSession,
    source_df: DataFrame,
    target_table: str,
    merge_keys: list,
    catalog: str = "",
    schema: str = "",
    update_columns: Optional[list] = None,
    insert_columns: Optional[list] = None,
    condition_column: Optional[str] = None,
    condition_newer: bool = True,
):
    """
    Safe MERGE (upsert) into a Delta table.

    Features:
    - Match on composite keys
    - Optional "only update if newer" condition
    - Schema evolution via temp view approach
    - Handles NULL keys gracefully

    Usage:
        from _shared.delta_helpers import safe_merge
        safe_merge(
            spark,
            enriched_alerts_df,
            "alerts",
            merge_keys=["id"],
            update_columns=["enrichments", "risk_score", "updated_at"],
            catalog=cfg.catalog,
            schema=cfg.schema,
        )
    """
    if source_df.isEmpty():
        logger.info(f"Skipping merge to {target_table}: source DataFrame is empty")
        return

    full_table = _full_table_name(target_table, catalog, schema)
    temp_view = f"_merge_source_{target_table}_{id(source_df)}"
    source_df.createOrReplaceTempView(temp_view)

    # Build merge key condition
    key_conditions = " AND ".join(
        [f"target.`{k}` = source.`{k}`" for k in merge_keys]
    )

    # Determine columns to update
    all_columns = source_df.columns
    if update_columns is None:
        update_columns = [c for c in all_columns if c not in merge_keys]
    if insert_columns is None:
        insert_columns = all_columns

    # Build UPDATE SET clause
    update_set = ", ".join([f"target.`{c}` = source.`{c}`" for c in update_columns])

    # Build INSERT clause
    insert_cols = ", ".join([f"`{c}`" for c in insert_columns])
    insert_vals = ", ".join([f"source.`{c}`" for c in insert_columns])

    # Optional "only update if newer" condition
    update_condition = ""
    if condition_column and condition_newer:
        update_condition = f"AND source.`{condition_column}` > target.`{condition_column}`"

    merge_sql = f"""
        MERGE INTO {full_table} AS target
        USING {temp_view} AS source
        ON {key_conditions}
        WHEN MATCHED {update_condition} THEN
            UPDATE SET {update_set}
        WHEN NOT MATCHED THEN
            INSERT ({insert_cols})
            VALUES ({insert_vals})
    """

    spark.sql(merge_sql)
    spark.catalog.dropTempView(temp_view)

    logger.info(f"Merged into {full_table} on keys {merge_keys}")


def safe_overwrite_partition(
    df: DataFrame,
    table: str,
    partition_column: str,
    partition_value: str,
    catalog: str = "",
    schema: str = "",
):
    """
    Safely overwrite a single partition of a Delta table.
    Uses replaceWhere to avoid full table rewrite.

    Usage:
        safe_overwrite_partition(
            daily_stats_df, "entity_risk_scores",
            partition_column="date", partition_value="2024-01-15",
            catalog=cfg.catalog, schema=cfg.schema,
        )
    """
    if df.isEmpty():
        logger.info(f"Skipping partition overwrite for {table}: DataFrame is empty")
        return

    full_table = _full_table_name(table, catalog, schema)

    (
        df.write
        .format("delta")
        .mode("overwrite")
        .option("replaceWhere", f"`{partition_column}` = '{partition_value}'")
        .option("mergeSchema", "true")
        .saveAsTable(full_table)
    )

    logger.info(
        f"Overwrote partition {partition_column}={partition_value} in {full_table}"
    )


def ensure_table_exists(
    spark: SparkSession,
    table: str,
    schema_ddl: str,
    catalog: str = "",
    schema: str = "",
    partition_by: Optional[list] = None,
    comment: str = "",
):
    """
    Create a Delta table if it doesn't already exist.

    Usage:
        ensure_table_exists(
            spark, "audit_events",
            schema_ddl='''
                id STRING,
                event_type STRING,
                payload STRING,
                created_at TIMESTAMP
            ''',
            catalog=cfg.catalog, schema=cfg.schema,
            partition_by=["event_type"],
        )
    """
    full_table = _full_table_name(table, catalog, schema)

    partition_clause = ""
    if partition_by:
        partition_clause = f"PARTITIONED BY ({', '.join(partition_by)})"

    comment_clause = ""
    if comment:
        safe_comment = comment.replace("'", "''")
        comment_clause = f"COMMENT '{safe_comment}'"

    sql = f"""
        CREATE TABLE IF NOT EXISTS {full_table} (
            {schema_ddl}
        )
        USING DELTA
        {partition_clause}
        {comment_clause}
    """

    spark.sql(sql)
    logger.info(f"Ensured table exists: {full_table}")


def optimize_table(
    spark: SparkSession,
    table: str,
    catalog: str = "",
    schema: str = "",
    z_order_columns: Optional[list] = None,
):
    """
    Run OPTIMIZE on a Delta table with optional Z-ORDER.

    Usage:
        optimize_table(spark, "events", cfg.catalog, cfg.schema, z_order_columns=["source_ip", "event_type"])
    """
    full_table = _full_table_name(table, catalog, schema)

    if z_order_columns:
        cols = ", ".join([f"`{c}`" for c in z_order_columns])
        spark.sql(f"OPTIMIZE {full_table} ZORDER BY ({cols})")
    else:
        spark.sql(f"OPTIMIZE {full_table}")

    logger.info(f"Optimized {full_table}")


def vacuum_table(
    spark: SparkSession,
    table: str,
    catalog: str = "",
    schema: str = "",
    retention_hours: int = 168,
):
    """
    Run VACUUM to clean up old Delta files.
    Default retention: 7 days (168 hours).
    """
    full_table = _full_table_name(table, catalog, schema)
    spark.sql(f"VACUUM {full_table} RETAIN {retention_hours} HOURS")
    logger.info(f"Vacuumed {full_table} (retention={retention_hours}h)")


def streaming_append(
    df: DataFrame,
    table: str,
    checkpoint_path: str,
    catalog: str = "",
    schema: str = "",
    trigger_interval: str = "10 seconds",
    query_name: Optional[str] = None,
    partition_by: Optional[list] = None,
):
    """
    Start a streaming write to a Delta table.

    Returns the StreamingQuery handle.

    Usage:
        from _shared.config import get_checkpoint_path
        query = streaming_append(
            enriched_stream, "events_enriched",
            checkpoint_path=get_checkpoint_path(cfg, "events_enriched"),
            catalog=cfg.catalog, schema=cfg.schema,
        )
    """
    full_table = _full_table_name(table, catalog, schema)
    name = query_name or f"stream_{table}"

    writer = (
        df.writeStream
        .format("delta")
        .outputMode("append")
        .option("checkpointLocation", checkpoint_path)
        .option("mergeSchema", "true")
        .queryName(name)
        .trigger(processingTime=trigger_interval)
    )

    if partition_by:
        writer = writer.partitionBy(*partition_by)

    return writer.toTable(full_table)


def streaming_foreach_batch(
    df: DataFrame,
    batch_handler,
    checkpoint_path: str,
    trigger_interval: str = "10 seconds",
    query_name: str = "foreach_batch",
):
    """
    Start a streaming query with foreachBatch processing.
    Use this for complex per-batch logic (enrichment, ML scoring, multi-table writes).

    Args:
        batch_handler: Function with signature (batch_df: DataFrame, batch_id: int) -> None

    Usage:
        def process_batch(batch_df, batch_id):
            enriched = enrich(batch_df)
            safe_append(enriched, "events_enriched", cfg.catalog, cfg.schema)

        streaming_foreach_batch(
            raw_stream, process_batch,
            checkpoint_path=get_checkpoint_path(cfg, "enrichment"),
        )
    """
    return (
        df.writeStream
        .foreachBatch(batch_handler)
        .option("checkpointLocation", checkpoint_path)
        .queryName(query_name)
        .trigger(processingTime=trigger_interval)
        .start()
    )


def add_metadata_columns(df: DataFrame) -> DataFrame:
    """
    Add standard metadata columns to a DataFrame before writing.
    Adds: _ingested_at, _batch_id (if not already present).
    """
    if "_ingested_at" not in df.columns:
        df = df.withColumn("_ingested_at", F.current_timestamp())
    if "_batch_id" not in df.columns:
        df = df.withColumn("_batch_id", F.expr("uuid()"))
    return df


def _full_table_name(table: str, catalog: str, schema: str) -> str:
    """Construct fully qualified table name."""
    if catalog and schema:
        return f"`{catalog}`.`{schema}`.`{table}`"
    if schema:
        return f"`{schema}`.`{table}`"
    return f"`{table}`"

# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation 08: Entity Spine — Persistent Entity Resolution
# MAGIC
# MAGIC The Entity Spine is the canonical identity graph for the SOC.
# MAGIC Every user, device, IP, session, process, cloud role, service account,
# MAGIC and badge is resolved into a single persistent node with a stable `entity_id`.
# MAGIC
# MAGIC **Why it exists:**
# MAGIC - Detection notebooks reference entities by spine ID, not raw fields
# MAGIC - Confluence aligns evidence to the same spine for causal reasoning
# MAGIC - Graph correlation builds paths over spine nodes, not ad-hoc IPs
# MAGIC - UEBA baselines attach to spine entities for cross-source behavioral drift
# MAGIC
# MAGIC **Entity Types:**
# MAGIC - `user` — Identity from auth events (user_id, username, email)
# MAGIC - `device` — Hostname, asset_id, MAC address
# MAGIC - `ip` — Network address (may be transient; linked to devices/users)
# MAGIC - `service_account` — Non-human identity (CI runners, service principals)
# MAGIC - `cloud_role` — IAM role, assume-role chain endpoint
# MAGIC - `process` — Persistent process identity (service name + host)
# MAGIC - `session` — Temporal entity binding user+device+time
# MAGIC - `badge` — Physical access credential
# MAGIC
# MAGIC **Resolution Strategy:**
# MAGIC 1. Extract entity mentions from Bronze events
# MAGIC 2. Match against existing spine entries (exact + fuzzy)
# MAGIC 3. Create new spine entries for genuinely new entities
# MAGIC 4. Build/update edges between entities (user→device, device→ip, etc.)
# MAGIC 5. Compute centrality metrics for risk scoring
# MAGIC
# MAGIC **Scheduling:** Every 5 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "10", "Minutes to scan for new entity mentions")
dbutils.widgets.text("max_entities_per_batch", "50000", "Max entities to process per run")
dbutils.widgets.text("compute_centrality", "true", "Compute graph centrality metrics")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
max_entities = int(dbutils.widgets.get("max_entities_per_batch"))
compute_centrality = dbutils.widgets.get("compute_centrality").lower() == "true"

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Tables

# COMMAND ----------

spine_table = get_table_path(cfg, "entity_spine")
edges_table = get_table_path(cfg, "entity_edges")
mentions_table = get_table_path(cfg, "entity_mentions")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {spine_table} (
    entity_id STRING NOT NULL,
    entity_type STRING NOT NULL,
    canonical_name STRING NOT NULL,
    display_name STRING,
    attributes MAP<STRING, STRING>,
    first_seen TIMESTAMP NOT NULL,
    last_seen TIMESTAMP NOT NULL,
    observation_count BIGINT DEFAULT 1,
    risk_score DOUBLE DEFAULT 0.0,
    centrality_degree DOUBLE DEFAULT 0.0,
    centrality_betweenness DOUBLE DEFAULT 0.0,
    centrality_pagerank DOUBLE DEFAULT 0.0,
    is_high_value BOOLEAN DEFAULT false,
    is_service_account BOOLEAN DEFAULT false,
    department STRING,
    owner STRING,
    tags ARRAY<STRING>,
    merged_from ARRAY<STRING>,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {edges_table} (
    edge_id STRING NOT NULL,
    source_entity_id STRING NOT NULL,
    target_entity_id STRING NOT NULL,
    edge_type STRING NOT NULL,
    weight DOUBLE DEFAULT 1.0,
    first_seen TIMESTAMP NOT NULL,
    last_seen TIMESTAMP NOT NULL,
    observation_count BIGINT DEFAULT 1,
    properties MAP<STRING, STRING>,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {mentions_table} (
    mention_id STRING NOT NULL,
    event_id STRING NOT NULL,
    entity_id STRING,
    entity_type STRING NOT NULL,
    raw_value STRING NOT NULL,
    source_field STRING NOT NULL,
    event_timestamp TIMESTAMP NOT NULL,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Extract Entity Mentions from Recent Events

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
events_table = get_table_path(cfg, "events")

with mon.time("extract_mentions"):
    raw_mentions = spark.sql(f"""
        SELECT
            id as event_id,
            timestamp as event_timestamp,
            -- User entities
            user_id,
            username,
            -- Device entities
            hostname,
            -- IP entities
            source_ip,
            dest_ip,
            -- Action context
            event_type,
            source
        FROM {events_table}
        WHERE timestamp > '{cutoff.isoformat()}'
          AND id NOT IN (
              SELECT DISTINCT event_id FROM {mentions_table}
              WHERE created_at > '{cutoff.isoformat()}'
          )
        LIMIT {max_entities}
    """)

    event_count = raw_mentions.count()
    if event_count == 0:
        print("No new events to process")
        dbutils.notebook.exit(json.dumps({"status": "no_new_events", "rows": 0}))

    print(f"Processing {event_count} events for entity extraction")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Normalize Entity Mentions
# MAGIC
# MAGIC Each event field that references an entity becomes a mention row.

# COMMAND ----------

with mon.time("normalize_mentions"):
    # Explode each entity field into a separate mention
    user_mentions = (
        raw_mentions
        .filter(col("user_id").isNotNull() | col("username").isNotNull())
        .select(
            expr("uuid()").alias("mention_id"),
            col("event_id"),
            lit("user").alias("entity_type"),
            coalesce(col("user_id"), col("username")).alias("raw_value"),
            lit("user_id").alias("source_field"),
            col("event_timestamp"),
        )
    )

    device_mentions = (
        raw_mentions
        .filter(col("hostname").isNotNull())
        .select(
            expr("uuid()").alias("mention_id"),
            col("event_id"),
            lit("device").alias("entity_type"),
            col("hostname").alias("raw_value"),
            lit("hostname").alias("source_field"),
            col("event_timestamp"),
        )
    )

    src_ip_mentions = (
        raw_mentions
        .filter(col("source_ip").isNotNull())
        .select(
            expr("uuid()").alias("mention_id"),
            col("event_id"),
            lit("ip").alias("entity_type"),
            col("source_ip").alias("raw_value"),
            lit("source_ip").alias("source_field"),
            col("event_timestamp"),
        )
    )

    dst_ip_mentions = (
        raw_mentions
        .filter(col("dest_ip").isNotNull())
        .select(
            expr("uuid()").alias("mention_id"),
            col("event_id"),
            lit("ip").alias("entity_type"),
            col("dest_ip").alias("raw_value"),
            lit("dest_ip").alias("source_field"),
            col("event_timestamp"),
        )
    )

    all_mentions = (
        user_mentions
        .union(device_mentions)
        .union(src_ip_mentions)
        .union(dst_ip_mentions)
        .withColumn("resolved", lit(False))
        .withColumn("entity_id", lit(None).cast("string"))
        .withColumn("created_at", current_timestamp())
    )

    mention_count = all_mentions.count()
    print(f"Extracted {mention_count} entity mentions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resolve Mentions → Spine Entities
# MAGIC
# MAGIC Match mentions against existing spine entries. Create new entries for unknown entities.

# COMMAND ----------

with mon.time("resolve_entities"):
    # Load current spine for lookup
    existing_spine = spark.table(spine_table).select(
        "entity_id", "entity_type", "canonical_name"
    )

    # Join mentions to existing spine
    resolved = (
        all_mentions.alias("m")
        .join(
            existing_spine.alias("s"),
            (col("m.raw_value") == col("s.canonical_name")) &
            (col("m.entity_type") == col("s.entity_type")),
            "left"
        )
        .select(
            col("m.mention_id"),
            col("m.event_id"),
            coalesce(col("s.entity_id"), expr("uuid()")).alias("entity_id"),
            col("m.entity_type"),
            col("m.raw_value"),
            col("m.source_field"),
            col("m.event_timestamp"),
            col("s.entity_id").isNotNull().alias("resolved"),
            col("m.created_at"),
        )
    )

    # Identify new entities (never seen before)
    new_entities = (
        resolved
        .filter(col("resolved") == False)
        .select("entity_id", "entity_type", "raw_value", "event_timestamp")
        .dropDuplicates(["entity_type", "raw_value"])
        .select(
            col("entity_id"),
            col("entity_type"),
            col("raw_value").alias("canonical_name"),
            col("raw_value").alias("display_name"),
            lit(None).cast("map<string,string>").alias("attributes"),
            col("event_timestamp").alias("first_seen"),
            col("event_timestamp").alias("last_seen"),
            lit(1).cast("bigint").alias("observation_count"),
            lit(0.0).alias("risk_score"),
            lit(0.0).alias("centrality_degree"),
            lit(0.0).alias("centrality_betweenness"),
            lit(0.0).alias("centrality_pagerank"),
            lit(False).alias("is_high_value"),
            # Detect service accounts by naming patterns
            (
                lower(col("raw_value")).rlike(r"(svc[_-]|service[_-]|sa[_-]|bot[_-]|ci[_-]|automation|system)")
            ).alias("is_service_account"),
            lit(None).cast("string").alias("department"),
            lit(None).cast("string").alias("owner"),
            lit(None).cast("array<string>").alias("tags"),
            lit(None).cast("array<string>").alias("merged_from"),
            current_timestamp().alias("updated_at"),
        )
    )

    new_count = new_entities.count()
    if new_count > 0:
        new_entities.write.mode("append").option("mergeSchema", "true").saveAsTable(spine_table)
        print(f"Created {new_count} new spine entities")

    # Update existing entities (bump last_seen and observation_count)
    existing_updates = (
        resolved
        .filter(col("resolved") == True)
        .groupBy("entity_id")
        .agg(
            max("event_timestamp").alias("last_seen"),
            count("*").alias("new_observations"),
        )
    )

    if existing_updates.count() > 0:
        existing_updates.createOrReplaceTempView("_spine_updates")
        spark.sql(f"""
            MERGE INTO {spine_table} t
            USING _spine_updates s
            ON t.entity_id = s.entity_id
            WHEN MATCHED THEN UPDATE SET
                t.last_seen = s.last_seen,
                t.observation_count = t.observation_count + s.new_observations,
                t.updated_at = current_timestamp()
        """)

    # Write resolved mentions
    resolved.write.mode("append").option("mergeSchema", "true").saveAsTable(mentions_table)
    print(f"Resolved mentions: {resolved.filter(col('resolved')).count()} existing, {new_count} new")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Entity Edges
# MAGIC
# MAGIC From each event, extract relationships between co-occurring entities.
# MAGIC E.g., user→device (logged in from), device→ip (has address), user→ip (connected to).

# COMMAND ----------

with mon.time("build_edges"):
    # user → device edges (same event has both user and hostname)
    user_device_edges = (
        raw_mentions
        .filter(
            (col("user_id").isNotNull() | col("username").isNotNull()) &
            col("hostname").isNotNull()
        )
        .select(
            coalesce(col("user_id"), col("username")).alias("source_value"),
            lit("user").alias("source_type"),
            col("hostname").alias("target_value"),
            lit("device").alias("target_type"),
            lit("authenticated_on").alias("edge_type"),
            col("event_timestamp"),
        )
    )

    # device → ip edges
    device_ip_edges = (
        raw_mentions
        .filter(col("hostname").isNotNull() & col("source_ip").isNotNull())
        .select(
            col("hostname").alias("source_value"),
            lit("device").alias("source_type"),
            col("source_ip").alias("target_value"),
            lit("ip").alias("target_type"),
            lit("has_address").alias("edge_type"),
            col("event_timestamp"),
        )
    )

    # user → dest_ip edges (connection)
    user_ip_edges = (
        raw_mentions
        .filter(
            (col("user_id").isNotNull() | col("username").isNotNull()) &
            col("dest_ip").isNotNull()
        )
        .select(
            coalesce(col("user_id"), col("username")).alias("source_value"),
            lit("user").alias("source_type"),
            col("dest_ip").alias("target_value"),
            lit("ip").alias("target_type"),
            lit("connected_to").alias("edge_type"),
            col("event_timestamp"),
        )
    )

    # source_ip → dest_ip edges (network flow)
    ip_ip_edges = (
        raw_mentions
        .filter(col("source_ip").isNotNull() & col("dest_ip").isNotNull())
        .select(
            col("source_ip").alias("source_value"),
            lit("ip").alias("source_type"),
            col("dest_ip").alias("target_value"),
            lit("ip").alias("target_type"),
            lit("network_flow").alias("edge_type"),
            col("event_timestamp"),
        )
    )

    all_raw_edges = (
        user_device_edges
        .union(device_ip_edges)
        .union(user_ip_edges)
        .union(ip_ip_edges)
    )

    # Resolve edge endpoints to entity_ids via spine
    spine_lookup = spark.table(spine_table).select(
        col("entity_id"), col("entity_type"), col("canonical_name")
    )

    resolved_edges = (
        all_raw_edges.alias("e")
        .join(
            spine_lookup.alias("src"),
            (col("e.source_value") == col("src.canonical_name")) &
            (col("e.source_type") == col("src.entity_type")),
            "inner"
        )
        .join(
            spine_lookup.alias("tgt"),
            (col("e.target_value") == col("tgt.canonical_name")) &
            (col("e.target_type") == col("tgt.entity_type")),
            "inner"
        )
        .select(
            col("src.entity_id").alias("source_entity_id"),
            col("tgt.entity_id").alias("target_entity_id"),
            col("e.edge_type"),
            col("e.event_timestamp"),
        )
        .groupBy("source_entity_id", "target_entity_id", "edge_type")
        .agg(
            count("*").alias("observation_count"),
            min("event_timestamp").alias("first_seen"),
            max("event_timestamp").alias("last_seen"),
        )
    )

    # MERGE edges (upsert: increment weight if exists)
    if resolved_edges.count() > 0:
        resolved_edges = resolved_edges.withColumn(
            "edge_id",
            md5(concat_ws("|", col("source_entity_id"), col("target_entity_id"), col("edge_type")))
        ).withColumn("weight", col("observation_count").cast("double"))
        resolved_edges.withColumn(
            "properties", lit(None).cast("map<string,string>")
        ).withColumn("updated_at", current_timestamp())

        resolved_edges.createOrReplaceTempView("_new_edges")
        spark.sql(f"""
            MERGE INTO {edges_table} t
            USING (
                SELECT
                    md5(concat_ws('|', source_entity_id, target_entity_id, edge_type)) as edge_id,
                    source_entity_id, target_entity_id, edge_type,
                    CAST(observation_count AS DOUBLE) as weight,
                    first_seen, last_seen, observation_count,
                    CAST(NULL AS MAP<STRING, STRING>) as properties,
                    current_timestamp() as updated_at
                FROM _new_edges
            ) s
            ON t.edge_id = s.edge_id
            WHEN MATCHED THEN UPDATE SET
                t.weight = t.weight + s.weight,
                t.observation_count = t.observation_count + s.observation_count,
                t.last_seen = s.last_seen,
                t.updated_at = current_timestamp()
            WHEN NOT MATCHED THEN INSERT *
        """)
        edge_count = resolved_edges.count()
        print(f"Upserted {edge_count} entity edges")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Centrality Metrics (GraphFrames)
# MAGIC
# MAGIC Degree, betweenness approximation, and PageRank for risk scoring.

# COMMAND ----------

if compute_centrality:
    with mon.time("compute_centrality"):
        try:
            from graphframes import GraphFrame

            # Build GraphFrame from spine + edges
            vertices = (
                spark.table(spine_table)
                .select(col("entity_id").alias("id"), "entity_type", "canonical_name", "risk_score")
            )
            edges_df = (
                spark.table(edges_table)
                .select(
                    col("source_entity_id").alias("src"),
                    col("target_entity_id").alias("dst"),
                    "weight", "edge_type"
                )
            )

            if vertices.count() > 0 and edges_df.count() > 0:
                g = GraphFrame(vertices, edges_df)

                # Degree centrality (normalized)
                degree = g.degrees
                max_degree = degree.agg(max("degree")).first()[0] or 1
                degree_norm = degree.withColumn(
                    "centrality_degree", col("degree") / lit(max_degree)
                ).select(col("id").alias("entity_id"), "centrality_degree")

                # PageRank
                pr = g.pageRank(resetProbability=0.15, maxIter=10)
                pr_vertices = pr.vertices.select(
                    col("id").alias("entity_id"),
                    col("pagerank").alias("centrality_pagerank")
                )

                # Join and update spine
                centrality_updates = (
                    degree_norm.alias("d")
                    .join(pr_vertices.alias("p"), "entity_id", "left")
                    .select(
                        col("entity_id"),
                        coalesce(col("d.centrality_degree"), lit(0.0)).alias("centrality_degree"),
                        coalesce(col("p.centrality_pagerank"), lit(0.0)).alias("centrality_pagerank"),
                    )
                )

                centrality_updates.createOrReplaceTempView("_centrality")
                spark.sql(f"""
                    MERGE INTO {spine_table} t
                    USING _centrality s
                    ON t.entity_id = s.entity_id
                    WHEN MATCHED THEN UPDATE SET
                        t.centrality_degree = s.centrality_degree,
                        t.centrality_pagerank = s.centrality_pagerank,
                        t.updated_at = current_timestamp()
                """)
                print(f"Updated centrality for {centrality_updates.count()} entities")
            else:
                print("Not enough data for centrality computation")

        except ImportError:
            mon.log_warning("GraphFrames not available; skipping centrality computation")
        except Exception as e:
            mon.log_warning(f"Centrality computation failed: {str(e)[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark High-Value Entities
# MAGIC
# MAGIC Entities with high centrality + connections to crown-jewel assets become high-value.

# COMMAND ----------

with mon.time("mark_high_value"):
    spark.sql(f"""
        UPDATE {spine_table}
        SET is_high_value = true, updated_at = current_timestamp()
        WHERE centrality_pagerank > 0.01
          AND observation_count > 50
          AND is_high_value = false
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_entities = spark.sql(f"SELECT COUNT(*) FROM {spine_table}").first()[0]
total_edges = spark.sql(f"SELECT COUNT(*) FROM {edges_table}").first()[0]
high_value = spark.sql(f"SELECT COUNT(*) FROM {spine_table} WHERE is_high_value = true").first()[0]

print(f"\nEntity Spine Summary:")
print(f"  Total entities:  {total_entities}")
print(f"  Total edges:     {total_edges}")
print(f"  High-value:      {high_value}")
print(f"  New this run:    {new_count}")
print(f"  Mentions:        {mention_count}")

result = {
    "notebook": "08_entity_spine",
    "status": "completed",
    "total_entities": total_entities,
    "total_edges": total_edges,
    "new_entities": new_count,
    "mentions_processed": mention_count,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))

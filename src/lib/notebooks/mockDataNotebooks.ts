import { DatabricksNotebook } from '../databricksNotebooks';

export const mockDataNotebooks: DatabricksNotebook[] = [
  {
    id: 'data-quality-engine',
    title: 'Data Quality & Validation Engine',
    subtitle: 'Automated data quality validation across all SOC platform tables',
    category: 'data-ops',
    tags: ['Data Quality', 'Validation', 'Completeness', 'Freshness', 'Schema Drift'],
    description: 'Production data quality engine that validates completeness, freshness, volume, and schema consistency across every table in the SOC platform. Results are written to a central data_quality_metrics Delta table and visualized in a matplotlib dashboard for operational monitoring.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers, 32GB+ driver memory',
    cells: [
      {
        type: 'markdown',
        content: `# Data Quality & Validation Engine
## Automated Quality Assurance for SOC Platform Tables

This notebook performs **production data quality checks** across all tables in the SOC platform catalog. No data is generated -- every metric is derived by reading existing Delta tables.

### Quality Dimensions
| Dimension | Description | Method |
|-----------|-------------|--------|
| **Completeness** | Null ratio per column | \`COUNT(NULL) / COUNT(*)\` per column |
| **Freshness** | Data recency | \`MAX(timestamp) vs CURRENT_TIMESTAMP\` |
| **Volume** | Row count health | Actual count vs expected minimum thresholds |
| **Schema Drift** | Structural consistency | Compare live schema against baseline snapshots |

### Outputs
- All metrics written to \`data_quality_metrics\` Delta table via MERGE
- Dashboard rendered with matplotlib for quick visual review
- Any check that breaches its threshold is flagged for investigation`
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & Table Registry
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType, TimestampType
from datetime import datetime

# --- Parameterized configuration via Databricks widgets ---
dbutils.widgets.text("catalog", "soc_platform", "Catalog Name")
dbutils.widgets.text("schema", "events", "Schema Name")
dbutils.widgets.text("metrics_schema", "data_ops", "Metrics Output Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
metrics_schema = dbutils.widgets.get("metrics_schema")

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{metrics_schema}")

# Registry of tables to validate with expected minimums and timestamp columns
TABLE_REGISTRY = [
    {"table": f"{catalog}.{schema}.security_events_master", "ts_col": "timestamp", "min_rows": 10000},
    {"table": f"{catalog}.{schema}.alerts_master", "ts_col": "created_at", "min_rows": 500},
    {"table": f"{catalog}.{schema}.cases_master", "ts_col": "created_at", "min_rows": 10},
    {"table": f"{catalog}.compliance.compliance_controls", "ts_col": "last_assessed", "min_rows": 200},
    {"table": f"{catalog}.threat_intel.ioc_master", "ts_col": "first_seen", "min_rows": 1000},
    {"table": f"{catalog}.ueba.user_activity", "ts_col": "event_time", "min_rows": 5000},
    {"table": f"{catalog}.network.flow_records", "ts_col": "flow_start", "min_rows": 5000},
]

# Baseline schemas captured from last known-good run (table_name -> list of expected columns)
SCHEMA_BASELINES = {
    f"{catalog}.{schema}.security_events_master": [
        "event_id", "timestamp", "event_type", "action", "severity",
        "source_ip", "destination_ip", "user_id", "hostname", "outcome", "mitre_tactic"
    ],
    f"{catalog}.{schema}.alerts_master": [
        "alert_id", "alert_name", "severity", "source", "status",
        "assigned_to", "created_at", "resolved_at"
    ],
    f"{catalog}.compliance.compliance_controls": [
        "control_id", "framework", "function_area", "control_name",
        "status", "compliance_score", "last_assessed"
    ],
}

run_ts = datetime.now()
print(f"Data Quality Run: {run_ts.isoformat()}")
print(f"Catalog: {catalog}")
print(f"Tables to validate: {len(TABLE_REGISTRY)}")
print(f"Schema baselines loaded for: {len(SCHEMA_BASELINES)} tables")`
      },
      {
        type: 'code',
        content: `# Cell 2: Execute Quality Checks
from pyspark.sql import Row
from datetime import datetime

quality_results = []
run_timestamp = datetime.now()

for entry in TABLE_REGISTRY:
    table_name = entry["table"]
    ts_col = entry["ts_col"]
    min_rows = entry["min_rows"]

    try:
        df = spark.table(table_name)
    except Exception as e:
        quality_results.append({
            "run_timestamp": run_timestamp,
            "table_name": table_name,
            "check_type": "existence",
            "check_name": "table_exists",
            "metric_value": 0.0,
            "threshold": 1.0,
            "passed": False,
            "detail": str(e)[:500],
        })
        continue

    # --- Volume Check ---
    row_count = df.count()
    volume_passed = row_count >= min_rows
    quality_results.append({
        "run_timestamp": run_timestamp,
        "table_name": table_name,
        "check_type": "volume",
        "check_name": "row_count_minimum",
        "metric_value": float(row_count),
        "threshold": float(min_rows),
        "passed": volume_passed,
        "detail": f"actual={row_count}, expected_min={min_rows}",
    })

    # --- Freshness Check ---
    if ts_col in df.columns:
        max_ts_row = df.agg(F.max(F.col(ts_col)).alias("max_ts")).collect()[0]
        max_ts = max_ts_row["max_ts"]
        if max_ts is not None:
            staleness_hours = (run_timestamp - max_ts).total_seconds() / 3600.0
        else:
            staleness_hours = -1.0
        freshness_threshold = 48.0  # hours
        quality_results.append({
            "run_timestamp": run_timestamp,
            "table_name": table_name,
            "check_type": "freshness",
            "check_name": "max_timestamp_staleness_hours",
            "metric_value": round(staleness_hours, 2),
            "threshold": freshness_threshold,
            "passed": 0 <= staleness_hours <= freshness_threshold,
            "detail": f"max_ts={max_ts}, staleness_hours={round(staleness_hours, 2)}",
        })

    # --- Completeness Check (null ratio per column) ---
    total = float(row_count) if row_count > 0 else 1.0
    for col_name in df.columns:
        null_count = df.where(F.col(col_name).isNull()).count()
        null_ratio = null_count / total
        completeness_threshold = 0.10  # flag if >10% null
        quality_results.append({
            "run_timestamp": run_timestamp,
            "table_name": table_name,
            "check_type": "completeness",
            "check_name": f"null_ratio_{col_name}",
            "metric_value": round(null_ratio, 4),
            "threshold": completeness_threshold,
            "passed": null_ratio <= completeness_threshold,
            "detail": f"nulls={null_count}, total={row_count}",
        })

    # --- Schema Drift Detection ---
    if table_name in SCHEMA_BASELINES:
        expected_cols = set(SCHEMA_BASELINES[table_name])
        actual_cols = set(df.columns)
        missing = expected_cols - actual_cols
        added = actual_cols - expected_cols
        drift_detected = len(missing) > 0 or len(added) > 0
        quality_results.append({
            "run_timestamp": run_timestamp,
            "table_name": table_name,
            "check_type": "schema_drift",
            "check_name": "column_comparison",
            "metric_value": float(len(missing) + len(added)),
            "threshold": 0.0,
            "passed": not drift_detected,
            "detail": f"missing={sorted(missing)}, added={sorted(added)}" if drift_detected else "schema matches baseline",
        })

print(f"Executed {len(quality_results)} quality checks across {len(TABLE_REGISTRY)} tables")
passed = sum(1 for r in quality_results if r["passed"])
failed = len(quality_results) - passed
print(f"Passed: {passed} | Failed: {failed}")`
      },
      {
        type: 'code',
        content: `# Cell 3: Write Metrics to Delta & Display Dashboard
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import pandas as pd

# --- Write quality metrics to Delta via MERGE ---
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{metrics_schema}")

df_metrics = spark.createDataFrame(quality_results)

df_metrics.createOrReplaceTempView("new_quality_metrics")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{metrics_schema}.data_quality_metrics (
        run_timestamp TIMESTAMP,
        table_name STRING,
        check_type STRING,
        check_name STRING,
        metric_value DOUBLE,
        threshold DOUBLE,
        passed BOOLEAN,
        detail STRING
    )
    USING DELTA
""")

spark.sql(f"""
    MERGE INTO {catalog}.{metrics_schema}.data_quality_metrics AS target
    USING new_quality_metrics AS source
    ON target.table_name = source.table_name
       AND target.check_name = source.check_name
       AND target.run_timestamp = source.run_timestamp
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

print(f"Wrote {len(quality_results)} metrics to {catalog}.{metrics_schema}.data_quality_metrics")

# --- Dashboard ---
metrics_pdf = df_metrics.toPandas()

fig, axes = plt.subplots(2, 2, figsize=(18, 12))
fig.suptitle("Data Quality Dashboard", fontsize=18, fontweight="bold", color="#1e293b")

# 1. Pass/Fail by Check Type
check_summary = metrics_pdf.groupby(["check_type", "passed"]).size().unstack(fill_value=0)
check_summary.plot(kind="bar", stacked=True, ax=axes[0, 0],
                   color={"True": "#10b981", "False": "#ef4444", True: "#10b981", False: "#ef4444"})
axes[0, 0].set_title("Pass / Fail by Check Type", fontweight="bold")
axes[0, 0].set_xlabel("")
axes[0, 0].tick_params(axis="x", rotation=30)
axes[0, 0].legend(["Fail", "Pass"])

# 2. Volume: actual row counts per table
volume_df = metrics_pdf[metrics_pdf["check_type"] == "volume"].copy()
volume_df["short_table"] = volume_df["table_name"].apply(lambda t: t.split(".")[-1])
bars = axes[0, 1].barh(volume_df["short_table"], volume_df["metric_value"], color="#3b82f6")
for i, (val, threshold) in enumerate(zip(volume_df["metric_value"], volume_df["threshold"])):
    color = "#10b981" if val >= threshold else "#ef4444"
    bars[i].set_color(color)
axes[0, 1].set_title("Row Counts vs Minimum Thresholds", fontweight="bold")
axes[0, 1].axvline(x=0, color="#94a3b8", linewidth=0.5)

# 3. Freshness: staleness in hours per table
fresh_df = metrics_pdf[metrics_pdf["check_type"] == "freshness"].copy()
if not fresh_df.empty:
    fresh_df["short_table"] = fresh_df["table_name"].apply(lambda t: t.split(".")[-1])
    bar_colors = ["#10b981" if p else "#ef4444" for p in fresh_df["passed"]]
    axes[1, 0].barh(fresh_df["short_table"], fresh_df["metric_value"], color=bar_colors)
    axes[1, 0].axvline(x=48, color="#f59e0b", linestyle="--", linewidth=1.5, label="48h threshold")
    axes[1, 0].set_title("Data Freshness (Staleness Hours)", fontweight="bold")
    axes[1, 0].legend()
else:
    axes[1, 0].text(0.5, 0.5, "No freshness data", ha="center", va="center", transform=axes[1, 0].transAxes)
    axes[1, 0].set_title("Data Freshness", fontweight="bold")

# 4. Summary stats
total_checks = len(metrics_pdf)
total_passed = metrics_pdf["passed"].sum()
total_failed = total_checks - total_passed
pass_rate = (total_passed / total_checks * 100) if total_checks > 0 else 0
tables_checked = metrics_pdf["table_name"].nunique()

summary_text = f"""
DATA QUALITY SUMMARY
{'=' * 35}
Run Timestamp:   {run_timestamp.strftime('%Y-%m-%d %H:%M')}
Tables Checked:  {tables_checked}
Total Checks:    {total_checks}
Passed:          {total_passed}
Failed:          {total_failed}
Pass Rate:       {pass_rate:.1f}%

CHECK BREAKDOWN
{'=' * 35}
Volume:          {len(metrics_pdf[metrics_pdf['check_type'] == 'volume'])}
Freshness:       {len(metrics_pdf[metrics_pdf['check_type'] == 'freshness'])}
Completeness:    {len(metrics_pdf[metrics_pdf['check_type'] == 'completeness'])}
Schema Drift:    {len(metrics_pdf[metrics_pdf['check_type'] == 'schema_drift'])}
"""
axes[1, 1].text(0.05, 0.5, summary_text, transform=axes[1, 1].transAxes,
                fontsize=10, verticalalignment="center", fontfamily="monospace",
                bbox=dict(boxstyle="round", facecolor="#f1f5f9", alpha=0.8))
axes[1, 1].axis("off")
axes[1, 1].set_title("Run Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print("\\nData quality validation complete. Review failed checks above for remediation.")`
      },
    ],
  },

  {
    id: 'compliance-posture-engine',
    title: 'Compliance Posture Assessment Engine',
    subtitle: 'Compute compliance posture scores from real control and evidence data',
    category: 'compliance',
    tags: ['Compliance', 'Posture', 'NIST', 'SOC2', 'HIPAA', 'PCI-DSS', 'ISO 27001', 'Assessment'],
    description: 'Production compliance assessment engine that reads existing compliance control definitions and evidence records, computes per-framework and per-function posture scores, identifies control gaps, and writes assessment results to Delta. No data is generated -- all metrics are derived from live tables.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Compliance Posture Assessment Engine
## Real-Time Compliance Scoring from Control & Evidence Data

This notebook reads **existing compliance control definitions and evidence records** from the SOC platform catalog and computes posture scores. No data is generated -- every metric is derived from live Delta tables.

### Assessment Approach
1. **Read** control definitions from \`compliance_controls\` table
2. **Join** with evidence records from \`compliance_evidence\` table
3. **Score** each control based on evidence completeness, recency, and validation status
4. **Aggregate** scores per framework, per function area, and overall
5. **Identify gaps** -- controls with no evidence or stale/rejected evidence
6. **Write** assessment results to \`compliance_posture_assessments\` Delta table via MERGE

### Scoring Model
| Evidence State | Score |
|----------------|-------|
| Valid evidence within review period | 100% |
| Valid evidence but approaching expiry | 75% |
| Stale evidence (past review period) | 40% |
| Rejected or insufficient evidence | 20% |
| No evidence on file | 0% |`
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & Data Ingestion
from pyspark.sql import functions as F
from datetime import datetime

# --- Parameterized configuration via Databricks widgets ---
dbutils.widgets.text("catalog", "soc_platform", "Catalog Name")
dbutils.widgets.text("compliance_schema", "compliance", "Compliance Schema")
dbutils.widgets.text("output_schema", "compliance", "Output Schema")
dbutils.widgets.text("evidence_staleness_days", "90", "Evidence Staleness Threshold (days)")

catalog = dbutils.widgets.get("catalog")
compliance_schema = dbutils.widgets.get("compliance_schema")
output_schema = dbutils.widgets.get("output_schema")
staleness_days = int(dbutils.widgets.get("evidence_staleness_days"))

run_timestamp = datetime.now()

# --- Read source tables ---
df_controls = spark.table(f"{catalog}.{compliance_schema}.compliance_controls")
df_evidence = spark.table(f"{catalog}.{compliance_schema}.compliance_evidence")

control_count = df_controls.count()
evidence_count = df_evidence.count()
frameworks = [row["framework"] for row in df_controls.select("framework").distinct().collect()]

print(f"Compliance Posture Assessment Run: {run_timestamp.isoformat()}")
print(f"Controls loaded:  {control_count}")
print(f"Evidence loaded:  {evidence_count}")
print(f"Frameworks:       {', '.join(sorted(frameworks))}")
print(f"Staleness cutoff: {staleness_days} days")`
      },
      {
        type: 'code',
        content: `# Cell 2: Compute Posture Scores & Identify Gaps
from pyspark.sql import functions as F, Window

staleness_cutoff = F.date_sub(F.current_timestamp(), staleness_days)
approaching_cutoff = F.date_sub(F.current_timestamp(), int(staleness_days * 0.75))

# Join controls with their most recent evidence
window_latest = Window.partitionBy("control_id").orderBy(F.desc("evidence_date"))

df_evidence_ranked = (
    df_evidence
    .withColumn("evidence_rank", F.row_number().over(window_latest))
    .where(F.col("evidence_rank") == 1)
    .drop("evidence_rank")
)

df_joined = (
    df_controls.alias("c")
    .join(df_evidence_ranked.alias("e"), F.col("c.control_id") == F.col("e.control_id"), "left")
    .select(
        F.col("c.control_id"),
        F.col("c.framework"),
        F.col("c.function_area"),
        F.col("c.control_name"),
        F.col("c.status").alias("control_status"),
        F.col("c.risk_level"),
        F.col("e.evidence_id"),
        F.col("e.evidence_date"),
        F.col("e.validation_status"),
    )
)

# Score each control based on evidence state
df_scored = df_joined.withColumn(
    "posture_score",
    F.when(F.col("evidence_id").isNull(), 0.0)
     .when(F.col("validation_status") == "rejected", 20.0)
     .when(F.col("evidence_date") < staleness_cutoff, 40.0)
     .when(F.col("evidence_date") < approaching_cutoff, 75.0)
     .otherwise(100.0)
).withColumn(
    "gap_flag",
    F.when(F.col("posture_score") <= 40.0, True).otherwise(False)
).withColumn(
    "gap_reason",
    F.when(F.col("evidence_id").isNull(), "no_evidence")
     .when(F.col("validation_status") == "rejected", "evidence_rejected")
     .when(F.col("evidence_date") < staleness_cutoff, "evidence_stale")
     .otherwise(None)
)

# --- Per-framework and per-function aggregation ---
df_framework_posture = (
    df_scored.groupBy("framework")
    .agg(
        F.count("*").alias("total_controls"),
        F.round(F.avg("posture_score"), 2).alias("avg_posture_score"),
        F.sum(F.when(F.col("posture_score") == 100.0, 1).otherwise(0)).alias("fully_compliant"),
        F.sum(F.when(F.col("gap_flag"), 1).otherwise(0)).alias("gap_count"),
    )
    .withColumn("compliance_pct", F.round(F.col("fully_compliant") / F.col("total_controls") * 100, 1))
    .orderBy(F.desc("compliance_pct"))
)

df_function_posture = (
    df_scored.groupBy("framework", "function_area")
    .agg(
        F.count("*").alias("total_controls"),
        F.round(F.avg("posture_score"), 2).alias("avg_posture_score"),
        F.sum(F.when(F.col("gap_flag"), 1).otherwise(0)).alias("gap_count"),
    )
    .withColumn("compliance_pct", F.round((F.col("total_controls") - F.col("gap_count")) / F.col("total_controls") * 100, 1))
    .orderBy("framework", F.desc("compliance_pct"))
)

# --- Gap report ---
df_gaps = (
    df_scored.where(F.col("gap_flag"))
    .select("framework", "function_area", "control_name", "control_status",
            "risk_level", "posture_score", "gap_reason")
    .orderBy("framework", "risk_level")
)

gap_count = df_gaps.count()
print(f"Posture scoring complete.")
print(f"Gaps identified: {gap_count}")
display(df_framework_posture)

# --- Write assessment results to Delta via MERGE ---
df_assessment_output = (
    df_scored
    .withColumn("run_timestamp", F.lit(run_timestamp))
    .select(
        "run_timestamp", "control_id", "framework", "function_area", "control_name",
        "control_status", "risk_level", "evidence_id", "evidence_date",
        "validation_status", "posture_score", "gap_flag", "gap_reason"
    )
)

df_assessment_output.createOrReplaceTempView("new_assessments")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{output_schema}.compliance_posture_assessments (
        run_timestamp TIMESTAMP,
        control_id STRING,
        framework STRING,
        function_area STRING,
        control_name STRING,
        control_status STRING,
        risk_level STRING,
        evidence_id STRING,
        evidence_date TIMESTAMP,
        validation_status STRING,
        posture_score DOUBLE,
        gap_flag BOOLEAN,
        gap_reason STRING
    )
    USING DELTA
""")

spark.sql(f"""
    MERGE INTO {catalog}.{output_schema}.compliance_posture_assessments AS target
    USING new_assessments AS source
    ON target.control_id = source.control_id
       AND target.run_timestamp = source.run_timestamp
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

print(f"Assessment results written to {catalog}.{output_schema}.compliance_posture_assessments")`
      },
      {
        type: 'code',
        content: `# Cell 3: Compliance Posture Dashboard
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import pandas as pd

fw_pdf = df_framework_posture.toPandas()
fn_pdf = df_function_posture.toPandas()
gaps_pdf = df_gaps.toPandas()

fig, axes = plt.subplots(2, 2, figsize=(20, 14))
fig.suptitle("Compliance Posture Assessment Dashboard", fontsize=18, fontweight="bold", color="#1e293b")

# 1. Overall posture score per framework
bar_colors = []
for score in fw_pdf["avg_posture_score"]:
    if score >= 80:
        bar_colors.append("#10b981")
    elif score >= 60:
        bar_colors.append("#f59e0b")
    else:
        bar_colors.append("#ef4444")
axes[0, 0].barh(fw_pdf["framework"], fw_pdf["avg_posture_score"], color=bar_colors)
axes[0, 0].set_xlim(0, 100)
axes[0, 0].axvline(x=80, color="#10b981", linestyle="--", linewidth=1, alpha=0.7, label="Target (80%)")
axes[0, 0].set_title("Average Posture Score by Framework", fontweight="bold")
axes[0, 0].set_xlabel("Posture Score")
axes[0, 0].legend()

# 2. Compliance percentage per framework
axes[0, 1].bar(fw_pdf["framework"], fw_pdf["compliance_pct"], color="#3b82f6")
axes[0, 1].set_ylim(0, 100)
axes[0, 1].axhline(y=90, color="#10b981", linestyle="--", linewidth=1, alpha=0.7, label="90% target")
axes[0, 1].set_title("Fully Compliant Controls (%)", fontweight="bold")
axes[0, 1].set_ylabel("Compliance %")
axes[0, 1].tick_params(axis="x", rotation=30)
axes[0, 1].legend()

# 3. Gap distribution by framework and reason
if not gaps_pdf.empty:
    gap_pivot = gaps_pdf.groupby(["framework", "gap_reason"]).size().unstack(fill_value=0)
    reason_colors = {"no_evidence": "#ef4444", "evidence_stale": "#f59e0b", "evidence_rejected": "#8b5cf6"}
    gap_pivot.plot(kind="bar", stacked=True, ax=axes[1, 0],
                   color=[reason_colors.get(c, "#6b7280") for c in gap_pivot.columns])
    axes[1, 0].set_title("Control Gaps by Framework & Reason", fontweight="bold")
    axes[1, 0].set_xlabel("")
    axes[1, 0].tick_params(axis="x", rotation=30)
    axes[1, 0].legend(title="Gap Reason")
else:
    axes[1, 0].text(0.5, 0.5, "No gaps found", ha="center", va="center",
                     transform=axes[1, 0].transAxes, fontsize=14, color="#10b981")
    axes[1, 0].set_title("Control Gaps", fontweight="bold")

# 4. Summary statistics
overall_score = fw_pdf["avg_posture_score"].mean() if not fw_pdf.empty else 0
total_controls = fw_pdf["total_controls"].sum() if not fw_pdf.empty else 0
total_compliant = fw_pdf["fully_compliant"].sum() if not fw_pdf.empty else 0
total_gaps = fw_pdf["gap_count"].sum() if not fw_pdf.empty else 0

summary_text = f"""
COMPLIANCE POSTURE SUMMARY
{'=' * 40}
Assessment Time:    {run_timestamp.strftime('%Y-%m-%d %H:%M')}
Frameworks:         {len(fw_pdf)}
Total Controls:     {int(total_controls)}
Fully Compliant:    {int(total_compliant)}
Controls with Gaps: {int(total_gaps)}

OVERALL POSTURE
{'=' * 40}
Average Score:      {overall_score:.1f} / 100
Overall Rate:       {(total_compliant / total_controls * 100) if total_controls > 0 else 0:.1f}%

GAP BREAKDOWN
{'=' * 40}
No Evidence:        {len(gaps_pdf[gaps_pdf['gap_reason'] == 'no_evidence']) if not gaps_pdf.empty else 0}
Stale Evidence:     {len(gaps_pdf[gaps_pdf['gap_reason'] == 'evidence_stale']) if not gaps_pdf.empty else 0}
Rejected Evidence:  {len(gaps_pdf[gaps_pdf['gap_reason'] == 'evidence_rejected']) if not gaps_pdf.empty else 0}
"""
axes[1, 1].text(0.05, 0.5, summary_text, transform=axes[1, 1].transAxes,
                fontsize=10, verticalalignment="center", fontfamily="monospace",
                bbox=dict(boxstyle="round", facecolor="#f1f5f9", alpha=0.8))
axes[1, 1].axis("off")
axes[1, 1].set_title("Assessment Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print("\\nCompliance posture assessment complete. Review gaps above for remediation prioritization.")`
      },
    ],
  },
];

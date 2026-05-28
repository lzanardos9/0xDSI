# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("connector_adapter")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 23 - Connector Adapter
# MAGIC Normalizes heterogeneous log formats into OCSF schema. Supports CEF, LEEF,
# MAGIC RFC 5424 Syslog, and raw JSON. Maps to OCSF categories: Identity, Network,
# MAGIC System, Findings. Processes `raw_ingestion_queue` where normalized=false.

# COMMAND ----------

import json
import re
from datetime import datetime
from pyspark.sql import functions as F

# COMMAND ----------

BATCH_SIZE = 10000
OCSF_VERSION = "1.1.0"
notebook_start = datetime.utcnow()
mon.time("connector_adapter_total")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Parser Definitions

# COMMAND ----------

CEF_RE = re.compile(r"CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$")
LEEF_RE = re.compile(r"LEEF:(\d+\.\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$")
SYSLOG_RE = re.compile(r"<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:\[([^\]]*)\])?\s*(.*)")

def parse_cef(msg):
    m = CEF_RE.match(msg)
    if not m:
        return None
    _, vendor, product, _, _, name, severity, extensions = m.groups()
    ext = {p[0]: p[1].strip() for p in re.findall(r"(\w+)=([^=]*?)(?=\s+\w+=|$)", extensions)}
    return {"format": "CEF", "vendor": vendor, "product": product, "event_name": name,
            "severity_raw": severity, "source_ip": ext.get("src", ""),
            "dest_ip": ext.get("dst", ""), "user": ext.get("duser", ext.get("suser", "")),
            "action": ext.get("act", ""), "message": ext.get("msg", name), "extensions": ext}


def parse_leef(msg):
    m = LEEF_RE.match(msg)
    if not m:
        return None
    _, vendor, product, _, attrs_raw = m.groups()
    delim = "\t" if "\t" in attrs_raw else "|"
    attrs = {}
    for pair in attrs_raw.split(delim):
        if "=" in pair:
            k, v = pair.split("=", 1)
            attrs[k.strip()] = v.strip()
    return {"format": "LEEF", "vendor": vendor, "product": product,
            "event_name": attrs.get("cat", "unknown"), "severity_raw": attrs.get("sev", "0"),
            "source_ip": attrs.get("src", ""), "dest_ip": attrs.get("dst", ""),
            "user": attrs.get("usrName", ""), "action": attrs.get("action", ""),
            "message": attrs.get("msg", ""), "extensions": attrs}


def parse_syslog(msg):
    m = SYSLOG_RE.match(msg)
    if not m:
        return None
    priority, _, _, hostname, app, procid, msgid, sd, body = m.groups()
    pri = int(priority)
    return {"format": "SYSLOG_RFC5424", "vendor": "syslog", "product": app,
            "event_name": msgid if msgid != "-" else "syslog_event",
            "severity_raw": str(pri & 0x07), "source_ip": hostname, "dest_ip": "",
            "user": "", "action": body[:100] if body else "", "message": body or "",
            "extensions": {"facility": str(pri >> 3), "procid": procid}}


def parse_json(msg):
    try:
        d = json.loads(msg)
    except (json.JSONDecodeError, TypeError):
        return None
    return {"format": "JSON", "vendor": d.get("vendor", d.get("source", "unknown")),
            "product": d.get("product", d.get("application", "unknown")),
            "event_name": d.get("event_type", d.get("action", "json_event")),
            "severity_raw": str(d.get("severity", d.get("level", "0"))),
            "source_ip": d.get("src_ip", d.get("source_ip", "")),
            "dest_ip": d.get("dst_ip", d.get("dest_ip", "")),
            "user": d.get("user", d.get("username", "")), "action": d.get("action", ""),
            "message": d.get("message", d.get("msg", "")),
            "extensions": {k: str(v) for k, v in d.items() if k not in ("message", "msg")}}

# COMMAND ----------

# MAGIC %md
# MAGIC ## OCSF Category Mapping

# COMMAND ----------

OCSF_MAP = {
    "authentication": (3, "Identity Activity", 3002), "login": (3, "Identity Activity", 3002),
    "credential": (3, "Identity Activity", 3002), "network": (4, "Network Activity", 4001),
    "connection": (4, "Network Activity", 4001), "firewall": (4, "Network Activity", 4001),
    "process": (1, "System Activity", 1007), "file": (1, "System Activity", 1001),
    "registry": (1, "System Activity", 1006), "alert": (2, "Findings", 2001),
    "detection": (2, "Findings", 2001), "malware": (2, "Findings", 2001),
}


def classify_ocsf(event_name, action):
    combined = f"{event_name} {action}".lower()
    for kw, (cat_uid, cat_name, cls_uid) in OCSF_MAP.items():
        if kw in combined:
            return {"category_uid": cat_uid, "category_name": cat_name, "class_uid": cls_uid}
    return {"category_uid": 0, "category_name": "Uncategorized", "class_uid": 0}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read and Process Queue

# COMMAND ----------

mon.time("read_queue")

queue_path = cfg.get_table_path("raw_ingestion_queue")
queue_df = spark.read.table(queue_path).filter(F.col("normalized") == False).limit(BATCH_SIZE)
pending_count = queue_df.count()
mon.log_event("queue_read", {"pending_records": pending_count})

# COMMAND ----------

mon.time("parse_and_normalize")

PARSERS = {"CEF": parse_cef, "LEEF": parse_leef, "SYSLOG": parse_syslog, "JSON": parse_json}
raw_records = queue_df.select("record_id", "raw_message", "source_format").collect()
normalized_events = []
failed_records = []

for row in raw_records:
    record_id, raw_msg, source_fmt = row["record_id"], row["raw_message"], row["source_format"]
    parser = PARSERS.get(source_fmt)
    if parser:
        parsed = parser(raw_msg)
    elif raw_msg.startswith("CEF:"):
        parsed = parse_cef(raw_msg)
    elif raw_msg.startswith("LEEF:"):
        parsed = parse_leef(raw_msg)
    elif raw_msg.startswith("<"):
        parsed = parse_syslog(raw_msg)
    else:
        parsed = parse_json(raw_msg)

    if parsed is None:
        failed_records.append({"record_id": record_id, "error": "parse_failure"})
        continue

    ocsf = classify_ocsf(parsed["event_name"], parsed["action"])
    normalized_events.append({
        "record_id": record_id, "ocsf_version": OCSF_VERSION,
        "category_uid": ocsf["category_uid"], "category_name": ocsf["category_name"],
        "class_uid": ocsf["class_uid"], "source_format": parsed["format"],
        "vendor": parsed["vendor"], "product": parsed["product"],
        "event_name": parsed["event_name"], "severity_raw": parsed["severity_raw"],
        "source_ip": parsed["source_ip"], "dest_ip": parsed["dest_ip"],
        "user": parsed["user"], "action": parsed["action"],
        "message": parsed["message"], "extensions_json": json.dumps(parsed["extensions"]),
        "normalized_at": notebook_start
    })

mon.log_event("parsing_complete", {"success": len(normalized_events), "failed": len(failed_records)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Normalized Events and Update Queue

# COMMAND ----------

mon.time("write_normalized")
events_path = cfg.get_table_path("events")

if normalized_events:
    normalized_df = spark.createDataFrame(normalized_events)
    normalized_df.write.mode("append").saveAsTable(events_path)
mon.log_event("normalized_written", {"count": len(normalized_events)})

mon.time("update_queue_status")
processed_ids = [e["record_id"] for e in normalized_events]

if processed_ids:
    update_rows = [{"record_id": rid, "normalized": True, "processed_at": notebook_start} for rid in processed_ids]
    processed_df = spark.createDataFrame(update_rows)
    queue_table = spark.read.table(queue_path)
    updated_queue = queue_table.join(
        processed_df.select("record_id", F.lit(True).alias("new_normalized")),
        on="record_id", how="left"
    ).withColumn("normalized", F.coalesce(F.col("new_normalized"), F.col("normalized"))).drop("new_normalized")
    updated_queue.write.mode("overwrite").saveAsTable(queue_path)

mon.log_event("queue_updated", {"marked_normalized": len(processed_ids), "marked_failed": len(failed_records)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete()

result = {
    "status": "success", "agent": "23_connector_adapter",
    "records_processed": len(normalized_events), "records_failed": len(failed_records),
    "formats_handled": list(set(e["source_format"] for e in normalized_events)) if normalized_events else [],
    "execution_time_sec": (datetime.utcnow() - notebook_start).total_seconds()
}
dbutils.notebook.exit(json.dumps(result))

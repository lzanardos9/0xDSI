# Databricks notebook source
# MAGIC %md
# MAGIC # Persistence Test: Pipeline Table Storage
# MAGIC
# MAGIC **This is a storage/persistence test, NOT an end-to-end detection test.**
# MAGIC It verifies that the pipeline tables accept and return records with the
# MAGIC expected shape. It does NOT prove that any engine detected anything:
# MAGIC steps 5, 7 and 8 write the match, alert, triage and approval rows by hand
# MAGIC instead of running the matching, triage and response engines.
# MAGIC
# MAGIC A true end-to-end detection test (Phase 4/5) must insert data ONLY at the
# MAGIC system's entry point and observe outputs produced by the real components.
# MAGIC
# MAGIC **Sequence exercised (persistence only):**
# MAGIC 1. Insert synthetic event
# MAGIC 2. Insert matching IOC
# MAGIC 3. Verify event row round-trips
# MAGIC 4. Verify IOC row round-trips
# MAGIC 5. Manually insert TI match + alert rows (NOT produced by the matcher)
# MAGIC 6. Verify alert row round-trips
# MAGIC 7. Manually insert triage result (NOT produced by the triage agent)
# MAGIC 8. Manually insert response action + approval (NOT produced by Vanguard)
# MAGIC
# MAGIC **Usage:** Run after setup + seed. Non-destructive.

# COMMAND ----------

import sys
sys.path.insert(0, "../_shared")

from config import load_config
from monitoring import Monitor
from pyspark.sql.functions import *
from pyspark.sql.types import *
import uuid
from datetime import datetime, timedelta

cfg = load_config(dbutils, spark)
mon = Monitor(spark, cfg)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Inject Synthetic Event

# COMMAND ----------

test_id = str(uuid.uuid4())
test_ip = "198.51.100.42"
test_domain = "evil-c2.smoke-test.invalid"
test_hash = "a" * 64

events_table = cfg.get_table_path("events")

test_event = spark.createDataFrame([{
    "id": test_id,
    "event_type": "network_connection",
    "timestamp": datetime.utcnow(),
    "source_ip": test_ip,
    "dest_ip": "10.0.0.50",
    "user_id": "smoke-test-user",
    "username": "smoke_tester",
    "hostname": "SMOKE-WS01",
    "domain": test_domain,
    "file_hash": test_hash,
    "action": "connect",
    "outcome": "success",
    "severity": "medium",
    "raw_log": f"SMOKE TEST EVENT {test_id}",
    "ingested_at": datetime.utcnow(),
}])

test_event.write.mode("append").saveAsTable(events_table)
print(f"  PASS  Injected event {test_id} with IP={test_ip}, domain={test_domain}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Inject Matching IOC

# COMMAND ----------

iocs_table = cfg.get_table_path("threat_intel_iocs")
ioc_id = str(uuid.uuid4())

test_ioc = spark.createDataFrame([{
    "id": ioc_id,
    "indicator_type": "ip",
    "value": test_ip,
    "threat_type": "c2_communication",
    "source": "smoke_test",
    "confidence": 0.95,
    "first_seen": datetime.utcnow(),
    "last_seen": datetime.utcnow(),
    "active": True,
}])

test_ioc.write.mode("append").saveAsTable(iocs_table)
print(f"  PASS  Injected IOC {ioc_id} matching IP={test_ip}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Verify Event Exists

# COMMAND ----------

verify_event = spark.sql(f"""
    SELECT id, event_type, source_ip, domain, file_hash
    FROM {events_table}
    WHERE id = '{test_id}'
""")

assert verify_event.count() == 1, f"FAIL: Event {test_id} not found"
row = verify_event.first()
assert row.source_ip == test_ip, f"FAIL: source_ip mismatch"
assert row.domain == test_domain, f"FAIL: domain mismatch"
print(f"  PASS  Event verified: type={row.event_type}, ip={row.source_ip}, domain={row.domain}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Verify IOC Exists

# COMMAND ----------

verify_ioc = spark.sql(f"""
    SELECT id, indicator_type, value, confidence
    FROM {iocs_table}
    WHERE id = '{ioc_id}'
""")

assert verify_ioc.count() == 1, f"FAIL: IOC {ioc_id} not found"
ioc_row = verify_ioc.first()
assert ioc_row.value == test_ip, f"FAIL: IOC value mismatch"
assert ioc_row.confidence == 0.95, f"FAIL: IOC confidence mismatch"
print(f"  PASS  IOC verified: type={ioc_row.indicator_type}, value={ioc_row.value}, confidence={ioc_row.confidence}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5: Manual TI Match + Alert (NOT produced by the matcher)
# MAGIC
# MAGIC These rows are written by hand to exercise table storage only. This step
# MAGIC does NOT run the threat-intel matching engine and does NOT prove detection.

# COMMAND ----------

ti_matches_table = cfg.get_table_path("threat_intel_matches")
alerts_table = cfg.get_table_path("alerts")

match_id = str(uuid.uuid4())
alert_id = str(uuid.uuid4())

match_record = spark.createDataFrame([{
    "id": match_id,
    "event_id": test_id,
    "match_type": "source_ip",
    "matched_indicator": test_ip,
    "threat_type": "c2_communication",
    "confidence": 0.95,
    "ioc_source": "smoke_test",
    "source_ip": test_ip,
    "user_id": "smoke-test-user",
    "event_type": "network_connection",
    "matched_at": datetime.utcnow(),
}])
match_record.write.mode("append").saveAsTable(ti_matches_table)

alert_record = spark.createDataFrame([{
    "id": alert_id,
    "title": f"Threat Intel: c2_communication ({test_ip})",
    "description": f"IOC matched on source_ip. Event: network_connection. Source: smoke_test. Confidence: 0.95",
    "severity": "critical",
    "status": "new",
    "source": "threat_intel_matching",
    "confidence_score": 0.95,
    "created_at": datetime.utcnow(),
}])
alert_record.write.mode("append").saveAsTable(alerts_table)
print(f"  PASS  Stored TI match {match_id} and alert {alert_id} (manual insert)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6: Verify Alert

# COMMAND ----------

verify_alert = spark.sql(f"""
    SELECT id, title, severity, status, confidence_score
    FROM {alerts_table}
    WHERE id = '{alert_id}'
""")

assert verify_alert.count() == 1, f"FAIL: Alert {alert_id} not found"
alert_row = verify_alert.first()
assert alert_row.severity == "critical", f"FAIL: severity={alert_row.severity}"
assert alert_row.status == "new", f"FAIL: status={alert_row.status}"
print(f"  PASS  Alert verified: severity={alert_row.severity}, status={alert_row.status}, confidence={alert_row.confidence_score}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7: Manual Triage Result (NOT produced by the triage agent)

# COMMAND ----------

triage_table = cfg.get_table_path("agent_triage_results")
triage_id = str(uuid.uuid4())

triage_record = spark.createDataFrame([{
    "id": triage_id,
    "alert_id": alert_id,
    "classification": "TRUE_POSITIVE",
    "confidence": 0.92,
    "reasoning": "Persistence test: row inserted by hand, not classified by the agent",
    "recommended_action": "block_ip",
    "triaged_at": datetime.utcnow(),
}])
triage_record.write.mode("append").saveAsTable(triage_table)
print(f"  PASS  Stored triage result {triage_id} (manual insert)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8: Manual Response Action + Approval (NOT produced by Vanguard)

# COMMAND ----------

response_table = cfg.get_table_path("response_actions")
approvals_table = cfg.get_table_path("response_approvals")

action_id = str(uuid.uuid4())
approval_id = str(uuid.uuid4())

action_record = spark.createDataFrame([{
    "id": action_id,
    "alert_id": alert_id,
    "action_type": "block_ip",
    "target": test_ip,
    "status": "pending_approval",
    "created_at": datetime.utcnow(),
}])
action_record.write.mode("append").saveAsTable(response_table)

approval_record = spark.createDataFrame([{
    "id": approval_id,
    "action_id": action_id,
    "status": "pending",
    "requested_at": datetime.utcnow(),
}])
approval_record.write.mode("append").saveAsTable(approvals_table)
print(f"  PASS  Stored response action {action_id} and approval {approval_id} (manual insert, pending)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Final Summary

# COMMAND ----------

print("\n" + "=" * 60)
print(" PERSISTENCE TEST: ALL TABLE-STORAGE STEPS PASSED")
print(" (this does NOT verify detection by any engine)")
print("=" * 60)
print(f"""
  Event:    {test_id}
  IOC:      {ioc_id} (IP={test_ip})
  Match:    {match_id}   (manual insert)
  Alert:    {alert_id} (critical, new)   (manual insert)
  Triage:   {triage_id} (TRUE_POSITIVE)   (manual insert)
  Action:   {action_id} (block_ip, pending_approval)   (manual insert)
  Approval: {approval_id} (pending)   (manual insert)

  Verified: pipeline tables accept and return records with the expected shape.
  NOT verified: that the matcher, triage agent or Vanguard detected anything.
""")

mon.log_complete(details={
    "status": "ALL_PASSED",
    "test_event_id": test_id,
    "test_alert_id": alert_id,
    "persistence_verified": True,
    "detection_verified": False,
})

dbutils.notebook.exit('{"status": "ALL_PASSED", "persistence_verified": true, "detection_verified": false}')

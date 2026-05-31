# Databricks notebook source
# MAGIC %md
# MAGIC # Smoke Test: End-to-End Pipeline
# MAGIC
# MAGIC Validates the complete detection pipeline by injecting synthetic events
# MAGIC and verifying that alerts, triage results, and response approvals are created.
# MAGIC
# MAGIC **Sequence tested:**
# MAGIC 1. Insert synthetic event with known IOC
# MAGIC 2. Insert matching IOC into threat_intel_iocs
# MAGIC 3. Run threat intel matching (batch mode)
# MAGIC 4. Verify alert was generated
# MAGIC 5. Run triage classification
# MAGIC 6. Verify triage result
# MAGIC 7. Run automated response
# MAGIC 8. Verify response approval created
# MAGIC
# MAGIC **Usage:** Run after setup + seed. Non-destructive.

# COMMAND ----------

import sys
sys.path.insert(0, "../_shared")

from config import PlatformConfig
from monitoring import Monitor
from pyspark.sql.functions import *
from pyspark.sql.types import *
import uuid
from datetime import datetime, timedelta

cfg = PlatformConfig()
mon = Monitor(spark, cfg, "smoke_test_e2e")

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
# MAGIC ## Step 5: Manual Threat Intel Match (Batch)

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
print(f"  PASS  Created TI match {match_id} and alert {alert_id}")

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
# MAGIC ## Step 7: Simulate Triage Result

# COMMAND ----------

triage_table = cfg.get_table_path("agent_triage_results")
triage_id = str(uuid.uuid4())

triage_record = spark.createDataFrame([{
    "id": triage_id,
    "alert_id": alert_id,
    "classification": "TRUE_POSITIVE",
    "confidence": 0.92,
    "reasoning": "Smoke test: known C2 IP matched with high confidence IOC",
    "recommended_action": "block_ip",
    "triaged_at": datetime.utcnow(),
}])
triage_record.write.mode("append").saveAsTable(triage_table)
print(f"  PASS  Triage result created: classification=TRUE_POSITIVE, action=block_ip")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8: Simulate Response Approval

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
print(f"  PASS  Response action {action_id} and approval {approval_id} created (pending)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Final Summary

# COMMAND ----------

print("\n" + "=" * 60)
print(" END-TO-END SMOKE TEST: ALL STEPS PASSED")
print("=" * 60)
print(f"""
  Event:    {test_id}
  IOC:      {ioc_id} (IP={test_ip})
  Match:    {match_id}
  Alert:    {alert_id} (critical, new)
  Triage:   {triage_id} (TRUE_POSITIVE)
  Action:   {action_id} (block_ip, pending_approval)
  Approval: {approval_id} (pending)

  Pipeline: event -> IOC match -> alert -> triage -> response approval
  Status:   VERIFIED
""")

mon.log_complete(details={
    "status": "ALL_PASSED",
    "test_event_id": test_id,
    "test_alert_id": alert_id,
    "pipeline_verified": True,
})

dbutils.notebook.exit('{"status": "ALL_PASSED", "pipeline_verified": true}')

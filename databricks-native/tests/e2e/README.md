# Entry-only E2E suite

These scenarios exercise the SOC pipeline the way the outside world does: they
write ONLY at the ingestion boundary (a Kafka topic or a landing-zone file drop)
and assert ONLY on published outputs — `alerts`, `threat_intel_matches`,
`unified_evidence_objects`, `confluence_verdicts`, `agent_triage_results`. No
scenario reads or writes an intermediate table or calls an internal function, so
a green run is real proof the whole path works from sensor to analyst.

## Files

| File | Purpose |
|------|---------|
| `scenarios.py` | The ten journeys as plain data, plus the entry/output allowlists and `validate_suite()`. Stdlib-only. |
| `harness.py` | Live driver. `EntryWriter` writes only to ingestion surfaces, `OutputReader` reads only published outputs, `run_suite(spark, cfg)` drives everything and polls for async results. |
| `test_e2e_entry_only.py` | Offline `__main__` runner. Enforces the suite's contract with plain `python3`; the live run is `blocked` until a workspace is available. |

## The ten scenarios

`ip_ioc_match`, `domain_ioc_match`, `hash_ioc_match`, `auth_chain`,
`lateral_movement`, `exfiltration`, `late_evidence`, `duplicate_delivery`,
`sensor_failure`, `same_ioc_multiple_hosts`.

## Run

```bash
# offline contract check (no workspace)
python3 databricks-native/tests/e2e/test_e2e_entry_only.py

# live end-to-end (from a Databricks notebook with a Spark session)
#   from harness import run_suite
#   run_suite(spark, cfg)                       # landing-only
#   run_suite(spark, cfg, kafka_brokers="...")  # includes Kafka entries
```

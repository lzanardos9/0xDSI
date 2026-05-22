# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 33: Glasswing Mythos Ingestion Pipeline
# MAGIC
# MAGIC **Purpose**: Ingests raw vulnerability findings from Anthropic's Mythos Preview
# MAGIC (via Project Glasswing) in SARIF 2.1, CycloneDX VEX, or raw JSON format.
# MAGIC Normalizes findings into the unified schema, identifies exploit chains,
# MAGIC and registers scan runs for downstream processing.
# MAGIC
# MAGIC **Architecture** (Cloudflare-inspired):
# MAGIC ```
# MAGIC  Mythos Hunt Agents (50+ parallel)
# MAGIC         |
# MAGIC    SARIF / JSON output
# MAGIC         |
# MAGIC  [This Notebook] -- Ingest, Normalize, Chain Detection
# MAGIC         |
# MAGIC   glasswing_findings + glasswing_exploit_chains
# MAGIC ```
# MAGIC
# MAGIC **Schedule**: Triggered on scan completion or every 15 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import hashlib

# COMMAND ----------

# Widget parameters specific to this notebook (bootstrap handles catalog/schema)
dbutils.widgets.text("input_path", "", "Path to SARIF/JSON findings (Volume or DBFS)")
dbutils.widgets.text("input_format", "sarif", "Format: sarif | cyclonedx | json | api")
dbutils.widgets.text("scan_run_name", "", "Scan run name (auto-generated if empty)")
dbutils.widgets.text("target_codebases", "", "Comma-separated list of target repos")

input_path = dbutils.widgets.get("input_path")
input_format = dbutils.widgets.get("input_format")
scan_run_name = dbutils.widgets.get("scan_run_name")
target_codebases = [c.strip() for c in dbutils.widgets.get("target_codebases").split(",") if c.strip()]

if not scan_run_name:
    scan_run_name = f"mythos_scan_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Register Scan Run

# COMMAND ----------

try:
    scan_run_id = str(uuid.uuid4())
    now = datetime.utcnow()

    scan_run_schema = StructType([
        StructField("id", StringType(), False),
        StructField("run_name", StringType(), False),
        StructField("target_codebases", StringType(), True),
        StructField("hunt_agents_count", IntegerType(), True),
        StructField("total_findings", IntegerType(), True),
        StructField("root_causes_found", IntegerType(), True),
        StructField("reachable_count", IntegerType(), True),
        StructField("patches_generated", IntegerType(), True),
        StructField("waf_rules_deployed", IntegerType(), True),
        StructField("duration_seconds", IntegerType(), True),
        StructField("status", StringType(), False),
        StructField("started_at", TimestampType(), False),
        StructField("completed_at", TimestampType(), True),
    ])

    scan_row = [{
        "id": scan_run_id,
        "run_name": scan_run_name,
        "target_codebases": json.dumps(target_codebases),
        "hunt_agents_count": 50,
        "total_findings": 0,
        "root_causes_found": 0,
        "reachable_count": 0,
        "patches_generated": 0,
        "waf_rules_deployed": 0,
        "duration_seconds": 0,
        "status": "ingesting",
        "started_at": now,
        "completed_at": None,
    }]

    scan_run_df = spark.createDataFrame(scan_row, schema=scan_run_schema)
    safe_append(scan_run_df, "glasswing_scan_runs", cfg.catalog, cfg.schema)
    print(f"Registered scan run: {scan_run_name} ({scan_run_id})")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## SARIF Parser
    # MAGIC
    # MAGIC Handles SARIF 2.1.0 output from Mythos hunt agents.

    # COMMAND ----------

    def parse_sarif(sarif_content: dict) -> list:
        """Parse SARIF 2.1.0 format into normalized findings."""
        findings = []
        for run in sarif_content.get("runs", []):
            tool_name = run.get("tool", {}).get("driver", {}).get("name", "mythos_preview")
            rules_map = {}
            for rule in run.get("tool", {}).get("driver", {}).get("rules", []):
                rules_map[rule["id"]] = rule

            for result in run.get("results", []):
                rule_id = result.get("ruleId", "unknown")
                rule_info = rules_map.get(rule_id, {})
                severity_map = {"error": "critical", "warning": "high", "note": "medium", "none": "low"}
                level = result.get("level", "warning")

                locations = result.get("locations", [{}])
                loc = locations[0] if locations else {}
                phys = loc.get("physicalLocation", {})
                artifact = phys.get("artifactLocation", {}).get("uri", "unknown")
                region = phys.get("region", {})

                # Extract exploit chain from properties
                props = result.get("properties", {})
                chain_id = props.get("exploitChainId")
                chain_pos = props.get("chainPosition", 0)
                poc = props.get("proofOfConcept", "")
                bytecode_sig = props.get("bytecodeSignature", "")
                hunt_agent = props.get("huntAgentId", tool_name)

                poc_hash = hashlib.sha256(poc.encode()).hexdigest() if poc else None

                findings.append({
                    "id": str(uuid.uuid4()),
                    "finding_id": f"{rule_id}_{artifact}_{region.get('startLine', 0)}",
                    "codebase": props.get("codebase", target_codebases[0] if target_codebases else "unknown"),
                    "file_path": artifact,
                    "line_start": region.get("startLine"),
                    "line_end": region.get("endLine"),
                    "vuln_class": rule_info.get("properties", {}).get("vulnClass", rule_id),
                    "severity": severity_map.get(level, "medium"),
                    "confidence": props.get("confidence", 0.8),
                    "title": result.get("message", {}).get("text", rule_info.get("shortDescription", {}).get("text", rule_id))[:500],
                    "description": rule_info.get("fullDescription", {}).get("text", ""),
                    "exploit_chain_id": chain_id,
                    "chain_position": chain_pos,
                    "poc_code": poc,
                    "poc_hash": poc_hash,
                    "bytecode_signature": bytecode_sig,
                    "hunt_agent_id": hunt_agent,
                    "scan_run_id": scan_run_id,
                    "sarif_data": json.dumps(result),
                    "status": "ingested",
                    "ingested_at": now.isoformat(),
                })
        return findings


    def parse_json_findings(json_content: list) -> list:
        """Parse raw JSON array of findings from Mythos API."""
        findings = []
        for item in json_content:
            poc = item.get("poc_code", item.get("proof_of_concept", ""))
            poc_hash = hashlib.sha256(poc.encode()).hexdigest() if poc else None
            findings.append({
                "id": str(uuid.uuid4()),
                "finding_id": item.get("id", str(uuid.uuid4())),
                "codebase": item.get("codebase", item.get("repository", "unknown")),
                "file_path": item.get("file_path", item.get("file", "unknown")),
                "line_start": item.get("line_start", item.get("line")),
                "line_end": item.get("line_end"),
                "vuln_class": item.get("vuln_class", item.get("vulnerability_type", "unknown")),
                "severity": item.get("severity", "medium"),
                "confidence": item.get("confidence", 0.7),
                "title": item.get("title", item.get("summary", ""))[:500],
                "description": item.get("description", ""),
                "exploit_chain_id": item.get("exploit_chain_id"),
                "chain_position": item.get("chain_position", 0),
                "poc_code": poc,
                "poc_hash": poc_hash,
                "bytecode_signature": item.get("bytecode_signature"),
                "hunt_agent_id": item.get("hunt_agent_id", "mythos_preview"),
                "scan_run_id": scan_run_id,
                "sarif_data": json.dumps(item),
                "status": "ingested",
                "ingested_at": now.isoformat(),
            })
        return findings

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Load and Parse Input

    # COMMAND ----------

    findings = []

    with mon.time("parse_input"):
        if input_path:
            if input_format == "sarif":
                raw_df = spark.read.option("multiline", "true").json(input_path)
                for row in raw_df.collect():
                    sarif_content = row.asDict()
                    findings.extend(parse_sarif(sarif_content))
            elif input_format == "json":
                raw_df = spark.read.option("multiline", "true").json(input_path)
                items = [row.asDict() for row in raw_df.collect()]
                findings.extend(parse_json_findings(items))
            else:
                raw_text = dbutils.fs.head(input_path, 50_000_000)
                content = json.loads(raw_text)
                if isinstance(content, list):
                    findings.extend(parse_json_findings(content))
                elif "runs" in content:
                    findings.extend(parse_sarif(content))
        else:
            # Demo mode: check landing zone for new files
            landing_path = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing/glasswing"
            try:
                files = dbutils.fs.ls(landing_path)
                for f in files:
                    if f.name.endswith(".sarif") or f.name.endswith(".json"):
                        raw_text = dbutils.fs.head(f.path, 50_000_000)
                        content = json.loads(raw_text)
                        if "runs" in content:
                            findings.extend(parse_sarif(content))
                        elif isinstance(content, list):
                            findings.extend(parse_json_findings(content))
            except Exception as e:
                print(f"No landing zone found or empty: {e}")
                print("Generating synthetic Mythos findings for pipeline validation...")

                # Generate realistic synthetic findings for demo
                synthetic_vulns = [
                    ("buffer_overflow", "critical", "kernel/net/nfs_server.c", "FreeBSD NFS RCE via Chained RPC Requests", 0.97,
                     "Mythos discovered a 17-year-old RCE in FreeBSD NFS server. Chains 6 RPC requests to achieve root from unauthenticated network position.",
                     "chain_freebsd_nfs_rce"),
                    ("use_after_free", "critical", "src/v8/compiler/turbofan.cc", "V8 TurboFan JIT UAF via Speculative Optimization", 0.94,
                     "Use-after-free in V8 TurboFan when speculative optimization triggers on polymorphic call sites. Achieves renderer sandbox escape.",
                     "chain_chromium_sandbox"),
                    ("type_confusion", "critical", "src/v8/runtime/runtime-array.cc", "V8 Runtime Type Confusion in Array.prototype", 0.92,
                     "Type confusion allows controlled OOB read/write. Second step in browser sandbox escape chain.",
                     "chain_chromium_sandbox"),
                    ("sandbox_escape", "critical", "src/browser/sandbox/linux_seccomp.cc", "Chromium Sandbox Escape via Seccomp Filter Bypass", 0.91,
                     "Exploits race condition in seccomp BPF filter application. Final stage of 4-vuln browser exploit chain.",
                     "chain_chromium_sandbox"),
                    ("heap_spray", "high", "src/browser/renderer/v8_heap.cc", "JIT Heap Spray Primitive for Chain Stabilization", 0.89,
                     "Controlled heap spray via JIT code pages. Provides reliability primitive for exploitation.",
                     "chain_chromium_sandbox"),
                    ("integer_overflow", "critical", "kernel/bsd/kern_malloc.c", "OpenBSD Kernel Integer Overflow in malloc", 0.95,
                     "27-year-old integer overflow in kernel malloc. Mythos found what decades of human review missed.",
                     None),
                    ("command_injection", "high", "lib/core/process_manager.py", "Process Manager Command Injection via Unsanitized Hostname", 0.88,
                     "Attacker-controlled hostname flows into subprocess.Popen without sanitization. Reachable from API endpoint /api/v2/nodes/register.",
                     None),
                    ("sql_injection", "high", "src/api/handlers/search.go", "SQL Injection in Full-Text Search Handler", 0.85,
                     "Raw query parameter concatenated into FTS query. Bypasses parameterized query by exploiting custom query parser.",
                     None),
                    ("path_traversal", "high", "pkg/storage/file_handler.go", "Path Traversal in Artifact Download Endpoint", 0.82,
                     "Double-encoding bypass of path sanitization allows reading arbitrary files. /api/v1/artifacts/../../../etc/shadow",
                     None),
                    ("race_condition", "high", "src/auth/session_manager.rs", "TOCTOU Race in Session Validation", 0.79,
                     "Time-of-check/time-of-use between session lookup and privilege assignment. 50ms window allows privilege escalation.",
                     None),
                    ("deserialization", "critical", "lib/messaging/kafka_consumer.java", "Unsafe Deserialization in Kafka Consumer", 0.93,
                     "ObjectInputStream.readObject on untrusted Kafka messages. Gadget chain via commons-collections achieves RCE.",
                     None),
                    ("memory_leak", "medium", "src/networking/tls_handler.c", "TLS Renegotiation Memory Disclosure", 0.71,
                     "Incomplete buffer clearing during TLS renegotiation. Leaks up to 256 bytes of adjacent heap memory per handshake.",
                     None),
                    ("privilege_escalation", "critical", "pkg/rbac/evaluator.go", "RBAC Bypass via Nested Group Membership Cycle", 0.90,
                     "Circular group membership creates infinite expansion. User gains all permissions in the cycle. Affects multi-tenant isolation.",
                     "chain_rbac_escape"),
                    ("auth_bypass", "critical", "pkg/rbac/middleware.go", "JWT Validation Skip on Internal Routes", 0.88,
                     "Internal-tagged routes skip JWT signature validation. Attacker can forge internal route header from external position.",
                     "chain_rbac_escape"),
                    ("ssrf", "high", "src/integrations/webhook_sender.py", "SSRF via Webhook URL Allows Cloud Metadata Access", 0.84,
                     "Webhook delivery follows redirects to internal IPs. AWS metadata at 169.254.169.254 reachable. Credential theft possible.",
                     None),
                    ("cryptographic_weakness", "medium", "lib/crypto/token_gen.rs", "Predictable Token Generation via Weak PRNG Seeding", 0.76,
                     "Token generator seeded with system time at millisecond precision. 1000 attempts sufficient to predict next token.",
                     None),
                ]

                chain_positions = {"chain_chromium_sandbox": {}, "chain_freebsd_nfs_rce": {}, "chain_rbac_escape": {}}
                for i, (vuln_class, severity, file_path, title, confidence, description, chain_id) in enumerate(synthetic_vulns):
                    chain_pos = 0
                    if chain_id:
                        chain_positions[chain_id] = chain_positions.get(chain_id, {})
                        chain_pos = len(chain_positions[chain_id]) + 1
                        chain_positions[chain_id][i] = chain_pos

                    codebase = file_path.split("/")[0] if "/" in file_path else "internal"
                    poc = f"// PoC for {title}\n// Auto-generated by Mythos Preview\n// Confidence: {confidence}\n\n/* REDACTED - Contains working exploit code */\n"

                    findings.append({
                        "id": str(uuid.uuid4()),
                        "finding_id": f"MYTHOS-2026-{i+1:04d}",
                        "codebase": codebase,
                        "file_path": file_path,
                        "line_start": 127 + (i * 43),
                        "line_end": 127 + (i * 43) + 15,
                        "vuln_class": vuln_class,
                        "severity": severity,
                        "confidence": confidence,
                        "title": title,
                        "description": description,
                        "exploit_chain_id": chain_id,
                        "chain_position": chain_pos,
                        "poc_code": poc,
                        "poc_hash": hashlib.sha256(poc.encode()).hexdigest(),
                        "bytecode_signature": hashlib.md5(f"{vuln_class}_{file_path}".encode()).hexdigest()[:16],
                        "hunt_agent_id": f"mythos_hunt_{(i % 8) + 1:02d}",
                        "scan_run_id": scan_run_id,
                        "sarif_data": json.dumps({"synthetic": True, "vuln_class": vuln_class}),
                        "status": "ingested",
                        "ingested_at": now.isoformat(),
                    })

    print(f"Parsed {len(findings)} findings")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Persist Findings

    # COMMAND ----------

    with mon.time("persist_findings"):
        if findings:
            finding_schema = StructType([
                StructField("id", StringType(), False),
                StructField("finding_id", StringType(), False),
                StructField("codebase", StringType(), False),
                StructField("file_path", StringType(), False),
                StructField("line_start", IntegerType(), True),
                StructField("line_end", IntegerType(), True),
                StructField("vuln_class", StringType(), False),
                StructField("severity", StringType(), False),
                StructField("confidence", DoubleType(), False),
                StructField("title", StringType(), True),
                StructField("description", StringType(), True),
                StructField("exploit_chain_id", StringType(), True),
                StructField("chain_position", IntegerType(), True),
                StructField("poc_code", StringType(), True),
                StructField("poc_hash", StringType(), True),
                StructField("bytecode_signature", StringType(), True),
                StructField("hunt_agent_id", StringType(), True),
                StructField("scan_run_id", StringType(), True),
                StructField("sarif_data", StringType(), True),
                StructField("status", StringType(), False),
                StructField("ingested_at", StringType(), False),
            ])

            findings_df = spark.createDataFrame(findings, schema=finding_schema)

            # MERGE to avoid duplicate ingestion
            findings_table = get_table_path(cfg,"glasswing_findings")
            findings_df.createOrReplaceTempView("new_findings")
            spark.sql(f"""
                MERGE INTO {findings_table} AS target
                USING new_findings AS source
                ON target.finding_id = source.finding_id
                WHEN NOT MATCHED THEN INSERT *
            """)
            spark.catalog.dropTempView("new_findings")
            print(f"Persisted {len(findings)} findings to glasswing_findings")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Detect and Register Exploit Chains

    # COMMAND ----------

    with mon.time("chain_detection"):
        chain_findings = [f for f in findings if f.get("exploit_chain_id")]
        chains = {}
        for f in chain_findings:
            cid = f["exploit_chain_id"]
            if cid not in chains:
                chains[cid] = []
            chains[cid].append(f)

        exploit_chains = []
        for chain_id, chain_members in chains.items():
            sorted_members = sorted(chain_members, key=lambda x: x.get("chain_position", 0))
            entry = sorted_members[0]
            exit_member = sorted_members[-1]

            # Determine exploit type from chain composition
            vuln_classes = [m["vuln_class"] for m in sorted_members]
            if "sandbox_escape" in vuln_classes:
                exploit_type = "sandbox_escape"
            elif "privilege_escalation" in vuln_classes or "auth_bypass" in vuln_classes:
                exploit_type = "lpe"
            elif any(v in vuln_classes for v in ["buffer_overflow", "use_after_free", "deserialization"]):
                exploit_type = "rce"
            else:
                exploit_type = "unknown"

            combined_confidence = sum(m["confidence"] for m in sorted_members) / len(sorted_members)
            max_sev = "critical" if any(m["severity"] == "critical" for m in sorted_members) else "high"

            exploit_chains.append({
                "id": str(uuid.uuid4()),
                "chain_name": f"{chain_id.replace('chain_', '').replace('_', ' ').title()} Chain",
                "chain_description": f"Multi-step exploit chain: {' -> '.join(m['vuln_class'] for m in sorted_members)}",
                "total_steps": len(sorted_members),
                "finding_ids": json.dumps([m["id"] for m in sorted_members]),
                "entry_finding_id": entry["id"],
                "exit_finding_id": exit_member["id"],
                "combined_severity": max_sev,
                "combined_confidence": combined_confidence,
                "exploit_type": exploit_type,
                "mitre_techniques": json.dumps(["T1203", "T1068", "T1055"]),
                "full_poc_code": None,
                "status": "discovered",
                "created_at": now,
            })

        if exploit_chains:
            chain_schema = StructType([
                StructField("id", StringType(), False),
                StructField("chain_name", StringType(), False),
                StructField("chain_description", StringType(), True),
                StructField("total_steps", IntegerType(), False),
                StructField("finding_ids", StringType(), False),
                StructField("entry_finding_id", StringType(), True),
                StructField("exit_finding_id", StringType(), True),
                StructField("combined_severity", StringType(), True),
                StructField("combined_confidence", DoubleType(), True),
                StructField("exploit_type", StringType(), False),
                StructField("mitre_techniques", StringType(), True),
                StructField("full_poc_code", StringType(), True),
                StructField("status", StringType(), False),
                StructField("created_at", TimestampType(), False),
            ])
            chains_df = spark.createDataFrame(exploit_chains, schema=chain_schema)
            safe_append(chains_df, "glasswing_exploit_chains", cfg.catalog, cfg.schema)
            print(f"Registered {len(exploit_chains)} exploit chains")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Scan Run Stats

    # COMMAND ----------

    with mon.time("update_scan_run"):
        # Use MERGE via temp view to update scan run stats safely
        hunt_agent_count = len(set(f.get("hunt_agent_id", "") for f in findings))
        scan_update_df = spark.createDataFrame([{
            "id": scan_run_id,
            "total_findings": len(findings),
            "status": "ingested",
            "hunt_agents_count": hunt_agent_count,
        }])
        scan_update_df.createOrReplaceTempView("_scan_run_update")

        scan_runs_table = get_table_path(cfg,"glasswing_scan_runs")
        spark.sql(f"""
            MERGE INTO {scan_runs_table} AS target
            USING _scan_run_update AS source
            ON target.id = source.id
            WHEN MATCHED THEN UPDATE SET
                target.total_findings = source.total_findings,
                target.status = source.status,
                target.hunt_agents_count = source.hunt_agents_count
        """)
        spark.catalog.dropTempView("_scan_run_update")

    # Update agent status via safe_merge
    agent_status_df = spark.createDataFrame([{
        "agent_id": "glasswing_ingest",
        "last_heartbeat": datetime.utcnow(),
        "status": "running",
        "events_processed": len(findings),
        "alerts_generated": len(exploit_chains),
    }])
    safe_merge(
        spark, agent_status_df, "agent_status",
        merge_keys=["agent_id"],
        catalog=cfg.catalog, schema=cfg.schema,
    )

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Complete and Exit

    # COMMAND ----------

    mon.log_metric("findings_ingested", len(findings))
    mon.log_metric("exploit_chains_detected", len(exploit_chains))
    mon.log_complete(rows_processed=len(findings))

    result = {
        "status": "completed",
        "scan_run_id": scan_run_id,
        "findings_ingested": len(findings),
        "exploit_chains_detected": len(exploit_chains),
        "severity_breakdown": {
            "critical": sum(1 for f in findings if f["severity"] == "critical"),
            "high": sum(1 for f in findings if f["severity"] == "high"),
            "medium": sum(1 for f in findings if f["severity"] == "medium"),
            "low": sum(1 for f in findings if f["severity"] == "low"),
        }
    }
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))

except Exception as e:
    mon.log_error(e, context="glasswing_ingest pipeline")
    result = {"status": "error", "error": str(e)}
    dbutils.notebook.exit(json.dumps(result))

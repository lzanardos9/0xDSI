# Databricks notebook source
# MAGIC %md
# MAGIC # Supabase Fleet Sync
# MAGIC Bidirectional synchronization between Databricks Delta tables and the
# MAGIC Supabase-backed edge fleet control plane (used by the UI).
# MAGIC
# MAGIC Provides:
# MAGIC - `SupabaseFleetSync` class for pushing/pulling fleet state
# MAGIC - Heartbeat relay from Delta → Supabase
# MAGIC - Config pull from Supabase → Delta (UI-driven changes)
# MAGIC - Deployment status push from Delta → Supabase (health verdicts)

# COMMAND ----------

import logging
import json
from typing import Optional
from datetime import datetime

logger = logging.getLogger("oxdsi.supabase_sync")


class SupabaseFleetSync:
    """Synchronizes edge fleet state between Databricks Delta and Supabase."""

    def __init__(self, spark, secrets_mgr, cfg):
        self.spark = spark
        self.cfg = cfg
        self._url = secrets_mgr.get_optional("supabase_url")
        self._key = secrets_mgr.get_optional("supabase_service_role_key")
        self._enabled = bool(self._url and self._key)
        if not self._enabled:
            logger.warning(
                "Supabase sync disabled: supabase_url or supabase_service_role_key not configured"
            )

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _headers(self):
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _request(self, method: str, path: str, body=None) -> Optional[dict]:
        """Make a request to Supabase REST API."""
        import urllib.request
        import urllib.error

        url = f"{self._url}/rest/v1/{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                content = resp.read().decode()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as e:
            logger.error(f"Supabase {method} {path}: HTTP {e.code} - {e.read().decode()}")
            return None
        except Exception as e:
            logger.error(f"Supabase {method} {path}: {e}")
            return None

    # ------------------------------------------------------------------
    # Pull: Supabase → Databricks (UI-driven config changes)
    # ------------------------------------------------------------------

    def pull_deployments(self) -> list:
        """Fetch all edge deployments from Supabase UI control plane."""
        if not self._enabled:
            return []
        result = self._request("GET", "edge_deployments?select=*")
        return result if isinstance(result, list) else []

    def pull_connector_configs(self, deployment_id: str = None) -> list:
        """Fetch connector configs from Supabase (created/modified via UI)."""
        if not self._enabled:
            return []
        path = "edge_connector_configs?select=*"
        if deployment_id:
            path += f"&deployment_id=eq.{deployment_id}"
        result = self._request("GET", path)
        return result if isinstance(result, list) else []

    def pull_pending_config_pushes(self) -> list:
        """Fetch pending config pushes that haven't been applied."""
        if not self._enabled:
            return []
        result = self._request("GET", "edge_config_pushes?status=eq.pending&select=*&order=created_at.desc")
        return result if isinstance(result, list) else []

    # ------------------------------------------------------------------
    # Push: Databricks → Supabase (health verdicts, telemetry)
    # ------------------------------------------------------------------

    def push_deployment_status(self, agent_id: str, status: str, cpu: float = None,
                                memory: float = None, buffer_mb: float = None,
                                events_collected: int = None, events_shipped: int = None):
        """Push deployment health status to Supabase for UI display."""
        if not self._enabled:
            return
        body = {
            "status": status,
            "last_heartbeat": datetime.utcnow().isoformat(),
        }
        if cpu is not None:
            body["cpu_percent"] = cpu
        if memory is not None:
            body["memory_mb"] = memory
        if buffer_mb is not None:
            body["buffer_usage_mb"] = buffer_mb
        if events_collected is not None:
            body["events_collected"] = events_collected
        if events_shipped is not None:
            body["events_shipped"] = events_shipped

        self._request("PATCH", f"edge_deployments?agent_id=eq.{agent_id}", body)

    def push_heartbeat(self, deployment_id: str, agent_id: str, status: str,
                       cpu: float, memory: float, buffer_mb: float,
                       eps: float, active_connectors: int, error_count: int,
                       connector_statuses: dict = None):
        """Push a heartbeat record to Supabase for UI real-time display."""
        if not self._enabled:
            return
        body = {
            "deployment_id": deployment_id,
            "agent_id": agent_id,
            "status": status,
            "cpu_percent": cpu,
            "memory_mb": memory,
            "buffer_usage_mb": buffer_mb,
            "events_per_sec": eps,
            "active_connectors": active_connectors,
            "error_count": error_count,
            "connector_statuses": connector_statuses or {},
        }
        self._request("POST", "edge_heartbeats", body)

    def push_fleet_stats(self, stats: dict):
        """Update fleet-wide statistics in Supabase for UI dashboards."""
        if not self._enabled:
            return
        for agent_id, s in stats.items():
            self.push_deployment_status(
                agent_id=agent_id,
                status=s.get("status", "unknown"),
                cpu=s.get("cpu_percent"),
                memory=s.get("memory_mb"),
                buffer_mb=s.get("buffer_usage_mb"),
                events_collected=s.get("events_collected"),
                events_shipped=s.get("events_shipped"),
            )

    def ack_config_push(self, push_id: str, status: str = "applied"):
        """Mark a config push as applied or failed in Supabase."""
        if not self._enabled:
            return
        body = {
            "status": status,
            "applied_at": datetime.utcnow().isoformat(),
        }
        self._request("PATCH", f"edge_config_pushes?id=eq.{push_id}", body)

    # ------------------------------------------------------------------
    # Sync: Bidirectional reconciliation
    # ------------------------------------------------------------------

    def sync_deployments_to_delta(self, deployments_table: str):
        """Pull Supabase deployments and merge into Delta table."""
        if not self._enabled:
            return 0
        deployments = self.pull_deployments()
        if not deployments:
            return 0

        synced = 0
        for d in deployments:
            existing = self.spark.sql(f"""
                SELECT COUNT(*) as cnt FROM {deployments_table}
                WHERE collector_id = '{d.get("agent_id", "")}'
            """).collect()[0].cnt

            if existing == 0:
                self.spark.sql(f"""
                    INSERT INTO {deployments_table} (
                        deployment_id, collector_id, dna_name, hostname,
                        site_name, actual_state, registered_at, updated_at
                    ) VALUES (
                        '{d.get("id", "")}', '{d.get("agent_id", "")}',
                        '{d.get("agent_name", "").replace("'", "''")}',
                        '{d.get("agent_name", "").replace("'", "''")}',
                        '{d.get("site", "default")}', '{d.get("status", "running")}',
                        current_timestamp(), current_timestamp()
                    )
                """)
                synced += 1
            else:
                self.spark.sql(f"""
                    UPDATE {deployments_table}
                    SET actual_state = '{d.get("status", "running")}',
                        updated_at = current_timestamp()
                    WHERE collector_id = '{d.get("agent_id", "")}'
                """)
                synced += 1

        return synced

    def sync_configs_to_delta(self, configs_table: str):
        """Pull UI-created connector configs and write to Delta for framework consumption."""
        if not self._enabled:
            return 0
        configs = self.pull_connector_configs()
        if not configs:
            return 0

        synced = 0
        for c in configs:
            existing = self.spark.sql(f"""
                SELECT COUNT(*) as cnt FROM {configs_table}
                WHERE config_id = '{c.get("connector_id", "")}'
            """).collect()[0].cnt

            if existing == 0:
                self.spark.sql(f"""
                    INSERT INTO {configs_table} (
                        config_id, collector_id, config_scope,
                        filter_rules, sampling_rate, batch_size,
                        batch_interval_ms, max_eps,
                        version, is_active, created_at
                    ) VALUES (
                        '{c.get("connector_id", "")}',
                        '{c.get("deployment_id", "")}',
                        '{c.get("connector_type", "vendor")}',
                        '{json.dumps(c.get("filters", [])).replace("'", "''")}',
                        1.0,
                        {c.get("batch_size", 100)},
                        {c.get("poll_interval_secs", 60) * 1000},
                        {c.get("eps_limit", 10000)},
                        1, true, current_timestamp()
                    )
                """)
                synced += 1

        return synced

    def push_delta_health_to_supabase(self, telemetry_table: str, deployments_table: str):
        """Read latest Delta telemetry and push aggregated health to Supabase."""
        if not self._enabled:
            return 0

        latest = self.spark.sql(f"""
            SELECT d.collector_id, d.hostname, d.site_name, d.actual_state,
                   t.events_per_second, t.cpu_percent, t.memory_percent,
                   t.error_count, t.queue_depth
            FROM {deployments_table} d
            LEFT JOIN (
                SELECT collector_id, events_per_second, cpu_percent, memory_percent,
                       error_count, queue_depth,
                       ROW_NUMBER() OVER (PARTITION BY collector_id ORDER BY timestamp DESC) as rn
                FROM {telemetry_table}
                WHERE timestamp > current_timestamp() - INTERVAL 10 MINUTES
            ) t ON d.collector_id = t.collector_id AND t.rn = 1
            WHERE d.actual_state != 'dead'
        """).collect()

        pushed = 0
        for row in latest:
            self.push_deployment_status(
                agent_id=row.collector_id,
                status=row.actual_state or "unknown",
                cpu=row.cpu_percent,
                memory=row.memory_percent,
                buffer_mb=row.queue_depth / 1000.0 if row.queue_depth else None,
                events_collected=int(row.events_per_second * 3600) if row.events_per_second else None,
            )
            pushed += 1

        return pushed

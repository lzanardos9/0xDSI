# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Secrets Management
# MAGIC Abstraction over Databricks secret scopes with validation,
# MAGIC caching, and clear error messages for missing secrets.

# COMMAND ----------

import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger("oxdsi.secrets")


class SecretNotFound(Exception):
    """Raised when a required secret is not found in any scope."""
    pass


class SecretScopeNotFound(Exception):
    """Raised when the configured secret scope does not exist."""
    pass


@dataclass
class SecretRef:
    """A reference to a secret with metadata."""
    scope: str
    key: str
    description: str = ""
    required: bool = True


# Registry of known secrets used by the SOC platform
KNOWN_SECRETS = {
    # Ingestion
    "kafka_brokers": SecretRef("soc-secrets", "kafka_brokers", "Kafka bootstrap servers"),
    "kafka_sasl_username": SecretRef("soc-secrets", "kafka_sasl_username", "Kafka SASL username"),
    "kafka_sasl_password": SecretRef("soc-secrets", "kafka_sasl_password", "Kafka SASL password"),
    "eventhub_connection": SecretRef("soc-secrets", "eventhub_connection", "Azure Event Hub connection string"),
    "kinesis_access_key": SecretRef("soc-secrets", "kinesis_access_key", "AWS Kinesis access key", required=False),
    "kinesis_secret_key": SecretRef("soc-secrets", "kinesis_secret_key", "AWS Kinesis secret key", required=False),

    # Threat Intelligence
    "virustotal_api_key": SecretRef("soc-secrets", "virustotal_api_key", "VirusTotal API key"),
    "abuseipdb_api_key": SecretRef("soc-secrets", "abuseipdb_api_key", "AbuseIPDB API key"),
    "otx_api_key": SecretRef("soc-secrets", "otx_api_key", "AlienVault OTX API key"),
    "greynoise_api_key": SecretRef("soc-secrets", "greynoise_api_key", "GreyNoise API key", required=False),
    "shodan_api_key": SecretRef("soc-secrets", "shodan_api_key", "Shodan API key", required=False),
    "misp_url": SecretRef("soc-secrets", "misp_url", "MISP server URL"),
    "misp_api_key": SecretRef("soc-secrets", "misp_api_key", "MISP API key"),

    # Response Integrations
    "crowdstrike_client_id": SecretRef("soc-secrets", "crowdstrike_client_id", "CrowdStrike Falcon client ID"),
    "crowdstrike_client_secret": SecretRef("soc-secrets", "crowdstrike_client_secret", "CrowdStrike Falcon client secret"),
    "pagerduty_api_key": SecretRef("soc-secrets", "pagerduty_api_key", "PagerDuty API key"),
    "slack_webhook_url": SecretRef("soc-secrets", "slack_webhook_url", "Slack incoming webhook URL"),
    "teams_webhook_url": SecretRef("soc-secrets", "teams_webhook_url", "Microsoft Teams webhook URL", required=False),
    "servicenow_instance": SecretRef("soc-secrets", "servicenow_instance", "ServiceNow instance URL", required=False),
    "servicenow_username": SecretRef("soc-secrets", "servicenow_username", "ServiceNow username", required=False),
    "servicenow_password": SecretRef("soc-secrets", "servicenow_password", "ServiceNow password", required=False),
    "jira_url": SecretRef("soc-secrets", "jira_url", "Jira server URL", required=False),
    "jira_api_token": SecretRef("soc-secrets", "jira_api_token", "Jira API token", required=False),

    # Cloud Providers
    "aws_access_key_id": SecretRef("soc-secrets", "aws_access_key_id", "AWS access key", required=False),
    "aws_secret_access_key": SecretRef("soc-secrets", "aws_secret_access_key", "AWS secret key", required=False),
    "azure_tenant_id": SecretRef("soc-secrets", "azure_tenant_id", "Azure AD tenant ID", required=False),
    "azure_client_id": SecretRef("soc-secrets", "azure_client_id", "Azure AD client ID", required=False),
    "azure_client_secret": SecretRef("soc-secrets", "azure_client_secret", "Azure AD client secret", required=False),

    # Sandbox & Analysis
    "anyrun_api_key": SecretRef("soc-secrets", "anyrun_api_key", "ANY.RUN sandbox API key", required=False),
    "hybrid_analysis_key": SecretRef("soc-secrets", "hybrid_analysis_key", "Hybrid Analysis API key", required=False),

    # GeoIP
    "maxmind_license_key": SecretRef("soc-secrets", "maxmind_license_key", "MaxMind GeoLite2 license key", required=False),
}


class SecretsManager:
    """
    Production secrets manager for SOC notebooks.

    Features:
    - Lazy loading with caching
    - Clear error messages for missing secrets
    - Scope validation on first access
    - Optional secrets return None instead of raising
    - Batch validation for notebook startup

    Usage:
        from _shared.secrets import SecretsManager
        from _shared.config import load_config

        cfg = load_config(dbutils)
        secrets = SecretsManager(dbutils, cfg.secret_scope)

        # Get a required secret (raises if missing)
        kafka_brokers = secrets.get("kafka_brokers")

        # Get an optional secret (returns None if missing)
        greynoise_key = secrets.get_optional("greynoise_api_key")

        # Validate all secrets needed for a notebook
        secrets.require(["kafka_brokers", "kafka_sasl_username", "kafka_sasl_password"])
    """

    def __init__(self, dbutils, scope: str):
        self._dbutils = dbutils
        self._scope = scope
        self._cache: dict = {}
        self._scope_validated = False

    def _validate_scope(self):
        """Check if the secret scope exists."""
        if self._scope_validated:
            return
        try:
            self._dbutils.secrets.listScopes()
            scopes = [s.name for s in self._dbutils.secrets.listScopes()]
            if self._scope not in scopes:
                raise SecretScopeNotFound(
                    f"Secret scope '{self._scope}' does not exist. "
                    f"Available scopes: {scopes}. "
                    f"Create it with: databricks secrets create-scope {self._scope}"
                )
            self._scope_validated = True
        except SecretScopeNotFound:
            raise
        except Exception as e:
            logger.warning(f"Could not validate secret scope: {e}")
            self._scope_validated = True  # Proceed anyway

    def get(self, key: str) -> str:
        """
        Get a required secret. Raises SecretNotFound if not available.

        Args:
            key: Secret key name (from KNOWN_SECRETS or custom)

        Returns:
            The secret value as a string
        """
        if key in self._cache:
            return self._cache[key]

        self._validate_scope()

        # Resolve scope from registry or use default
        scope = self._scope
        if key in KNOWN_SECRETS:
            scope = KNOWN_SECRETS[key].scope

        try:
            value = self._dbutils.secrets.get(scope=scope, key=key)
            if not value or not value.strip():
                raise SecretNotFound(
                    f"Secret '{key}' in scope '{scope}' is empty. "
                    f"Set it with: databricks secrets put-secret {scope} {key}"
                )
            self._cache[key] = value
            return value
        except Exception as e:
            if "does not exist" in str(e).lower() or "not found" in str(e).lower():
                desc = ""
                if key in KNOWN_SECRETS:
                    desc = f" ({KNOWN_SECRETS[key].description})"
                raise SecretNotFound(
                    f"Secret '{key}'{desc} not found in scope '{scope}'. "
                    f"Set it with: databricks secrets put-secret {scope} {key}"
                )
            raise

    def get_optional(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """
        Get an optional secret. Returns default (None) if not available.
        """
        try:
            return self.get(key)
        except (SecretNotFound, Exception):
            return default

    def require(self, keys: list) -> dict:
        """
        Validate that all required secrets exist at notebook startup.
        Raises a clear error listing ALL missing secrets (not just the first one).

        Returns:
            Dict of key -> value for all validated secrets

        Usage:
            secrets_dict = secrets.require([
                "kafka_brokers", "kafka_sasl_username", "kafka_sasl_password"
            ])
        """
        values = {}
        missing = []

        for key in keys:
            try:
                values[key] = self.get(key)
            except SecretNotFound as e:
                missing.append(str(e))

        if missing:
            raise SecretNotFound(
                f"Missing {len(missing)} required secret(s):\n" +
                "\n".join(f"  - {m}" for m in missing)
            )

        return values

    def has(self, key: str) -> bool:
        """Check if a secret exists without raising."""
        try:
            self.get(key)
            return True
        except (SecretNotFound, Exception):
            return False

    def list_available(self) -> list:
        """List all available secret keys in the configured scope."""
        self._validate_scope()
        try:
            secrets = self._dbutils.secrets.list(scope=self._scope)
            return [s.key for s in secrets]
        except Exception as e:
            logger.error(f"Failed to list secrets: {e}")
            return []

    def get_integration_status(self) -> dict:
        """
        Check which integrations have their secrets configured.
        Useful for startup diagnostics.

        Returns:
            Dict of integration_name -> bool (configured or not)
        """
        categories = {
            "kafka": ["kafka_brokers"],
            "eventhub": ["eventhub_connection"],
            "virustotal": ["virustotal_api_key"],
            "abuseipdb": ["abuseipdb_api_key"],
            "otx": ["otx_api_key"],
            "misp": ["misp_url", "misp_api_key"],
            "crowdstrike": ["crowdstrike_client_id", "crowdstrike_client_secret"],
            "pagerduty": ["pagerduty_api_key"],
            "slack": ["slack_webhook_url"],
            "servicenow": ["servicenow_instance", "servicenow_username", "servicenow_password"],
            "jira": ["jira_url", "jira_api_token"],
            "aws": ["aws_access_key_id", "aws_secret_access_key"],
            "azure": ["azure_tenant_id", "azure_client_id", "azure_client_secret"],
        }

        status = {}
        for name, keys in categories.items():
            status[name] = all(self.has(k) for k in keys)

        return status

# Databricks notebook source
# MAGIC %md
# MAGIC # 48: UEBA Entity Onboarding Agent
# MAGIC
# MAGIC Manages the entity population for UEBA by:
# MAGIC 1. **Bulk Import** - Receives user lists via CSV/JSON/IdP API and inserts into entity_spine
# MAGIC 2. **IdP Sync** - Connects to Azure AD, Okta, Google Workspace to pull org structure
# MAGIC 3. **HR Feed Integration** - Merges employee metadata (department, manager, risk tier)
# MAGIC 4. **Entity Enrichment** - Adds org context to auto-discovered entities
# MAGIC 5. **Deduplication** - Merges duplicate entities with entity_resolution
# MAGIC
# MAGIC ## Trigger: On-demand (manual import) or scheduled (hourly IdP sync)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
import time
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("import_mode", "bulk", "Mode: bulk | idp_sync | hr_feed | enrich | dedup")
dbutils.widgets.text("import_data", "", "JSON array of entities for bulk import")
dbutils.widgets.text("idp_provider", "azure_ad", "IdP: azure_ad | okta | google")

import_mode = dbutils.widgets.get("import_mode")
import_data = dbutils.widgets.get("import_data")
idp_provider = dbutils.widgets.get("idp_provider")

entity_spine_table = get_table_path(cfg, "entity_spine")
entity_edges_table = get_table_path(cfg, "entity_edges")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bulk Import from CSV/JSON

# COMMAND ----------

def bulk_import_entities(raw_data: str) -> dict:
    """
    Import a batch of entities into entity_spine.
    Expected format: JSON array of objects with at minimum:
    - canonical_name: str (required - username/email/employee_id)
    - entity_type: str (default: "user")
    - display_name: str (optional)
    - department: str (optional)
    - title: str (optional)
    - owner: str (optional - manager/supervisor)
    - is_high_value: bool (optional)
    - is_service_account: bool (optional)
    - tags: list[str] (optional)
    - attributes: dict (optional - any extra metadata)
    """
    try:
        entities = json.loads(raw_data)
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON: {str(e)}", "imported": 0}

    if not isinstance(entities, list):
        entities = [entities]

    imported = 0
    skipped = 0
    errors = []

    for entity in entities:
        canonical_name = entity.get("canonical_name", "").strip()
        if not canonical_name:
            skipped += 1
            continue

        entity_type = entity.get("entity_type", "user")
        display_name = entity.get("display_name", canonical_name)
        department = entity.get("department", "")
        owner = entity.get("owner", "")
        is_high_value = entity.get("is_high_value", False)
        is_service_account = entity.get("is_service_account", False)
        tags_list = entity.get("tags", [])
        attributes = entity.get("attributes", {})

        # Add extra fields to attributes
        if entity.get("title"):
            attributes["title"] = entity["title"]
        if entity.get("email"):
            attributes["email"] = entity["email"]
        if entity.get("employee_id"):
            attributes["employee_id"] = entity["employee_id"]
        if entity.get("location"):
            attributes["location"] = entity["location"]
        if entity.get("clearance_level"):
            attributes["clearance_level"] = entity["clearance_level"]
        if entity.get("risk_tier"):
            attributes["risk_tier"] = entity["risk_tier"]

        tags_json = json.dumps(tags_list) if tags_list else "[]"
        attrs_json = json.dumps(attributes) if attributes else "{}"

        try:
            spark.sql(f"""
                MERGE INTO {entity_spine_table} AS target
                USING (SELECT
                    '{canonical_name.replace("'", "''")}' AS canonical_name,
                    '{entity_type}' AS entity_type
                ) AS source
                ON target.canonical_name = source.canonical_name
                   AND target.entity_type = source.entity_type
                WHEN MATCHED THEN UPDATE SET
                    target.display_name = '{display_name.replace("'", "''")}',
                    target.department = '{department.replace("'", "''")}',
                    target.owner = '{owner.replace("'", "''")}',
                    target.is_high_value = {str(is_high_value).lower()},
                    target.is_service_account = {str(is_service_account).lower()},
                    target.tags = '{tags_json.replace("'", "''")}',
                    target.attributes = '{attrs_json.replace("'", "''")}',
                    target.updated_at = current_timestamp()
                WHEN NOT MATCHED THEN INSERT (
                    entity_id, entity_type, canonical_name, display_name,
                    department, owner, is_high_value, is_service_account,
                    tags, attributes, first_seen, last_seen,
                    observation_count, risk_score, updated_at
                ) VALUES (
                    '{str(uuid.uuid4())}', '{entity_type}',
                    '{canonical_name.replace("'", "''")}',
                    '{display_name.replace("'", "''")}',
                    '{department.replace("'", "''")}',
                    '{owner.replace("'", "''")}',
                    {str(is_high_value).lower()},
                    {str(is_service_account).lower()},
                    '{tags_json.replace("'", "''")}',
                    '{attrs_json.replace("'", "''")}',
                    current_timestamp(), current_timestamp(),
                    0, 0.0, current_timestamp()
                )
            """)
            imported += 1
        except Exception as e:
            errors.append(f"{canonical_name}: {str(e)[:100]}")

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:10],
        "total_submitted": len(entities),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identity Provider Sync

# COMMAND ----------

def sync_idp_azure_ad() -> dict:
    """Sync users from Azure AD using Microsoft Graph API."""
    try:
        tenant_id = secrets_mgr.get("azure_ad_tenant_id")
        client_id = secrets_mgr.get("azure_ad_client_id")
        client_secret = secrets_mgr.get("azure_ad_client_secret")
    except Exception:
        return {"error": "Azure AD credentials not configured", "synced": 0}

    import urllib.request

    # Get access token
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = (
        f"client_id={client_id}&scope=https://graph.microsoft.com/.default"
        f"&client_secret={client_secret}&grant_type=client_credentials"
    ).encode()
    req = urllib.request.Request(token_url, data=token_data, method="POST")
    with urllib.request.urlopen(req) as resp:
        token_json = json.loads(resp.read())
    access_token = token_json["access_token"]

    # Fetch users from Graph API
    graph_url = "https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,department,jobTitle,accountEnabled,onPremisesSamAccountName,manager&$top=999"
    headers = {"Authorization": f"Bearer {access_token}"}

    all_users = []
    while graph_url:
        req = urllib.request.Request(graph_url, headers=headers)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        all_users.extend(data.get("value", []))
        graph_url = data.get("@odata.nextLink")

    # Convert to entity format
    entities = []
    for user in all_users:
        entities.append({
            "canonical_name": user.get("onPremisesSamAccountName") or user.get("userPrincipalName", ""),
            "entity_type": "user",
            "display_name": user.get("displayName", ""),
            "department": user.get("department", ""),
            "attributes": {
                "email": user.get("userPrincipalName", ""),
                "title": user.get("jobTitle", ""),
                "azure_ad_id": user.get("id", ""),
                "account_enabled": user.get("accountEnabled", True),
            },
            "is_service_account": not user.get("accountEnabled", True),
            "tags": ["azure_ad", "idp_sync"],
        })

    result = bulk_import_entities(json.dumps(entities))
    result["idp_provider"] = "azure_ad"
    result["users_fetched"] = len(all_users)
    return result


def sync_idp_okta() -> dict:
    """Sync users from Okta."""
    try:
        okta_domain = secrets_mgr.get("okta_domain")
        okta_token = secrets_mgr.get("okta_api_token")
    except Exception:
        return {"error": "Okta credentials not configured", "synced": 0}

    import urllib.request

    url = f"https://{okta_domain}/api/v1/users?limit=200&filter=status+eq+%22ACTIVE%22"
    headers = {"Authorization": f"SSWS {okta_token}", "Accept": "application/json"}

    all_users = []
    while url:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp:
            users = json.loads(resp.read())
            link_header = resp.getheader("Link", "")
        all_users.extend(users)
        url = None
        if 'rel="next"' in link_header:
            for part in link_header.split(","):
                if 'rel="next"' in part:
                    url = part.split(";")[0].strip().strip("<>")

    entities = []
    for user in all_users:
        profile = user.get("profile", {})
        entities.append({
            "canonical_name": profile.get("login", profile.get("email", "")),
            "entity_type": "user",
            "display_name": f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip(),
            "department": profile.get("department", ""),
            "owner": profile.get("manager", ""),
            "attributes": {
                "email": profile.get("email", ""),
                "title": profile.get("title", ""),
                "okta_id": user.get("id", ""),
                "employee_number": profile.get("employeeNumber", ""),
            },
            "tags": ["okta", "idp_sync"],
        })

    result = bulk_import_entities(json.dumps(entities))
    result["idp_provider"] = "okta"
    result["users_fetched"] = len(all_users)
    return result


def sync_idp_google() -> dict:
    """Sync users from Google Workspace Directory API."""
    try:
        service_account_json = secrets_mgr.get("google_workspace_service_account")
        domain = secrets_mgr.get("google_workspace_domain")
    except Exception:
        return {"error": "Google Workspace credentials not configured", "synced": 0}

    return {"error": "Google Workspace sync requires OAuth2 setup", "synced": 0}


IDP_SYNC_FUNCTIONS = {
    "azure_ad": sync_idp_azure_ad,
    "okta": sync_idp_okta,
    "google": sync_idp_google,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity Enrichment (add org context to auto-discovered entities)

# COMMAND ----------

def enrich_entities() -> dict:
    """
    Enrich auto-discovered entities that are missing org context.
    Tries to match by canonical_name against known IdP-imported entities.
    """
    # Find entities with no department set but have observations
    unenriched = spark.sql(f"""
        SELECT entity_id, canonical_name, entity_type, observation_count
        FROM {entity_spine_table}
        WHERE entity_type = 'user'
          AND (department IS NULL OR department = '')
          AND observation_count > 0
        ORDER BY observation_count DESC
        LIMIT 500
    """).collect()

    enriched_count = 0
    for row in unenriched:
        # Look for a matching enriched entity (e.g., imported from IdP with display_name)
        match = spark.sql(f"""
            SELECT department, owner, display_name, attributes, tags
            FROM {entity_spine_table}
            WHERE canonical_name LIKE '%{row.canonical_name.replace("'", "''")}%'
              AND entity_type = 'user'
              AND department IS NOT NULL AND department != ''
              AND entity_id != '{row.entity_id}'
            LIMIT 1
        """).collect()

        if match:
            m = match[0]
            spark.sql(f"""
                UPDATE {entity_spine_table}
                SET department = '{(m.department or "").replace("'", "''")}',
                    owner = '{(m.owner or "").replace("'", "''")}',
                    updated_at = current_timestamp()
                WHERE entity_id = '{row.entity_id}'
            """)
            enriched_count += 1

    return {"enriched": enriched_count, "candidates": len(unenriched)}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity Deduplication

# COMMAND ----------

def deduplicate_entities() -> dict:
    """
    Find and merge duplicate entity_spine entries.
    Duplicates are identified by normalized canonical_name within same type.
    """
    # Find potential duplicates (case-insensitive, trimmed)
    dupes = spark.sql(f"""
        SELECT lower(trim(canonical_name)) AS norm_name, entity_type,
               count(*) AS cnt,
               collect_list(entity_id) AS entity_ids,
               max(observation_count) AS max_obs
        FROM {entity_spine_table}
        GROUP BY lower(trim(canonical_name)), entity_type
        HAVING count(*) > 1
        ORDER BY max_obs DESC
        LIMIT 100
    """).collect()

    merged_count = 0
    for dupe in dupes:
        ids = dupe.entity_ids
        if len(ids) < 2:
            continue

        # Keep the entity with highest observation_count as primary
        primary = spark.sql(f"""
            SELECT entity_id FROM {entity_spine_table}
            WHERE entity_id IN ({','.join(f"'{i}'" for i in ids)})
            ORDER BY observation_count DESC
            LIMIT 1
        """).collect()[0].entity_id

        secondary_ids = [i for i in ids if i != primary]
        secondary_str = ','.join(f"'{i}'" for i in secondary_ids)

        # Aggregate observation counts into primary
        spark.sql(f"""
            UPDATE {entity_spine_table}
            SET observation_count = observation_count + (
                    SELECT COALESCE(SUM(observation_count), 0)
                    FROM {entity_spine_table}
                    WHERE entity_id IN ({secondary_str})
                ),
                merged_from = '{json.dumps(secondary_ids).replace("'", "''")}',
                updated_at = current_timestamp()
            WHERE entity_id = '{primary}'
        """)

        # Repoint edges to primary
        spark.sql(f"""
            UPDATE {entity_edges_table}
            SET source_entity_id = '{primary}', updated_at = current_timestamp()
            WHERE source_entity_id IN ({secondary_str})
        """)
        spark.sql(f"""
            UPDATE {entity_edges_table}
            SET target_entity_id = '{primary}', updated_at = current_timestamp()
            WHERE target_entity_id IN ({secondary_str})
        """)

        merged_count += len(secondary_ids)

    return {"merged": merged_count, "duplicate_groups": len(dupes)}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Based on Mode

# COMMAND ----------

result = {}

if import_mode == "bulk":
    if not import_data:
        result = {"error": "No import_data provided", "imported": 0}
    else:
        result = bulk_import_entities(import_data)

elif import_mode == "idp_sync":
    sync_fn = IDP_SYNC_FUNCTIONS.get(idp_provider)
    if sync_fn:
        result = sync_fn()
    else:
        result = {"error": f"Unknown IdP provider: {idp_provider}"}

elif import_mode == "enrich":
    result = enrich_entities()

elif import_mode == "dedup":
    result = deduplicate_entities()

else:
    result = {"error": f"Unknown import_mode: {import_mode}"}

mon.log_event("ueba_entity_onboarding", result)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Report

# COMMAND ----------

print(f"UEBA Entity Onboarding Complete")
print(f"Mode: {import_mode}")
print(f"Result: {json.dumps(result, indent=2)}")

# Return result for orchestrator
dbutils.notebook.exit(json.dumps(result))

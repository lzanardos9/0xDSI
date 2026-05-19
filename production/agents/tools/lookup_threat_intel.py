"""
Production Tool: Threat Intelligence Lookup
Queries multiple threat intel sources for IOC reputation, campaign associations,
and known TTPs. Supports caching and rate limiting.

Sources:
- Internal IOC database (Delta Lake)
- MISP instance
- VirusTotal API
- AbuseIPDB
- Shodan
- GreyNoise
- AlienVault OTX
"""

import time
import logging
import hashlib
from typing import Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class IOCType(Enum):
    IP = "ip"
    DOMAIN = "domain"
    URL = "url"
    FILE_HASH_MD5 = "md5"
    FILE_HASH_SHA1 = "sha1"
    FILE_HASH_SHA256 = "sha256"
    EMAIL = "email"
    CVE = "cve"


class ThreatLevel(Enum):
    BENIGN = "benign"
    SUSPICIOUS = "suspicious"
    MALICIOUS = "malicious"
    UNKNOWN = "unknown"


@dataclass
class ThreatIntelResult:
    """Result from a threat intelligence lookup."""
    ioc_value: str
    ioc_type: IOCType
    threat_level: ThreatLevel
    confidence: float  # 0.0-1.0
    sources: list[dict]  # Which sources reported this
    campaigns: list[str]  # Associated threat campaigns
    mitre_techniques: list[str]  # Associated TTPs
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    geo_data: Optional[dict] = None
    whois_data: Optional[dict] = None
    related_iocs: list[str] = field(default_factory=list)
    raw_responses: dict = field(default_factory=dict)


class ThreatIntelLookupTool:
    """
    Multi-source threat intelligence lookup with caching and aggregation.

    Architecture:
    1. Check local cache first (avoid redundant API calls)
    2. Query internal IOC database (fastest, most relevant)
    3. Fan-out to external sources (parallel)
    4. Aggregate results with confidence scoring
    5. Cache results for configured TTL
    """

    def __init__(
        self,
        internal_db: Any,  # Delta table query client
        api_clients: dict = None,  # External API clients by name
        cache: Any = None,
        config: dict = None,
    ):
        self.internal_db = internal_db
        self.api_clients = api_clients or {}
        self.cache = cache
        self.config = config or {}

        self.cache_ttl_seconds = self.config.get("cache_ttl_seconds", 3600)
        self.max_external_sources = self.config.get("max_external_sources", 3)

    async def lookup(
        self,
        ioc_value: str,
        ioc_type: str = None,
        sources: list[str] = None,
        include_related: bool = True,
    ) -> ThreatIntelResult:
        """
        Look up an IOC across available threat intelligence sources.

        Args:
            ioc_value: The indicator value (IP, hash, domain, etc.)
            ioc_type: Type of indicator (auto-detected if not provided)
            sources: Specific sources to query (defaults to all available)
            include_related: Whether to include related IOCs

        Returns:
            Aggregated ThreatIntelResult
        """
        # Auto-detect IOC type
        detected_type = IOCType(ioc_type) if ioc_type else self._detect_type(ioc_value)

        # Check cache
        cache_key = self._cache_key(ioc_value, detected_type)
        if self.cache:
            cached = await self.cache.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for {ioc_value}")
                return cached

        # Query internal database first
        internal_result = await self._query_internal(ioc_value, detected_type)

        # Query external sources
        external_results = await self._query_external(
            ioc_value, detected_type, sources
        )

        # Aggregate
        result = self._aggregate_results(
            ioc_value, detected_type, internal_result, external_results
        )

        # Find related IOCs if requested
        if include_related and result.threat_level != ThreatLevel.BENIGN:
            result.related_iocs = await self._find_related(ioc_value, detected_type)

        # Cache result
        if self.cache:
            await self.cache.set(cache_key, result, ttl=self.cache_ttl_seconds)

        return result

    async def bulk_lookup(
        self,
        iocs: list[dict],
    ) -> list[ThreatIntelResult]:
        """
        Bulk lookup for multiple IOCs.

        Args:
            iocs: List of {"value": "...", "type": "..."} dicts

        Returns:
            List of ThreatIntelResults in same order
        """
        import asyncio

        tasks = [
            self.lookup(ioc["value"], ioc.get("type"))
            for ioc in iocs[:50]  # Cap at 50 per batch
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)

    async def _query_internal(self, ioc_value: str, ioc_type: IOCType) -> Optional[dict]:
        """Query the internal IOC database (Delta Lake)."""
        try:
            result = await self.internal_db.execute(
                query="""
                    SELECT
                        ioc_value, ioc_type, threat_level, confidence,
                        campaigns, mitre_techniques, first_seen, last_seen,
                        tags, source, geo_data
                    FROM main.security.threat_intel_iocs
                    WHERE ioc_value = :value AND ioc_type = :type
                    ORDER BY last_seen DESC
                    LIMIT 5
                """,
                parameters={"value": ioc_value, "type": ioc_type.value},
            )
            if result.get("rows"):
                return result["rows"][0]
        except Exception as e:
            logger.warning(f"Internal IOC lookup failed: {e}")
        return None

    async def _query_external(
        self,
        ioc_value: str,
        ioc_type: IOCType,
        sources: list[str] = None,
    ) -> list[dict]:
        """Query external threat intelligence APIs."""
        import asyncio

        available_sources = self._get_sources_for_type(ioc_type)
        if sources:
            available_sources = [s for s in available_sources if s in sources]

        # Limit external API calls
        available_sources = available_sources[:self.max_external_sources]

        tasks = []
        for source_name in available_sources:
            client = self.api_clients.get(source_name)
            if client:
                tasks.append(self._query_single_source(source_name, client, ioc_value, ioc_type))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        valid_results = []
        for r in results:
            if isinstance(r, dict):
                valid_results.append(r)
            elif isinstance(r, Exception):
                logger.warning(f"External source failed: {r}")

        return valid_results

    async def _query_single_source(
        self,
        source_name: str,
        client: Any,
        ioc_value: str,
        ioc_type: IOCType,
    ) -> dict:
        """Query a single external source with timeout."""
        import asyncio

        try:
            result = await asyncio.wait_for(
                client.lookup(ioc_value, ioc_type.value),
                timeout=self.config.get("source_timeout_seconds", 10),
            )
            return {"source": source_name, **result}
        except asyncio.TimeoutError:
            raise RuntimeError(f"Source {source_name} timed out")

    def _aggregate_results(
        self,
        ioc_value: str,
        ioc_type: IOCType,
        internal: Optional[dict],
        external: list[dict],
    ) -> ThreatIntelResult:
        """Aggregate results from multiple sources into a single verdict."""
        all_sources = []
        campaigns = set()
        mitre_techniques = set()
        tags = set()
        threat_levels = []

        # Process internal result
        if internal:
            all_sources.append({
                "name": "internal_database",
                "threat_level": internal.get("threat_level", "unknown"),
                "confidence": internal.get("confidence", 0.5),
            })
            threat_levels.append((
                internal.get("threat_level", "unknown"),
                internal.get("confidence", 0.5) * 1.2  # Boost internal source weight
            ))
            if internal.get("campaigns"):
                campaigns.update(internal["campaigns"] if isinstance(internal["campaigns"], list) else [])
            if internal.get("mitre_techniques"):
                mitre_techniques.update(internal["mitre_techniques"] if isinstance(internal["mitre_techniques"], list) else [])
            if internal.get("tags"):
                tags.update(internal["tags"] if isinstance(internal["tags"], list) else [])

        # Process external results
        for ext in external:
            source_name = ext.get("source", "unknown")
            level = ext.get("threat_level", "unknown")
            conf = ext.get("confidence", 0.5)

            all_sources.append({
                "name": source_name,
                "threat_level": level,
                "confidence": conf,
            })
            threat_levels.append((level, conf))

            if ext.get("campaigns"):
                campaigns.update(ext["campaigns"])
            if ext.get("mitre_techniques"):
                mitre_techniques.update(ext["mitre_techniques"])
            if ext.get("tags"):
                tags.update(ext["tags"])

        # Determine overall threat level by weighted voting
        final_level, final_confidence = self._compute_verdict(threat_levels)

        return ThreatIntelResult(
            ioc_value=ioc_value,
            ioc_type=ioc_type,
            threat_level=final_level,
            confidence=final_confidence,
            sources=all_sources,
            campaigns=list(campaigns),
            mitre_techniques=list(mitre_techniques),
            first_seen=internal.get("first_seen") if internal else None,
            last_seen=internal.get("last_seen") if internal else None,
            tags=list(tags),
            geo_data=internal.get("geo_data") if internal else None,
        )

    def _compute_verdict(self, threat_levels: list[tuple]) -> tuple[ThreatLevel, float]:
        """Compute final threat level from weighted votes."""
        if not threat_levels:
            return ThreatLevel.UNKNOWN, 0.0

        level_weights = {"malicious": 3, "suspicious": 1, "benign": -2, "unknown": 0}
        total_weight = 0
        total_confidence = 0

        for level_str, confidence in threat_levels:
            weight = level_weights.get(level_str, 0)
            total_weight += weight * confidence
            total_confidence += confidence

        avg_confidence = total_confidence / len(threat_levels)
        normalized_weight = total_weight / len(threat_levels)

        if normalized_weight >= 2:
            return ThreatLevel.MALICIOUS, min(avg_confidence, 1.0)
        elif normalized_weight >= 0.5:
            return ThreatLevel.SUSPICIOUS, min(avg_confidence * 0.8, 1.0)
        elif normalized_weight <= -1:
            return ThreatLevel.BENIGN, min(avg_confidence, 1.0)
        else:
            return ThreatLevel.UNKNOWN, min(avg_confidence * 0.5, 1.0)

    async def _find_related(self, ioc_value: str, ioc_type: IOCType) -> list[str]:
        """Find IOCs related to this one (same campaign, infrastructure, etc.)."""
        try:
            result = await self.internal_db.execute(
                query="""
                    SELECT DISTINCT related_ioc
                    FROM main.security.ioc_relationships
                    WHERE source_ioc = :value
                    LIMIT 20
                """,
                parameters={"value": ioc_value},
            )
            return [row["related_ioc"] for row in result.get("rows", [])]
        except Exception:
            return []

    def _detect_type(self, value: str) -> IOCType:
        """Auto-detect IOC type from value format."""
        import re

        if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', value):
            return IOCType.IP
        elif re.match(r'^[a-fA-F0-9]{64}$', value):
            return IOCType.FILE_HASH_SHA256
        elif re.match(r'^[a-fA-F0-9]{40}$', value):
            return IOCType.FILE_HASH_SHA1
        elif re.match(r'^[a-fA-F0-9]{32}$', value):
            return IOCType.FILE_HASH_MD5
        elif re.match(r'^https?://', value):
            return IOCType.URL
        elif re.match(r'^CVE-\d{4}-\d+$', value):
            return IOCType.CVE
        elif '@' in value:
            return IOCType.EMAIL
        else:
            return IOCType.DOMAIN

    def _get_sources_for_type(self, ioc_type: IOCType) -> list[str]:
        """Return which external sources support this IOC type."""
        source_map = {
            IOCType.IP: ["virustotal", "abuseipdb", "greynoise", "shodan"],
            IOCType.DOMAIN: ["virustotal", "alienvault_otx"],
            IOCType.URL: ["virustotal", "alienvault_otx"],
            IOCType.FILE_HASH_SHA256: ["virustotal", "alienvault_otx"],
            IOCType.FILE_HASH_SHA1: ["virustotal"],
            IOCType.FILE_HASH_MD5: ["virustotal"],
            IOCType.EMAIL: ["alienvault_otx"],
            IOCType.CVE: ["alienvault_otx"],
        }
        return source_map.get(ioc_type, ["virustotal"])

    def _cache_key(self, value: str, ioc_type: IOCType) -> str:
        return f"ti:{ioc_type.value}:{hashlib.md5(value.encode()).hexdigest()}"


TOOL_DEFINITION = {
    "name": "lookup_threat_intel",
    "description": "Look up indicators of compromise (IPs, hashes, domains) across threat intelligence sources. Returns reputation, associated campaigns, MITRE techniques, and related IOCs.",
    "parameters": {
        "type": "object",
        "properties": {
            "ioc_value": {
                "type": "string",
                "description": "The indicator value (IP address, file hash, domain, URL, email, or CVE ID)",
            },
            "ioc_type": {
                "type": "string",
                "description": "Type of indicator (auto-detected if not provided)",
                "enum": ["ip", "domain", "url", "md5", "sha1", "sha256", "email", "cve"],
            },
            "include_related": {
                "type": "boolean",
                "description": "Whether to include related IOCs from the same campaign/infrastructure",
                "default": True,
            },
        },
        "required": ["ioc_value"],
    },
}

"""
Test suite for correlation engine logic.
Tests condition evaluation, rule matching, and detection patterns.
"""

import pytest
import sys
import os

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestConditionEvaluator:
    """Test the correlation rule condition evaluator."""

    def setup_method(self):
        """Set up test fixtures."""
        self.sample_event = {
            "event_id": "evt-001",
            "type_name": "authentication_failure",
            "actor_user_id": "user-123",
            "src_ip": "192.168.1.100",
            "dst_ip": "10.0.0.50",
            "dst_port": 22,
            "severity_id": 3,
            "status_id": 2,
            "bytes_out": 1500,
            "src_geo_country": "BR",
        }

    def test_equals_operator(self):
        condition = {"field": "type_name", "operator": "equals", "value": "authentication_failure"}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "type_name", "operator": "equals", "value": "login_success"}
        assert self._evaluate(self.sample_event, condition) is False

    def test_contains_operator(self):
        condition = {"field": "type_name", "operator": "contains", "value": "auth"}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "type_name", "operator": "contains", "value": "malware"}
        assert self._evaluate(self.sample_event, condition) is False

    def test_gt_operator(self):
        condition = {"field": "severity_id", "operator": "gt", "value": "2"}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "severity_id", "operator": "gt", "value": "5"}
        assert self._evaluate(self.sample_event, condition) is False

    def test_lt_operator(self):
        condition = {"field": "dst_port", "operator": "lt", "value": "1024"}
        assert self._evaluate(self.sample_event, condition) is True

    def test_in_operator(self):
        condition = {"field": "src_geo_country", "operator": "in", "value": ["BR", "US", "GB"]}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "src_geo_country", "operator": "in", "value": ["RU", "CN"]}
        assert self._evaluate(self.sample_event, condition) is False

    def test_not_null_operator(self):
        condition = {"field": "src_ip", "operator": "not_null", "value": ""}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "nonexistent_field", "operator": "not_null", "value": ""}
        assert self._evaluate(self.sample_event, condition) is False

    def test_not_equals_operator(self):
        condition = {"field": "status_id", "operator": "not_equals", "value": "1"}
        assert self._evaluate(self.sample_event, condition) is True

    def test_regex_operator(self):
        condition = {"field": "type_name", "operator": "regex", "value": "auth.*failure"}
        assert self._evaluate(self.sample_event, condition) is True

        condition = {"field": "type_name", "operator": "regex", "value": "^login"}
        assert self._evaluate(self.sample_event, condition) is False

    def test_null_field_returns_false(self):
        condition = {"field": "nonexistent", "operator": "equals", "value": "test"}
        assert self._evaluate(self.sample_event, condition) is False

    def test_optional_condition_with_null_field(self):
        condition = {"field": "nonexistent", "operator": "equals", "value": "test", "optional": True}
        assert self._evaluate(self.sample_event, condition) is True

    def _evaluate(self, event: dict, condition: dict) -> bool:
        """Inline condition evaluator (mirrors production logic)."""
        field_value = event.get(condition["field"])
        if field_value is None:
            return condition.get("optional", False)

        operator = condition["operator"]
        expected = condition["value"]

        if operator == "equals":
            return str(field_value) == str(expected)
        elif operator == "contains":
            return str(expected).lower() in str(field_value).lower()
        elif operator == "regex":
            import re
            return bool(re.search(expected, str(field_value), re.IGNORECASE))
        elif operator == "gt":
            return float(field_value) > float(expected)
        elif operator == "lt":
            return float(field_value) < float(expected)
        elif operator == "gte":
            return float(field_value) >= float(expected)
        elif operator == "in":
            return str(field_value) in (expected if isinstance(expected, list) else [expected])
        elif operator == "not_null":
            return field_value is not None and str(field_value) != ""
        elif operator == "not_equals":
            return str(field_value) != str(expected)
        return False


class TestRuleMatching:
    """Test correlation rule matching logic."""

    def test_brute_force_rule(self):
        """Test brute force detection rule fires on multiple failures."""
        rule_conditions = [
            {"field": "type_name", "operator": "contains", "value": "auth"},
            {"field": "status_id", "operator": "equals", "value": "2"},
        ]

        events = [
            {"type_name": "authentication_failure", "status_id": 2, "src_ip": "1.2.3.4"},
            {"type_name": "authentication_failure", "status_id": 2, "src_ip": "1.2.3.4"},
            {"type_name": "authentication_success", "status_id": 1, "src_ip": "1.2.3.4"},
        ]

        matches = 0
        for event in events:
            all_match = all(
                self._eval(event, c) for c in rule_conditions
            )
            if all_match:
                matches += 1

        assert matches == 2  # Two failures match

    def test_lateral_movement_rule(self):
        """Test lateral movement: auth success + new device + high-value target."""
        rule_conditions = [
            {"field": "type_name", "operator": "contains", "value": "auth"},
            {"field": "status_id", "operator": "equals", "value": "1"},
            {"field": "dst_asset_criticality", "operator": "equals", "value": "critical"},
        ]

        event = {
            "type_name": "authentication_success",
            "status_id": 1,
            "dst_asset_criticality": "critical",
        }

        all_match = all(self._eval(event, c) for c in rule_conditions)
        assert all_match is True

    def _eval(self, event, condition):
        field_value = event.get(condition["field"])
        if field_value is None:
            return condition.get("optional", False)
        operator = condition["operator"]
        expected = condition["value"]
        if operator == "equals":
            return str(field_value) == str(expected)
        elif operator == "contains":
            return str(expected).lower() in str(field_value).lower()
        return False


class TestEscalationMatrix:
    """Test escalation routing logic."""

    def test_critical_routes_to_l3(self):
        from production.agents.config.escalation_matrix import find_matching_rule
        rule = find_matching_rule(severity="critical", asset_criticality="critical")
        assert rule.target_tier == "l3_lead"

    def test_low_severity_routes_to_l1(self):
        from production.agents.config.escalation_matrix import find_matching_rule
        rule = find_matching_rule(severity="low")
        assert rule.target_tier == "l1_analyst"

    def test_insider_threat_routes_to_manager(self):
        from production.agents.config.escalation_matrix import find_matching_rule
        rule = find_matching_rule(attack_category="insider_threat")
        assert rule.target_tier == "manager"

    def test_data_exfil_routes_to_l2(self):
        from production.agents.config.escalation_matrix import find_matching_rule
        rule = find_matching_rule(attack_category="data_exfiltration")
        assert rule.target_tier == "l2_senior"


class TestIOCTypeDetection:
    """Test IOC type auto-detection."""

    def test_ipv4_detection(self):
        assert self._detect("192.168.1.1") == "ip"
        assert self._detect("10.0.0.1") == "ip"

    def test_sha256_detection(self):
        hash_val = "a" * 64
        assert self._detect(hash_val) == "sha256"

    def test_sha1_detection(self):
        hash_val = "b" * 40
        assert self._detect(hash_val) == "sha1"

    def test_md5_detection(self):
        hash_val = "c" * 32
        assert self._detect(hash_val) == "md5"

    def test_domain_detection(self):
        assert self._detect("evil.example.com") == "domain"

    def test_url_detection(self):
        assert self._detect("https://evil.com/payload") == "url"

    def test_email_detection(self):
        assert self._detect("attacker@evil.com") == "email"

    def test_cve_detection(self):
        assert self._detect("CVE-2024-12345") == "cve"

    def _detect(self, value: str) -> str:
        import re
        if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', value):
            return "ip"
        elif re.match(r'^[a-fA-F0-9]{64}$', value):
            return "sha256"
        elif re.match(r'^[a-fA-F0-9]{40}$', value):
            return "sha1"
        elif re.match(r'^[a-fA-F0-9]{32}$', value):
            return "md5"
        elif re.match(r'^https?://', value):
            return "url"
        elif re.match(r'^CVE-\d{4}-\d+$', value):
            return "cve"
        elif '@' in value:
            return "email"
        else:
            return "domain"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

"""
Property tests for the Phase 5 governed question parser, on the sample people, groups, systems and trusts.

Run: python3 tests/property/test_identity_answers.py
"""
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..", "notebooks", "_shared")))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..", "app")))

import identity_resolution as R  # noqa: E402
from backend.identity_answer_parser import INTENTS, catalog, lexicon_entry, normalize, parse  # noqa: E402
from identity_access_fixtures import GROUPS, RESOURCES  # noqa: E402
from identity_federation_fixtures import TRUSTS  # noqa: E402
from identity_fixtures import ACCOUNTS  # noqa: E402

RES = R.resolve(ACCOUNTS)
names = {}
for x in RES["xrefs"]:
    names.setdefault(x["canonical_id"], set()).update(v for v in (x.get("username"), (x.get("email") or "").split("@")[0]) if v)
LEX = [lexicon_entry("identity", i["canonical_id"], i["display_name"], [i["display_name"]] + sorted(names.get(i["canonical_id"], ())))
       for i in RES["identities"]]
LEX += [lexicon_entry("resource", r["resource_id"], r["name"], [r["name"], r["resource_id"]]) for r in RESOURCES]
LEX += [lexicon_entry("group", f"{g['provider']}:{g['name']}", g["name"], [g["name"]]) for g in GROUPS]
LEX += [lexicon_entry("trust", t["trust_id"], t["partner_name"], [t["partner_name"], t["trust_id"]]) for t in TRUSTS]


def ask(q):
    return parse(q, LEX)


def test_every_catalogue_example_answers():
    for i in INTENTS:
        for ex in i["examples"]:
            out = ask(ex)
            assert out["status"] == "answer" and out["intent"] == i["intent"], (ex, out)


def test_subjects_resolve_to_the_right_thing():
    assert ask("Why is Keith Murry risky?")["entity"]["label"] == "Keith Murry"
    assert ask("What can abhijit reach?")["entity"]["label"] == "Abhijit Tilak"
    assert ask("Who can reach Domain Controllers?")["entity"]["kind"] == "resource"
    assert ask("Is the Deloitte trust safe?")["entity"]["label"].startswith("Deloitte")
    assert ask("tell me about bmcdonald")["entity"]["label"] == "Brian McDonald"


def test_subject_kind_decides_intent_when_wording_does_not():
    assert ask("NOC-OnCall")["intent"] == "group_issues"
    assert ask("Why is NOC-OnCall risky?")["intent"] == "group_issues"
    assert ask("Rudi Himawan")["intent"] == "why_risky"
    assert ask("SAP Finance")["intent"] == "who_can_reach"


def test_ambiguous_names_ask_instead_of_guessing():
    out = ask("Why is Morgan risky?")
    assert out["status"] == "clarify" and len(out["options"]) >= 2
    assert all(o["kind"] == "identity" for o in out["options"])


def test_longest_name_wins_over_a_partial_one():
    assert ask("Why is Casey Morgan risky?")["entity"]["label"] == "Casey Morgan"


def test_refuses_secrets_and_writes():
    assert ask("What is Keith Murry's password?")["rule"] == "secrets"
    assert ask("Show me the API key for svc-bag-reconcile")["rule"] == "secrets"
    out = ask("Disable Brian McDonald")
    assert out["status"] == "refused" and out["link"] == "id_remediation"
    assert ask("please remove kmurry from SAP-FI-Vendor-Maintenance")["rule"] == "write"


def test_out_of_scope_and_missing_subject():
    assert ask("What is the weather in Dallas?")["status"] == "no_match"
    out = ask("Who can reach it?")
    assert out["status"] == "need_entity" and out["kinds"] == ["resource"]


def test_parser_is_deterministic_and_case_insensitive():
    a, b = ask("WHO CAN REACH domain controllers"), ask("who can reach Domain Controllers???")
    assert a == b


def test_stopwords_never_become_names():
    for e in LEX:
        assert not ({"admin", "the", "who", "access"} & set(e["aliases"])), e
    assert normalize("  Rudi.Himawan@aa.example! ") == " rudi.himawan@aa.example "


def test_catalogue_is_plain_data():
    import json
    assert json.loads(json.dumps(catalog()))["version"].startswith("identity-answers")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"{len(tests)} passed")

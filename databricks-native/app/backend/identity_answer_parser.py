"""
Governed question parser for Identity Answers (Phase 5).

No language model is involved: a question is normalised, checked against refusal rules, matched to one approved
intent by fixed patterns, and its subject is resolved against names that exist in the datalake. Anything outside
the catalogue is refused or answered with "I can't answer that". The catalogue is plain data so the browser
preview can apply exactly the same rules.
"""

import re

ANSWERS_VERSION = "identity-answers-v1"
MAX_QUESTION = 300
KINDS = ("identity", "resource", "group", "trust")

REFUSALS = [
    {"rule": "secrets", "pattern": r"\b(password|passwords|passcode|secret|secrets|private key|api key|token|tokens|otp|recovery code)\b",
     "reason": "Identity Answers never returns passwords, keys or other secrets."},
    {"rule": "write", "pattern": r"^(please )?(can you |could you )?(disable|enable|delete|remove|revoke|grant|add|reset|unlock|lock|block|approve|change|create|give|make)\b",
     "reason": "Identity Answers only reads. To change access, use Identity Remediation, where every change is approved "
               "by someone else and can be rolled back.", "link": "id_remediation"},
]

INTENTS = [
    {"intent": "top_risk", "title": "Highest-risk identities", "entity": [],
     "patterns": [r"\b(riskiest|highest risk|most risky|top risk|critical (identities|users|people|accounts))\b",
                  r"\bwho (is|are) (the )?(most )?(at risk|risky)\b"],
     "examples": ["Who are the riskiest identities?"]},
    {"intent": "leavers", "title": "Leavers who still have access", "entity": [],
     "patterns": [r"\b(leaver|leavers|terminated|departed|left the company|offboard|offboarding)\b"],
     "examples": ["Which leavers still have access?"]},
    {"intent": "guests", "title": "Guest accounts that need attention", "entity": [],
     "patterns": [r"\bguests?\b", r"\bexternal (users|accounts|people)\b"],
     "examples": ["Which guest accounts need attention?"]},
    {"intent": "mfa_gaps", "title": "People without MFA", "entity": [],
     "patterns": [r"\b(no|without|missing|lack) (an )?mfa\b", r"\bmfa (gap|gaps|enrolment|enrollment)\b", r"\bnot enrolled\b"],
     "examples": ["Who has no MFA?"]},
    {"intent": "pending_remediation", "title": "Remediation waiting for a decision", "entity": [],
     "patterns": [r"\bremediations?\b", r"\b(waiting|pending|awaiting) (for )?(an )?approval\b", r"\bapprovals?\b"],
     "examples": ["What remediations are waiting for approval?"]},
    {"intent": "owner_of", "title": "Who owns something", "entity": ["group", "resource", "trust", "identity"],
     "patterns": [r"\bwho owns\b", r"\bowner of\b", r"\bowned by\b", r"\bowner\b"],
     "examples": ["Who owns Airport-Ramp-Ops?"]},
    {"intent": "who_can_reach", "title": "Who can reach a system", "entity": ["resource"],
     "patterns": [r"\bwho\b.*\b(reach|access|get to|get into|admin|use)\b", r"\b(access|paths?) (to|into)\b"],
     "examples": ["Who can reach Domain Controllers?"]},
    {"intent": "what_access", "title": "What an identity can reach", "entity": ["identity"],
     "patterns": [r"\bwhat\b.*\b(reach|access|get to|get into)\b", r"\b(crown jewels?|attack paths?)\b"],
     "examples": ["What can Abhijit Tilak reach?"]},
    {"intent": "group_issues", "title": "Problems with a group", "entity": ["group"],
     "patterns": [r"\bgroups?\b", r"\bmembers?\b", r"\bnest(ed|ing)\b"],
     "examples": ["What is wrong with the NOC-OnCall group?"]},
    {"intent": "trust_posture", "title": "Is a trust configured safely", "entity": ["trust"],
     "patterns": [r"\btrusts?\b", r"\bfederation\b", r"\bpartner\b", r"\bsso\b"],
     "examples": ["Is the Deloitte trust safe?"]},
    {"intent": "recent_activity", "title": "What happened to an identity", "entity": ["identity"],
     "patterns": [r"\b(happened|changed|activity|timeline|recent|recently|events?|history)\b"],
     "examples": ["What happened to Brian McDonald recently?"]},
    {"intent": "why_risky", "title": "Why an identity is risky", "entity": ["identity"],
     "patterns": [r"\bwhy\b", r"\brisk", r"\bscore\b", r"\bexplain\b", r"\btell me about\b", r"\bwho is\b"],
     "examples": ["Why is Keith Murry risky?"]},
]
DEFAULT_INTENT = {"identity": "why_risky", "resource": "who_can_reach", "group": "group_issues", "trust": "trust_posture"}
NAME_STOPWORDS = {"admin", "admins", "user", "users", "team", "group", "guest", "service", "account", "prod", "test",
                  "the", "who", "what", "access", "trust", "partner", "owner", "risk", "domain", "cloud", "external"}


def normalize(text: str) -> str:
    tokens = [t.strip(".") for t in re.sub(r"[^a-z0-9@.]+", " ", (text or "").lower()).split()]
    return " " + " ".join(t for t in tokens if t) + " "


def lexicon_entry(kind: str, eid: str, label: str, names) -> dict:
    """One resolvable subject. Full names always count; single first/last names only when distinctive."""
    aliases = set()
    for n in names:
        a = normalize(n).strip()
        short = normalize((n or "").split("(")[0]).strip()
        aliases.update(x for x in (a, short) if len(x) >= 3)
        if kind == "identity" and n and n == label:
            for tok in a.split():
                if len(tok) >= 4 and tok not in NAME_STOPWORDS:
                    aliases.add(tok)
    return {"kind": kind, "id": eid, "label": label, "aliases": sorted(aliases)}


def parse(question: str, lexicon: list) -> dict:
    """Return {status, intent, entity, options, reason, link}. status: answer|refused|clarify|need_entity|no_match."""
    q = normalize(question)
    for r in REFUSALS:
        if re.search(r["pattern"], q.strip()):
            return {"status": "refused", "reason": r["reason"], "link": r.get("link"), "rule": r["rule"]}

    hits = {}
    for e in lexicon:
        best = max((len(a) for a in e["aliases"] if f" {a} " in q), default=0)
        if best:
            hits[(e["kind"], e["id"])] = (best, e)
    intent = next((i for i in INTENTS if any(re.search(p, q) for p in i["patterns"])), None)

    def pick(kinds):
        found = [(n, e) for (k, _), (n, e) in hits.items() if k in kinds]
        if not found:
            return None, []
        top = max(n for n, _ in found)
        best = sorted((e for n, e in found if n == top), key=lambda e: (e["kind"], e["label"]))
        return (best[0] if len(best) == 1 else None), best

    if intent and not intent["entity"]:
        return {"status": "answer", "intent": intent["intent"], "entity": None}
    if intent:
        entity, tied = pick(intent["entity"])
        if not entity and not tied and hits:
            entity, tied = pick(KINDS)
            if entity:
                intent = next(i for i in INTENTS if i["intent"] == DEFAULT_INTENT[entity["kind"]])
    else:
        entity, tied = pick(KINDS)
        if entity:
            intent = next(i for i in INTENTS if i["intent"] == DEFAULT_INTENT[entity["kind"]])
    if tied and not entity:
        return {"status": "clarify", "intent": intent["intent"] if intent else None,
                "options": [{"kind": e["kind"], "id": e["id"], "label": e["label"]} for e in tied[:6]]}
    if not intent:
        return {"status": "no_match"}
    if not entity:
        return {"status": "need_entity", "intent": intent["intent"], "kinds": intent["entity"]}
    return {"status": "answer", "intent": intent["intent"],
            "entity": {"kind": entity["kind"], "id": entity["id"], "label": entity["label"]}}


def catalog() -> dict:
    return {"version": ANSWERS_VERSION, "max_question": MAX_QUESTION, "refusals": REFUSALS, "intents": INTENTS,
            "default_intent": DEFAULT_INTENT, "name_stopwords": sorted(NAME_STOPWORDS)}

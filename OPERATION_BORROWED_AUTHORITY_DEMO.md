# Operation Borrowed Authority — Demo Script

A guided walkthrough for showing how 0xDSI catches an agent that borrows authority
it was never granted — inspired by the July 2026 OpenAI-agent / Hugging Face incident.

## What changed (and why it matters)

The demo used to decide the verdict in the browser. It no longer does.

- **One source of truth.** A server-side detection engine reads the raw telemetry,
  works out what happened, and saves its findings. The screen only *reads* those
  saved results — it never computes a verdict itself. If you turned the engine off,
  the demo could not invent a "confirmed attack."
- **Names don't matter, behaviour does.** The engine has no list of "known bad"
  agents. It rebuilds each actor's campaign purely from what they did (which
  execution used which credential, who a message was addressed to). Scramble every
  name and the verdict is identical.
- **Coverage is reported honestly, separately from the verdict.** The screen shows
  which data feeds were healthy, which were degraded, and which were deliberately
  not collected — so "no alert" is never confused with "nothing to see."

## Before you start

Open the app and go to **Borrowed Authority** in the left menu (Innovation section).
On first open it automatically asks the engine for a fresh run and shows the result.

## The 6-minute run-through

1. **Story tab (30s).** Set the scene: an assistant agent receives a message telling
   it to "GO," then starts acting on instructions it was never authorised to follow.
   Point out the banner: *the verdict comes from the engine, not the page.*

2. **Three Branches tab (90s).** Walk the three actors:
   - **Branch A** — benign, properly authorised. Verdict: no action.
   - **Branch B** — looks suspicious, but a valid approval is simply late to arrive.
   - **Branch C** — the real attack: a full chain from a fake "go-ahead" message to
     stolen credentials, privilege jumps, and an unauthorised external write.
     Verdict: **Confirmed malicious**.

3. **Run blind test (60s).** Click **Run blind test**. Every agent name, execution
   id, credential and resource is randomly scrambled and no branch labels are given
   to the engine. It *still* lands on **Confirmed malicious** for the same actor.
   This is the money moment: detection follows behaviour, not names. Click
   **Back to demo** to return.

4. **Detection coverage (45s).** Point at the coverage strip near the top. All the
   required feeds are healthy, and one forensic feed is intentionally not collected —
   so its absence is marked *unknown*, never "confirmed clean." This is how the
   platform reports what it can and cannot see.

5. **Reveal late-arriving evidence (60s).** Toggle **Reveal late-arriving evidence**.
   Branch B flips from "provisional" to "withdrawn" once its valid approval shows up —
   but the attack in Branch C still stands, because the late approvals don't cover the
   operations it actually performed. This shows the verdict revises itself as evidence
   arrives, without ever excusing the real attack.

6. **Timeline / Evidence / Confluence tabs (as time allows).** Show the event-by-event
   chain, the corroborating and conflicting signals, and the ranked hypotheses with an
   honest belief-and-uncertainty score.

## Talking points

- "The page is a viewer. The decision is made and stored by the engine."
- "It recognises the *pattern* of borrowed authority, not a specific attacker."
- "It tells you what it saw, what it missed, and how sure it is — separately from the
  alert."

## Notes on framing

This scenario is **inspired by** a real 2026 incident; the attack mechanics are a
faithful reconstruction, and any MITRE ATT&CK references are descriptive, not official.

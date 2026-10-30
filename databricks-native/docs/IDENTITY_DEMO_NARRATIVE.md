# Flight AA-IDN: "Cleared for Takeover"

A 20-minute live demo of the Identity section, told as one flight. Every name, number and click below matches the sample data shipped with the app, so the story works the same in the Databricks app and in the browser preview.

> **The hook (say this first):** "Last week, Brian McDonald left American Airlines. His badge was collected. His laptop was wiped. And yesterday, his account signed in. Today we're going to find out who else is still on board who shouldn't be, and we're going to land the plane without breaking anything."

---

## Before you start

| Item | Detail |
|------|--------|
| Duration | 20 minutes (a 10-minute cut is at the end) |
| Where | Left menu → **Identity** (12 pages) |
| Data | Sample data for a fictional AA estate: 6 directories (Active Directory, Entra ID, PingDirectory, Saviynt, Duo, app-local), 32 identities, 13 routes to crown jewels |
| Databricks app | Everything works, including requesting, approving and rolling back changes (in dry-run mode, so nothing is really sent to a directory) |
| Browser preview | Same data and pages. Request, approve and roll back buttons explain that these steps are signed by real people in the Databricks app |
| Tip | Open **Access Graph & Paths** once before the demo so the animation is warm, then go back to **Identity Overview** |

### The cast

| Character | Role in the story | Why they matter |
|-----------|------------------|-----------------|
| **Brian McDonald** | The ghost | Left on 20 Oct. Still live in Entra ID and Duo, signed in after leaving, still owns a service account, a partner trust and a guest's sponsorship |
| **Keith Murry** | The double agent (accidentally) | Riskiest identity (80, critical). Can create vendors *and* approve payments in SAP; kept ramp access after moving departments |
| **Abhijit Tilak** | The traveller | 70, critical. Signed in from Romania four hours after his MFA was reset |
| **Rudi Himawan** | The back door | Network on-call engineer who reaches the Domain Controllers through two layers of group nesting. Also switched off SID filtering on the cargo forest trust |
| **Blessy Baby** | The helpdesk hop | Standard user. Helpdesk password-reset rights let her take over Marcus Bell's admin account and reach the loyalty database |
| **Todd Trncak** | The target | Hit by 5 MFA push denials in 10 minutes, a classic MFA-fatigue attack |
| **Luiz Zanardo** | The quiet promotion | Added to Domain Admins by adm-tgreen with no change ticket |
| **Fare Pricing Copilot** | The stowaway (headline reveal) | An AI agent nobody registered, running on a GPU box, sitting in an ownerless group with **export** rights on the AAdvantage Loyalty Database |
| **Tom Ellis, Carlos Mendes, Nina Park** | The guests | Deloitte auditor whose sponsor left; Envoy guest who owns production cloud subscriptions; a guest from a partner nobody reviewed |

---

## Act 1 — Boarding: "Who is actually on this plane?" (3 min)

**Page: Identity Overview**

1. Point at the cards across the top: people, workloads and agents, each with its account count.
   > "Six directories, 69 accounts, and the platform has stitched them into one person each. Not by guessing: by HR worker ID and employee ID. Anything less certain waits for a human."
2. Point at the source health list: every directory shows when it last delivered and whether the snapshot was complete.
   > "If a feed goes stale, we say so. We never quietly score yesterday's data as today's."
3. Point at the findings: state conflicts, orphaned non-human identities, an unverified agent.
   > "Keep that 'unverified agent' in mind. It comes back later."

**Page: Identity Explorer** → search `Brian`.

4. Open Brian McDonald. Show his accounts side by side: Active Directory and Saviynt **disabled**, Entra ID and Duo **enabled**.
   > "HR says he's gone. Active Directory and Saviynt agree. Entra ID and Duo didn't get the memo. This is the most common identity gap in the industry, and it's invisible if you look at one directory at a time."

**Page: Resolution Review**

5. Show a pending match (for example the three Jordan Riveras).
   > "Same name, similar email, different people. The system scored the evidence and refused to merge them on its own. A steward decides, and every decision is recorded."

**WOW #1:** *One person, every directory, with the platform openly saying what it isn't sure about.*

---

## Act 2 — Taxi: "Follow the ghost" (3 min)

**Page: Identity Timeline** → choose Brian McDonald.

1. Scroll through the timeline: HR termination on 20 Oct, then a **successful sign-in after termination**.
   > "This is the moment. A sign-in, by a person who doesn't work here."
2. Show the findings attached: *Terminated but still enabled in duo:bmcdonald, entra_id:brian.mcdonald*, and *Owner departed* on the **Baggage Reconciliation Service**.
   > "And he wasn't just a user. He owned a service account. When he left, nobody inherited it."
3. Switch to **Todd Trncak**: *5 MFA push denials within 10 minutes*.
   > "Someone is hammering Todd's phone hoping he taps Approve to make it stop."
4. Switch to **Abhijit Tilak**: *Sign-in from RO within 4h of an MFA reset; usual: US*.
   > "Reset the MFA, then sign in from another continent. Each event is harmless alone. Together, on one timeline, they're a story."

**WOW #2:** *HR events, sign-ins, MFA and access changes on one line per person, from every system.*

---

## Act 3 — Takeoff: "How bad is it, and how would they get in?" (5 min)

**Page: Identity Risk**

1. Show the bands: two critical, two high.
2. Open **Keith Murry (80, critical)**. Read the factors aloud:
   > "Crown-jewel access, a segregation-of-duties conflict, privilege on a standard account, standing privilege, and timeline findings. Every point has evidence behind it. No black-box score."
3. Point out the SoD conflict: Keith can **create vendors** and **approve payments** in SAP Finance.
   > "That's the textbook recipe for paying a fake supplier."

**Page: Access Graph & Paths** (the showpiece; take your time)

4. Let the map draw itself. Let the audience watch the lines flow from people to accounts to groups to the gold crown-jewel systems on the right.
   > "This is every route, from every identity, to every crown jewel, live."
5. Point out the **red animated line** and the **pulsing ring** on the AAdvantage Loyalty Database.
   > "Red means takeover. Something on this route can reset someone else's password."
6. Hover **Blessy Baby**. Everything else fades and her route lights up: *bbaby → Helpdesk-Tier1 → can take over (reset password) → adm-mbell → Loyalty-DB-Admins → AAdvantage Loyalty Database (admin)*.
   > "Blessy is a regular employee. But she's on the helpdesk, the helpdesk can reset Marcus Bell's admin password, and Marcus administers the loyalty database. Four hops from a standard account to every member's mileage balance."
7. Hover **Rudi Himawan**: *NOC-OnCall → nested in Tier0-Operations → nested in Domain Admins → Domain Controllers*.
   > "Nobody ever added Rudi to Domain Admins. A group inside a group inside a group did it for them."
8. Click the **Domain Controllers** card to focus the map. Turn on **Takeover only**. Then click **Full screen**.

### The stowaway reveal (headline WOW)

9. Clear the filter and click the **AAdvantage Loyalty Database** card. Three identities appear. Two are people. Hover the third.
   > "Remember the unverified agent from Act 1? Meet the **Fare Pricing Copilot**. An AI agent that someone spun up on a GPU server. Nobody registered it, nobody owns it, and it sits in a group called *Pricing-Model-Training*, purpose 'Temporary', with **export** rights on the loyalty database."
   >
   > "Not admin. Export. It doesn't need to break anything. It just needs to copy."

**Page: Non-Human & Agents** → show the Copilot: discovered, no owner, no GRC application link.

**Page: Group Context** → open **Pricing-Model-Training**: no owner, one member, an open finding.
   > "A 'temporary' group with no owner is how temporary becomes permanent."

**WOW #3:** *A live, explainable map of how anyone (people, services or AI agents) can reach what matters, with the AI agent nobody knew about.*

---

## Act 4 — Turbulence: "Rehearse the fix before you touch production" (4 min)

**Page: What-If Simulator**

1. Open **Cut the Pricing Copilot's loyalty export**.
   > "Before we change anything, we run the change on a copy of today's access data."

   Result: 1 route removed, 15 risk points removed, nobody else affected.
2. Open **Un-nest NOC-OnCall from Tier0-Operations**: Rudi's back door closes, 40 risk points removed.
3. Open **Split Keith Murry's SAP duties**: critical identities drop from 2 to 1.
4. Now the safety net. Open **Delete Domain Admins (lockout check)**.
   > "Let's do something reckless: delete Domain Admins."

   The lockout warning appears: **Domain Controllers would be left with nobody able to administer them** (3 people before, 0 after).
   > "The simulator just stopped us from locking the whole company out of its own domain. That's the most expensive mistake in identity, caught in a rehearsal."
5. Optional live build: **New scenario** → pick a change → run it on today's data.

**Page: Federation Posture**

6. Show the trust cards failing the baseline:
   - **cargo.aa.example forest**: 0 of 3 checks pass. SID filtering was turned **off** by rudi.himawan.
     > "Rudi again. SID filtering is what stops another forest from forging admin rights in ours."
   - **Partner SSO** is still signing with **RSA-SHA1** and accepts the partner's MFA claim.
   - **Ping to Entra ID** signing certificate expires **12 Nov**, under 30 days away.
     > "That's an outage on a calendar. We found it before it found us."
7. Guests: **Carlos Mendes** (Envoy) is in *Cloud-Subscription-Owners*; **Tom Ellis** (Deloitte) has a sponsor who left (Brian, again); **Nina Park** belongs to a partner nobody has reviewed.

**WOW #4:** *Rehearse every change, see the blast radius, and get a hard stop before a lockout.*

---

## Act 5 — Landing: "Fix it, with a co-pilot, and keep the receipts" (4 min)

**Page: Identity Remediation**

1. Walk the five stage cards from left to right: **To review 7 · Awaiting approval 2 · In progress 0 · Done 2 · Closed 2**.
   > "Every proposal here came from a real finding, was simulated first, and is reversible. Deleting groups is never proposed."
2. **To review** → open **Remove kmurry from Airport-Ramp-Ops**: it's **blocked**.
   > "The fix looks obvious: Keith moved departments, take his ramp access away. But he's the last active person who can reach Flight Operations Control. The platform blocks it rather than ground the airline."
3. **Awaiting approval** → open **Remove NOC-OnCall from Tier0-Operations**: **1 of 2 approvals**.
   > "Privileged changes need two people. The person who asked can never approve. And votes are tied to the exact change: if the access data moves, old votes stop counting."
4. **Done** → **Disable account bmcdonald**: executed, with the before-state and the exact undo stored.
5. **Done** → **Disable account tom.ellis…**: executed, then **rolled back**.
   > "Then his contract was extended to December. One click, same approvals, same audit trail, and he's back. The reason is recorded with the rollback."
6. **Closed** → a rejected request (**Remove bbaby from Helpdesk-Tier1**) and a dismissed one.
   > "No is a valid answer, and it's recorded too."

In the **Databricks app**, sign in as a second analyst and approve a request live to show the two-person rule. In the **preview**, clicking Approve explains that this step is signed by a real person.

**Page: Identity Answers** (the closer: make it conversational)

Type these in order:

| Type this | What happens | Line |
|-----------|-------------|------|
| `Who are the riskiest identities?` | Ranked table, Keith Murry first, with sources | "Plain English in, cited facts out." |
| `Why is the Fare Pricing Copilot risky?` | 35 points: 2 hygiene findings + loyalty database export via Pricing-Model-Training | "Every row has a source you can click." |
| `Who can reach the AAdvantage Loyalty Database?` | Blessy Baby (admin), Fare Pricing Copilot (export), Marcus Bell (admin) | "The whole Act 3 in one sentence." |
| `What can Jordan Rivera reach?` | It **asks which Jordan Rivera** you mean (there are three) | "It would rather ask than guess." |
| `What is Brian McDonald's password?` | **Refused**: never returns secrets | Pause for the laugh. |
| `Delete Domain Admins` | **Refused**: points to Identity Remediation | "It reads. It doesn't act. Changes go through approval." |
| `Is the Deloitte trust safe?` | Fails the baseline; owner has left | |
| `What happened to Todd Trncak recently?` | The MFA-fatigue burst | |

> **Closing line:** "Brian left. His access didn't. In twenty minutes we found him, three back doors and an AI agent copying the loyalty database. We rehearsed every fix, refused the one that would have locked us out, fixed the rest with two signatures each, and can undo any of it. Ladies and gentlemen, welcome to your destination."

**WOW #5:** *A governed fix pipeline and an assistant that answers with evidence, refuses secrets and never writes.*

---

## The 10-minute cut

1. **Identity Explorer** → Brian McDonald (disabled in AD, live in Entra and Duo).
2. **Identity Timeline** → Brian signs in after termination.
3. **Access Graph & Paths** → hover Blessy, then reveal the Fare Pricing Copilot.
4. **What-If Simulator** → Delete Domain Admins lockout warning.
5. **Identity Remediation** → the blocked Keith fix and the Tom Ellis rollback.
6. **Identity Answers** → "Why is the Fare Pricing Copilot risky?", then the password refusal.

---

## Questions you'll get

| Question | Answer |
|----------|--------|
| Is this real AI deciding things? | No model decides access. Matching, scoring and simulation are deterministic and explainable. Identity Answers uses a fixed, approved list of question types with read-only lookups; nothing typed becomes a database query. |
| Can it change our directories today? | It runs in dry-run mode: every approved change is recorded exactly as it would be sent, but not sent. Going live needs AA's sign-off and a least-privilege connector per directory. |
| What stops an analyst approving their own change? | The requester can never approve. Privileged changes need two approvers, and approvals are tied to the exact change and data version. |
| Who sees what? | Pages and answers run with the signed-in user's own data permissions, so nobody sees rows they couldn't query directly. Every question asked is logged. |
| Where does the data live? | In the Databricks lakehouse, alongside your security data. Nothing leaves the platform. |
| What's needed to run it on real data? | Read-only exports from each directory, the HR worker ID, the crown-jewel list, segregation-of-duties rules and agreed risk weights. See the Inputs section of the delivery plan. |

---

## Resetting between runs

- **Databricks app**: re-run the identity fixture seeding and the **Identity 01** job to restore the sample state. Approvals and rollbacks you made live stay in the history unless the schema is reset.
- **Browser preview**: reload the page. Questions you asked in Identity Answers are cleared.

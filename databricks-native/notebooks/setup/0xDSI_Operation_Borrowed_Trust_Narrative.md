# 0xDSI: Follow the Evidence, Not Just the Alert
## Detection-as-Data and a deep walkthrough of CEP and CET
### Operation Borrowed Trust — 30-minute presenter narrative

**Delivery:** Approximately 30 minutes at about 125 spoken words per minute, including the demonstration and pauses. Section times are pacing targets, not guarantees. The incident is synthetic. Headings and bracketed directions are not spoken.

**Presenter note — not spoken:** The demonstration passages describe the intended rehearsed presentation, not a workspace run performed by the script's author. Use the live-result wording only after confirming the deployed adapter, actual backend, per-trend provenance, and selective cancellation. An offline replacement is provided in the companion presenter notes. Package availability alone is not proof of native C execution.

---

## 00:00–02:00 | The identity is legitimate. The conclusion is not obvious.

Let me start with an incident that does not begin with a failed login.

The identity is legitimate. Authentication succeeds. The permissions exist. The activity happens during a production release.

And that identity is involved in three different executions.

One is deploying an application. One is running a financial reconciliation job. One is reading restricted data and moving an output outside its approved workflow.

They share an identity. They do not share an explanation.

Now make the evidence messy. The privilege-change record arrives after the data-access record. The authorization for the reconciliation job arrives late. Several candidate paths overlap, and the same service account appears throughout.

Which execution deserves investigation? Which conclusion should change? And what prevents an approval for one job from clearing every other job using the same identity?

That is the problem I want to explore with you.

Not simply whether we can detect a sequence. Whether we can build an explanation, test it against changing evidence, and correct it without losing the threat that remains.

I will focus on two things: Detection-as-Data, and the mechanics of Complex Event Processing and Complete Event Trend—CEP and CET.

Our example is synthetic. The engineering questions are the point.

By the end, I want us to be able to answer a more demanding question than “Did the rule fire?”

**What evidence made the conclusion valid, and what evidence would make us change it?**

[Pause.]

## 02:00–05:00 | Data is not decoration around the detection

When I say data as detection, I mean that security meaning is not contained entirely inside the rule.

It also depends on relationships, history, business context, and the quality of our observations.

In this example, the access log tells us that a workload read a dataset. It does not, by itself, tell us whether that read belonged to an approved financial job or an unauthorized export.

The job definition matters. The execution identifier matters. The dataset's sensitivity matters. The authorization's scope matters. The destination matters.

Those are not attachments somebody opens after an alert. They help determine whether the alert's underlying hypothesis is supported.

**The authorization record is not commentary on the detection. It is an input to the detection.**

Detection-as-Data extends that principle across the lifecycle.

The observations are data. The detector version is data. The matched path, the assumptions, the score explanation, the analyst decision, and the correction are all things we should preserve and inspect.

Imagine an analyst asking why we escalated the reconciliation job at nine-oh-six, but withdrew that finding at nine-oh-nine.

“Because the score changed” is not enough.

The useful answer identifies the observations available at the first decision, the exact authorization record that arrived later, and the condition that record invalidated.

We also need to distinguish observation from inference.

“The workload accessed these records” is an observation. “The workload was compromised” is a hypothesis. “The activity violates this workflow policy” is a conclusion that depends on both the observation and the policy.

They should not collapse into one sentence that sounds more certain than its evidence.

This complements detection-as-code. We still want version control, tests, review, and deployment discipline. But reviewing the rule is only half the job. We also need to examine what happened when that rule met real observations.

For this team, that is the opportunity: apply engineering discipline to the life of a security conclusion, not only to the code that first produced it.

An alert can remain a useful notification. It should not become the only surviving record of how we reached a decision.

## 05:00–07:00 | One platform, with an attachable engine

Architecturally, I want to separate the evidence model from the engine that evaluates it.

The platform bridge is the integration point for an attachable CET engine. It selects an execution path, delegates to the engine package, and routes successful results toward the platform's shared trend tables.

That is delegation, not a second implementation of the C matcher inside the application.

It is also why engine availability and engine execution are different questions. A package being installed does not tell us which backend produced a particular result.

We need the run to tell us.

The fallback policy matters too. Automatic mode allows fallback to the built-in GraphFrames path. Explicit native mode is different: it should report that the requested execution could not be completed rather than quietly claim native success.

**Continuity is valuable. Invisible degradation is not.**

Now connect this to the raw-data fork.

The principle is to preserve source-faithful evidence and avoid making every useful detector wait for every normalization and enrichment step.

That does not mean detection without parsing. Detectors still need an input contract.

Nor should we confuse that broader principle with this particular integration: the bridge under discussion reads platform Silver events. The Silver-to-CET path is not, by itself, proof of pre-normalization execution.

The architectural value is that raw observations, normalized events, and engine outputs remain connected, rather than forcing the organization to adopt a new evidence universe every time it changes a detection component.

The engine is replaceable. The obligation to explain its conclusions is not.

## 07:00–10:00 | Operation Borrowed Trust

Let us make the example concrete. I call it Operation Borrowed Trust.

Our service identity is called release-service. It is used during a production release at a fictional financial-services company.

Execution A deploys the application and reads configuration. Its release context is available. Its actions fit that context.

Execution B runs a reconciliation job. It reads sensitive production records and writes a reconciliation output. That operation requires an execution-specific authorization record. The record exists, but its delivery to our evidence pipeline is delayed.

Execution C uses the same identity in a separate execution. It accesses restricted datasets and sends an output to a destination outside the approved workflow. In our synthetic ground truth, this is the malicious branch.

The detector does not get that ground truth. It gets observations.

B and C can initially produce absence-dependent findings because the required authorization evidence has not been observed. C can also support a separate finding about the destination and the data movement.

Neither finding should be translated into “everything this identity does is malicious.”

Now introduce branching within the executions. Multiple role events and repeated reads across three resources create competing candidate paths. Some satisfy the sequence. Some miss a required relationship. Some fall outside the interval. Some belong to a different execution entirely.

The workload is no longer a straight line of five convenient records.

It is a set of possible explanations that the engine must evaluate without stitching unrelated activity into a fictional attack.

For C, the session begins at nine o'clock. A privilege change occurs at nine-oh-one. Restricted-data access occurs at nine-oh-three. The outbound transfer occurs at nine-oh-four.

But the privilege-change record does not arrive until nine-oh-six.

At nine-oh-four, the platform has evidence of access and transfer without that earlier privilege-change observation. Two minutes later, the missing part of the sequence arrives.

And at nine-oh-nine, B's authorization record arrives, carrying an earlier event time inside B's relevant interval.

That gives us two different changes: new evidence that completes a suspicious sequence, and new evidence that invalidates a different finding.

**One identity. Three executions. Two corrections to our understanding. Not one blanket verdict.**

## 10:00–13:00 | CEP: keep the partial matches, respect the clock

Start with CEP.

Its logical job is to ask whether observations satisfy a defined pattern. For this scenario, we could look for role activity followed by sensitive reads and an outbound transfer within a configured interval.

The first relevant observation starts a partial match. A partial match records what we have seen and what remains necessary.

As more events arrive, candidate matches advance, branch, expire, or fail their constraints.

A second read might extend an existing path. A read from another execution should not. A transfer outside the time interval should not complete it. An unrelated event between two relevant events may or may not interrupt the match, depending on the sequence policy.

That last decision needs to be explicit. Strict adjacency and “these events occur in order, with other activity allowed between them” are different meanings.

Repetition is another decision. “One or more reads” creates alternatives. The engine may have several valid ways to connect observations, and those paths can share events.

We must define which results we emit and how overlapping evidence is represented. Ten overlapping paths are not automatically ten independent threats.

Think of two reads from B and one transfer from C. A careless join on service identity and time could produce a very convincing-looking chain that never happened as one execution. The execution relationship is what stops that fabricated story. This is why correlation keys are part of detection correctness, not merely a performance optimization.

Now return to the delayed privilege change.

Processing order is when the platform handles the records. Event order is when their timestamps say the activity occurred.

The transfer reached us before the privilege-change record did. That does not mean the transfer happened first.

**We must not turn the order of log delivery into the order of an attack.**

In a stateful streaming pipeline, lateness policies and watermarks help bound how much state we retain. Longer tolerance can preserve more opportunities to incorporate delayed evidence, at a cost in state and potentially latency.

But a watermark is not a certificate that every source has finished reporting. Nor does sorting timestamps repair an incorrect source clock.

So our detector contract needs an explicit policy for late evidence, and an explicit route for corrections beyond the live processing horizon.

CEP gives us the pattern evidence. It does not remove the need to preserve relationships, explain time assumptions, and revise downstream conclusions.

## 13:00–16:00 | CET: turn the sequence into inspectable evidence

CET means Complete Event Trend in the engine repository.

Complete does not mean omniscient. It means representing a matched trend and its supporting observations—not claiming that every event in the world was captured.

The engine contract requires an event identifier, a partition key, an event type, and event time in milliseconds. Attributes provide additional security context.

At the platform boundary, mapping and validating that contract is the adapter's responsibility. The engine should not have to guess whether a source field represents a user, a session, or an execution.

In our example, identity provides shared context, but the matching and authorization scope must distinguish executions A, B, and C. Tenant boundaries also remain explicit.

A missing execution identifier is not permission to merge three jobs into one story.

The security graph builder represents observations as event vertices and adds relationships. Those can include temporal adjacency, shared identity or session information, shared resources, and process-parent relationships when the necessary data is present.

Notice that these are event vertices. The runtime is not merely maintaining a directory of users and machines. It is connecting observations through relationships that can be inspected.

An edge should explain why the connection exists. Sharing an identity is not the same evidence as sharing an execution. Sharing an address is not proof of a common actor.

And temporal order plus connectivity does not, by itself, prove causation.

The query specification then defines what qualifies as a trend: the sequence, allowed repetition, time interval, and applicable constraints, together with the query's version.

The Python query layer represents richer constructs such as optional steps, alternatives, bounded repetition, relationship constraints, field predicates, and absence conditions. The native C language is narrower.

That boundary matters. A richer language above the matcher does not mean every construct executes inside C, or that post-validation can recover candidates the matcher never generated.

The standard for the demonstration is simple: the selected execution path must support the selected query, not silently approximate it.

**A detection language is a contract about meaning. Its implementation has to preserve that meaning—not just accept the syntax.**

## 16:00–19:00 | Inside the native matcher: why branching matters

Now let us open the native engine.

It receives event vertices and edges, builds an adjacency index, and explores candidate paths.

A search state carries the path collected so far, the current position in the query, and the starting event time.

When it considers extending a path, it checks the required event type and applicable predicate hook. It checks that time does not move backward. It checks the total query interval and applicable edge windows.

A rejected extension does not become evidence merely because it would make a compelling attack story.

In Operation Borrowed Trust, this is where competing paths matter. Several reads may be available after role activity. Some lead to a relevant transfer. Others are outside the interval or are excluded by the correctly scoped candidate graph and constraints.

The runtime contains three search strategies: M-CET, T-CET, and H-CET.

M-CET explores depth-first: follow a candidate route, then return to alternatives.

T-CET uses a breadth-first queue of partial states: expand candidates across the search frontier.

H-CET combines them. It generates prefix matches using breadth-first exploration up to a configured switch depth, then extends those seed paths depth-first.

Make the search concrete. Suppose a candidate has already matched role activity and a sensitive read. The next observation is another sensitive read. With repetition allowed, the search can continue that repeated step while also considering progression toward the transfer. Each branch carries its own path and starting time. When a transfer arrives, only paths that satisfy the sequence and temporal checks can complete.

The path is therefore more than a list assembled afterward. It records the observations used to satisfy the query.

These are alternative execution strategies, not three separate definitions of compromise.

The engineering question is which strategy performs appropriately for the query and graph while preserving the required results. A five-event line barely exposes that question. Branching, repeated events, overlapping paths, and selective constraints do.

The runtime also offers optional POSIX-thread parallelism and a memory-mapped workspace. Local native threads are not the same thing as distribution across Spark executors. Spark already introduces task-level concurrency, so adding native threads requires deliberate sizing.

Memory mapping is an allocation choice, not proof of durable evidence storage or unlimited capacity.

Most importantly, the engine exposes diagnostics for rejected transitions, state growth, and truncation or overflow.

A completed function call is not necessarily a complete search.

If a limit prevented exploration, we must preserve that fact. We should not tell an analyst “nothing else matched” when the truthful answer is “the search stopped before evaluating everything.”

**Speed matters. Knowing what the engine actually evaluated matters just as much.**

## 19:00–22:00 | Standing queries: conclusions have a lifecycle

The standing runtime adds another dimension: the question remains active as observations change.

In the current implementation, an incoming event updates temporal state and triggers re-evaluation of the affected partition. The runtime compares the resulting supported trends with those previously active.

A newly supported trend produces a positive match. A previously active trend that no longer satisfies the query can produce a cancellation.

This implementation performs partition re-evaluation. It is not a claim that every change is handled by a fully incremental, edge-local algorithm. Its matching path is Python-side; package attachment alone does not turn that work into native C execution.

Those boundaries make the provenance important, not embarrassing.

The lifecycle is what allows the system to respond when B's authorization record arrives.

First, we have to be precise about absence. “Not present in the observations we have” is different from “did not happen.” A source outage and an unapproved action must not become indistinguishable.

For this demonstration, the initial absence-dependent finding is provisional. We show that uncertainty rather than claiming a missing record proves malicious activity.

The authorization record is then validated for B's execution, permitted action, resources, and effective interval before it is allowed to explain B's activity.

The absence check must have the same scope. A broad approval anywhere under the service identity cannot invalidate every candidate path.

With the new evidence, B's specific absence-dependent finding is no longer supported. Its cancellation identifies the affected trend and a new state revision.

That does not erase the original observations. It does not erase why the initial finding existed. It does not automatically reverse a response action. And it does not declare the service identity universally safe.

C's finding can remain because the new record does not authorize C's execution or explain its destination.

For the demo, we must deliver the delayed events in arrival order. A replay helper that sorts everything into event-time order before evaluation would hide the very behavior we are trying to show.

**The most important result is not an alert disappearing. It is the right conclusion changing while the unrelated evidence remains intact.**

## 22:00–24:00 | Scores explain priority; they do not manufacture certainty

Now look at the score attached to a CET trend.

The package's deterministic scorer starts from a severity-based value, adds a bounded contribution for path length, considers asset criticality and a configured boost, and includes an overflow adjustment when supplied.

Its explanation exposes those contributions. The scorer is implemented in Python; “the CET scorer” is more precise than implying the arithmetic must execute inside the C matcher.

In the demonstration, we use the score the actual run returns. We do not force the output to match a number from a slide.

And we do not turn eighty-something points into eighty-something percent probability of compromise.

Risk, confidence, and uncertainty should answer different questions: how harmful could this be, how strongly is the conclusion supported, and what remains unresolved?

This connects to the broader 0xDSI design. Fuse aligns evidence. Confluence is the decision layer intended to assess what the combined evidence supports, including disagreement and missing context.

My design requirement is that three detectors using the same access record should not become three independent witnesses. Nor should an absence of known threat-intelligence matches be treated as proof that an execution is legitimate.

For B, new authorization evidence changes a specific condition. For C, it does not.

An investigation agent should receive those distinctions, the evidence references, and the remaining questions—not just a score and an invitation to invent an explanation.

The operational consequence is substantial in this scenario. Disabling the shared identity could interrupt the legitimate deployment and reconciliation along with the suspicious activity. A well-supported execution-level investigation gives us a basis for considering a narrower response, subject to policy and approval. Correcting B is not just reducing noise; it helps avoid treating legitimate work as part of C's incident.

**The explanation must follow the evidence. It must not be a story written afterward to defend the score.**

## 24:00–27:00 | Demonstration: change the engine, then change the evidence

[Live-demo passage. Use these result statements only after successful rehearsal. Otherwise use the companion offline replacement. Allow roughly one minute for clicks and inspection within this section.]

Let us make the architecture visible.

[Show the built-in run for the synthetic incident.]

This is the built-in execution. We can identify the input snapshot and inspect its trend output for this incident.

Now we will rerun that same retained input through the attached CET path.

[Run the validated adapter. Show the actual backend and a successful result.]

Look at the execution provenance, not just the package-status badge. This record tells us which engine and backend actually produced the result.

Now inspect the evidence path and score explanation. This output came from the execution, not from a diagram.

This is a controlled rerun. I am not claiming that changing engines automatically migrates all active state, or that two engines have identical semantics for every query.

[Switch to the validated standing-runtime demonstration. Show B's provisional absence-dependent finding and C's separate finding, then inject B's delayed authorization through the arrival-order event path.]

Here is the late authorization. It belongs to execution B.

[Show B's cancellation, its prior finding, and C's continuing finding.]

B's absence-dependent finding has been withdrawn. Its history remains visible.

C's suspicious export remains. Authorization for B does not authorize C.

**We changed a conclusion without deleting its history. And we corrected a false lead without losing the threat that still requires investigation.**

[Pause on the two outcomes.]

That is Detection-as-Data made visible.

## 27:00–29:00 | Replay, resilience, and the questions worth measuring

After the demonstration, the next question is whether we can reproduce and evaluate this behavior.

Two replay questions matter.

What did the system conclude using the evidence available at that moment?

And what would a new query version conclude using the evidence we have now?

Those are different experiments. Arrival history, event history, detector version, policy context, and entity mappings can affect the answer.

Delta's historical versions can support reconstruction while the necessary log and data files remain retained. They do not magically preserve expired data, external context, or every in-memory state transition.

So the replay package has to identify the inputs and versions it needs.

Resilience needs the same precision. Automatic fallback can preserve an execution route, but it must record the actual engine and any changed coverage. An explicit native request that fails should remain a failed native request.

And scale should be measured, not implied by the presence of C, threads, or a graph.

A useful benchmark reports input volume, partition sizes, query complexity, runtime, state usage, and whether any limit affected completeness. The native matcher, the standing evaluator, and the platform adapter are separate places to measure.

For this team, I would make the acceptance test concrete: preserve the suspicious path, retract only the invalidated finding, retain the explanation, and obtain consistent results under the declared replay semantics.

Then add realistic concurrency, delayed records, corrections, and failures.

**The impressive system is not the one that produces the most confident demo. It is the one whose confidence survives inspection.**

## 29:00–30:00 | The evidence model outlives the engine

Let me close with the distinction I want you to remember.

Data as detection means context and relationships help determine what an observation means.

Detection-as-Data means the logic, evidence, conclusions, and corrections remain inspectable assets.

CEP recognizes defined patterns. CET adds temporal paths and a lifecycle for supported trends. The broader decision layer determines what the combined evidence justifies and what still needs investigation.

In Operation Borrowed Trust, the goal was never to make everything red.

It was to distinguish three executions sharing an identity, incorporate delayed evidence, withdraw an unsupported finding, and preserve the suspicious branch.

**We can change the engine without abandoning the evidence model. We can change a conclusion without erasing its history. And we can correct a false lead without losing the real threat.**

That is the standard I want us to build toward together: decisions we can explain, challenge, correct, and safely act on.

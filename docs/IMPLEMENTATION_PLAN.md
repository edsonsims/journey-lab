# Journey Lab implementation plan

Version: 1.2 · 1 November 2026

Product exploration update: section 14 preserves the user's shortlisted demo cases and proposed PR-driven workflows. Section 15 records the later explicit instruction to build Gather's local change-impact demo. Other ideas remain saved concepts; live PR-provider automation and external posting remain separate integrations.

Status: Product decisions recorded from all 20 user answers. The first local milestone is implemented and verified; see [MILESTONE_1_STATUS.md](MILESTONE_1_STATUS.md) for current code, real model runs, verification and remaining setup gates. The real LittleSteps candidate awaits user review. Source/PR and analytics services are not selected yet; their connection is a later setup dependency, not an unanswered product decision. Actual draft-PR delivery remains pending connection. The verified starting point below remains the historical pre-implementation audit.

### Confirmed scope

Local, single-user, multiple product projects; other web apps through a URL and source repository, with LittleSteps retained as the demo. Launch saved charters manually with one or more personas. Each selected persona produces a separate Run in the selected environment. Journey is a tab inside that Run.

First milestone: a complete **Runs → Finding → Fix → Retest** flow. Fix implementation and retesting proceed automatically, then show evidence for review; only after approval create a **draft PR**. Meta models only. Dedicated test accounts and test-data changes are allowed in approved environments. Retain all records and artifacts indefinitely; no deletion or automatic cleanup.

Charters and personas support manual editing and AI drafting with version history. Personas automatically publish sourced, confidence-rated memory. First-time personas remain the default. Calibration can automatically test candidate adjustments, but adoption requires approval. The interface is English, desktop-first, responsive for review, with four horizontal top-level sections, contextual page submenus, keyboard shortcuts, and a bold Apple-influenced style with personality and wit.

## 1. Product outcome

Journey Lab lets a team watch a synthetic person use its product, understand the moments that matter, and review an AI improvement against a fresh test of the same goal.

The main working sequence is:

**Run → recorded moment → finding → proposed fix → candidate → retest → evidence review → approval → draft PR.**

Coverage, Experience, and the Library make that sequence reusable across products and more reliable over time. Real analytics can test whether simulated behavior agrees with observed behavior; agreement does not itself establish that a simulated emotion is accurate.

### Experience principles

- Lead with the recorded experience. Evidence and technical detail support it without dominating the default view.
- Use English product copy, direct labels, and contextual help. Avoid tutorial paragraphs on normal working screens.
- Give the workspace character through typography, layout, motion, and deliberate color. Favor a strong video workspace and readable tables over repeated dashboard cards.
- Add restrained wit to empty states, success moments and secondary copy. Keep actions, failures, impact labels and technical facts precise; never make the user or persona the joke.
- Preserve historical observations, versions, media, comments, and failed attempts. An improved candidate never rewrites what happened before it existed.
- Make distinctions visible where they change a decision: observed behavior, persona reaction, inferred expectation, reviewer judgment, and verification result.
- Keep the entire requested scope in this plan. Phases express dependencies and delivery order, not silent exclusions.

## 2. Verified starting point

The source audit on 31 October inspected the existing local application and saved runs.

| Area | Present | Work required |
| --- | --- | --- |
| Browser journeys | Muse Wonder navigation, screenshots, real cursor/click/typing video, public persona comments, stop outcomes | Configurable targets and charters, multiple findings, screen identities, general execution policies |
| Replay | Original and condensed recordings, explicit edit segments, comment timestamps | Multitrack timeline, stable links, annotation editing, milestone comparisons |
| Runs | IDs, lifecycle state, persona snapshot, timestamps, source fingerprint, provider usage | Names, indexed history, impact counts, filters, multiple projects, durable execution jobs |
| Findings | One structured final conclusion per run | Multiple finding occurrences, impact/type, expectation provenance, triage, recurring issues |
| Fixes | Isolated baseline/candidate, Muse Code, diff, preview, independent functional checks | General proposal/acceptance contract, repository adapters, revision rounds, comments, approvals, PR integration |
| Comparisons | Fresh before/after journeys for both demo personas, version integrity checks | General persona selection, issue-level retest criteria, milestone alignment and review |
| Library and insights | Two hardcoded personas and saved journey context | Versioned editors, memory, screen inventory, aggregates, competitor claims, analytics calibration |

Current code anchors:

- `journey-ui/index.html`, `journey-ui/app.js`, `journey-ui/styles.css`: current workspace.
- `journey-engine/server.mjs`: HTTP endpoints, execution, recording, saved run contract.
- `journey-engine/experience-recorder.mjs` and `experience-recorder.md`: original/condensed media and timing contract.
- `journey-engine/personas.mjs`: current personas and scenarios.
- `journey-engine/comparisons-api.mjs`: before/after orchestration and integrity.
- `journey-engine/improvements-api.mjs`, `improvement/run.mjs`, `improvement/verify.mjs`: current candidate workflow.

The existing fix implementation is scenario-specific. It supplies predefined LittleSteps requirements; it is not yet a general engine that derives an arbitrary change from a finding. Generalizing that boundary is explicit work in phase P3.

The current integration invokes Muse Wonder for journeys and Muse Code for coding. Store the exact underlying provider/model/version separately from these product names; the inspected coding invocation uses `muse-spark-1.3` and journeys use `muse-wonder-1.0`. Reverify availability when implementation begins.

### Preserve the demo as a regression fixture

Existing comparison: `f49c9695-c040-4d57-8f10-a2802a0142f9`.

- Teacher before/after: printable preparation remains possible.
- Mother before: the printer/cutting requirement blocks her goal.
- Mother after: on-screen feedback and progress to step 2 are observed. This is not completion of the whole activity.
- The original discovery, candidate, retests, and film retain their separate provenance.
- No historical network bodies or numeric emotional scores exist to backfill as if they were captured.

Keep `sources/` read-only. Preserve the existing recordings and demo assets. At the source audit, the workspace was not a Git repository. Source repository and PR provider setup are required before a real draft PR can be created; neither is presumed from the demo.

## 3. Navigation and visual system

```text
Project selector
Journeys
  All journeys
  Findings
  Issues
  Fixes
Insights
  Coverage
  Experience
Library
  Charters
  Personas
  Competitors
  Memory
  Calibration
Environments
  All environments
  Connections
```

Project selection scopes every collection and library entry. Journeys, Insights, Library and Environments are the four horizontal header destinations. Only the active group’s submenu appears inside the page. Environments and Connections share the Environments group; environment configuration also remains reachable from Run creation. Existing project-scoped URLs, detail links and settings aliases remain valid. Environment management is part of the first milestone.

### Visual direction

Build a desktop working surface with a compact horizontal header, contextual page navigation, precise alignment, strong type hierarchy, quiet borders, and generous room for the video. Keep the main workspace light. Use a vivid iris primary and stronger filled critical/high/review indicators, with purposeful semantic colors for timeline tracks and outcomes. Pair every color with a label or icon. Prototype the run workspace, finding detail, and fix review before expanding the design to every collection.

Use dense, adjustable tables with useful row previews. Make the selected moment the visual focus. Open a contextual inspector beside the video when space allows; use a full-width detail pane on narrower screens. Reserve motion for state changes, seeking, and selection; honor reduced motion.

Expected shared components: application shell, project selector, filter bar, data table, status/impact indicator, video transport, timeline track, moment inspector, context drawer, comparison player, annotation layer, version selector, source reference, and empty/error state.

Desktop supports the complete editing workflow. Smaller screens support reviewing videos, findings, and fixes with stacked panels and a readable event list. This device scope and the English interface are confirmed in D15.

Personality should be visible in a recognizable type/color composition, the playback workspace and concise microcopy, not decorative clutter. Suitable secondary copy includes “No runs yet. Give your product a fresh pair of eyes.” or “Same goal. A different ending.” Use the second only when the results support it. Critical failures and approval controls stay literal. Include this tone in the P0 designs and check it in the final browser review.

### Routes and state

Use stable project-scoped detail routes for runs, environments, findings, issues, fixes, screens, and library records. Journey is a run tab, not a separate run container or top-level resource. Representative links are:

```text
/projects/:projectId/runs/:runId?tab=journey&event=:eventId&at=:originalMs&mode=condensed
/projects/:projectId/settings/environments/:environmentId
```

Filters, selected tabs, comparison persona and selected moments survive refresh and Back navigation. A Run's persona is fixed, not switchable. Store shareable selection in the URL; keep personal layout preferences separately. A URL must never contain credentials, raw payload contents, or customer identifiers.

## 4. Core entities and counting rules

**One Run = one saved charter version × one persona version × one environment version, executed once.** The UI calls this entity a Journey; its Emotional Arc tab shows the persona's experience during that execution. Selecting multiple personas launches separate Runs, optionally linked by a lightweight batch ID for progress and filtering. A batch never replaces Run identity. Re-running creates a new Run linked to its predecessor; internal retries of a single model/tool request remain events within that Run.

| Entity | Meaning and invariants |
| --- | --- |
| Project | Product, environments, allowed targets, repository connection, action and capture policies |
| ProductBuild | Immutable source/build identity, environment and deployment reference; unknown identity is explicitly marked |
| Environment / EnvironmentVersion | Named runnable environment with versioned URLs, permitted origins/actions, test-account references, data setup and source/preview configuration |
| DeploymentInstance | An actual baseline/candidate runtime derived from an environment version, with URL, verified build identity, readiness and data/session isolation |
| Run | One charter/persona/environment execution with independent browser state and pinned versions; each table row is one Run |
| LaunchBatch | Optional grouping of separate Runs created by one manual launch; no independent persona outcome |
| Retry lineage | `retryOfRunId` links a new Run to an interrupted/failed predecessor; never rewrites history |
| Event / Artifact | Stable event IDs and immutable media/log artifacts with timestamps, hashes, capture policy and provenance |
| ScreenDefinition / ScreenVisit | Versioned route plus meaningful UI state/context, and actual observed visits |
| ExperienceSignal | Observation and public persona reaction at a recorded moment; may exist without a finding |
| FindingOccurrence | A particular finding in a Run; type, impact, expected behavior, confidence and supporting moments |
| Issue | A recurring product defect linked to one or more finding occurrences |
| Fix / FixRound | A proposed change and immutable implementation revisions, each with its own code, media, checks and review |
| Annotation / Thread | Feedback tied to an exact artifact, time/geometry and fix round |
| Comparison | Explicit baseline/candidate pairs, criteria, outcomes and alignment metadata |
| LibraryVersion | Immutable charter, persona, memory, competitor-claim or rubric version |
| AnalyticsSnapshot / CalibrationStudy | Reproducible real-data selection, mappings, comparable Runs, automatic candidate experiments and approved adjustment adoption |
| ProviderRequest | Exact model request identity, usage, timings, task and retry lineage |

### Classification

Timeline tracks are **Broken, Experience, Product, Business**. Findings have a primary type and may have secondary tags. A marker can reference the same finding from more than one track without multiplying the finding count.

Use a versioned impact rubric. Proposed levels are Critical, High, Medium, Low, Informational, plus Untriaged. Critical requires a supported consequence such as severe data loss or a core workflow being broadly unusable; a single disappointed persona is insufficient. Store the reason, affected context, confidence, and reviewer override independently. Experience valence is not severity. Business impact is a hypothesis unless measured or supported by a specific source.

Finding triage states are Unreviewed, Accepted, Dismissed and Duplicate. Default impact counts include distinct Unreviewed and Accepted occurrences in the selected scope, with unknown impact shown separately. Dismissed/exact-duplicate records remain available under an explicit excluded-count/filter. A duplicate in this sense is a redundant finding record, not another Run independently observing the same Issue. Review changes preserve the original classification and author/reason; saved reports pin the triage revision used for their counts.

Resolving an Issue or shipping a Fix never removes its historical finding occurrences from a Run. Issue “Seen” means distinct Runs where the issue was observed; a secondary occurrence count can show multiple observations within one Run. “Last seen” uses the observation time, not the edit time. Repeated screenshots are not additional occurrences.

Operational completion is distinct from the persona outcome. A completed run can report goal reached, obstacle observed, or inconclusive. A comparison can finish while showing a regression.

## 5. Screen specifications

### Project settings: Environments

Required list columns: Name, URL, Status, Last checked, Last run. Status distinguishes configured, unconfigured and last observed reachable/unreachable; it is not an unverified continuous-health claim. Actions: Create, Edit, Duplicate, Check connection and Archive. Archive hides an environment from new launches while preserving all versions, Runs and artifacts. No Delete action in this scope.

Environment detail contains:

- Identity: name, optional description, website/app start URLs and allowed browser/API/authentication origins. Support local, staging and other explicitly approved test environments.
- Authentication: dedicated test-account and role references, session/bootstrap method, and optional logged-out starting state. Store secrets in secure configuration, not editable plain-text notes or URLs.
- Test data: fixture/seed identity, permitted create/change actions, account/data isolation strategy and approved preparation commands. No destructive reset or cleanup is enabled by default under D20; use separate seeded namespaces/accounts instead.
- Repository and runtime: local source connection, base ref/build identity, working directory, build/start/health-check commands and isolated candidate preview settings. These are per product/environment configuration, not code hardcoded for LittleSteps.
- Capture: inherited video/screens/console/network-metadata policy, explicit request/response-body opt-in, redaction rules and retention set to Keep all.
- Limits: action/time/token bounds and concurrency for runs or experiments. Limits stop new work rather than deleting evidence.

Saving creates an immutable EnvironmentVersion. Each Run pins that version, the observed product build/deployment, fixture version, session profile, charter/persona versions, allowed memory snapshot and model/tool configuration. Changing a URL, fixture or credential reference does not alter a completed or active Run. Record which secure reference was used, never the secret value. Check connection reports reachability, authentication readiness, source/build match, fixture isolation and preview capability separately without launching a persona test. A supplied repository beside a hosted URL does not prove that URL serves that source revision; unknown or mismatched identity must remain explicit.

Environment approval defines the permitted test-data interactions; do not ask again for each already-authorized interaction. An authenticated test account does not make the persona knowledgeable about the product. For before/after runs, isolate both browser state and server-side test data: separate browser contexts alone cannot prevent shared-data contamination. Configured environments represent persistent targets such as Development, Staging and Production. Candidate builds and test previews are temporary execution instances linked to the configured environment and fix round; they do not create or count as environments. Close owned instances after testing, including failures and cancellation. Keep the pinned build, runtime URL, recordings and evidence as journey history. Explicit review previews can be stopped and expire automatically.

### Journeys (Run records)

Columns: Name, Status, Persona, Environment, Findings by impact, Duration, Tokens, Started. Filters: status/outcome, impact, persona, charter, target version, environment, launch batch and date; support search, sorting and pagination. Names are editable metadata, without altering execution content.

Show elapsed execution time in the table and original/replay length in detail. Do not mix model latency with observed interaction time. Missing usage is unavailable, not zero. A usage popover separates input/output, cached input and reasoning output components; components are not added again to the total.

Creation selects a saved charter version, one or more persona versions, one configured environment and execution limits. Show the resolved configuration and number of separate Runs before launch. Manual launch only; selecting three personas creates three Runs, each with an isolated session and test-data scope. The environment selector links to Manage environments. PR-triggered and scheduled launches are outside the agreed scope.

A charter can span the commercial website and authenticated application. Declare all allowed origins and starting-account conditions; preserve the same persona context across that transition. Record the promises encountered on the website so their relationship to the actual app experience is inspectable.

### Run detail and timeline

Layout: compact run header → persistent player → tracks → tabs and moment inspector. Player modes are **Condensed / Original**. Include play/pause, seek, speed, keyboard controls and next/previous event. Changing tabs does not reset the video.

The four tracks support filtering, zoom, scrubbing and selecting points or intervals. Every marker exposes a short title, category and time. Selection moves the playhead and opens its corresponding detail. The timeline also has a keyboard-accessible list view.

Tabs:

- **Findings:** all finding occurrences from this Run, filterable by impact and type.
- **Emotional Arc:** chronological intent → action → observed result → persona reaction. Mark positive turns, friction, low moments and stop reason. Show actual partial progress, with moment rows colored by their recorded tone.
- **Summary:** goal/outcome, decisive moments, limitations, significant findings and next actions. Every consequential claim links to supporting records.
- **Technical:** captured actions, console errors, requests/responses allowed by policy, model usage, target/build identity and capture metadata. Unsupported historical telemetry displays “Not captured.”

During execution, show current status, latest captured frame and accumulating public comments. Do not label a screenshot stream as completed playable video. Full live video streaming is not assumed in the first milestone; make it a separate extension if needed. Cancellation/failure keeps captured experience accessible.

### All findings and finding detail

Required columns: Impact, Finding, Type, Run. Add filters for triage state, persona, screen, issue and fix state without forcing more default columns.

Detail opens the original moment with a configurable lead-in and follow-through. Display:

1. What happened.
2. Expected behavior, with its source and whether it is inferred.
3. Persona POV, tied to the observed situation.
4. How the persona got there: actual actions and relevant screens.
5. Technical evidence and artifacts that were really captured.
6. Impact, confidence, triage state and linked issue.
7. **Fix** action, or existing fix/round and its exact status.

Expected behavior should prioritize approved requirements/charters and documented product promises. AI suggestions remain inferred expectations until reviewed. Mark agent failures and inconclusive findings separately from product defects. A negative reaction alone does not establish a broken requirement.

### Issues

Required columns: Status, Issue, Seen, Last seen. Detail groups occurrences, affected screens, personas and builds, and links fixes and retests. Support manual merge/split and suggested duplicate matches; preserve the original finding IDs and merge history.

Issue states: Open, Investigating, Fix in progress, Awaiting verification, Resolved, Reopened, Dismissed. Resolution must identify the tested version/environment and evidence. A PR being opened or merged is not by itself a fresh verification of deployed behavior. Historical occurrences remain visible after resolution.

### Fixes and review

Required columns: Status, Fix, Rounds, Open comments, From, Updated. “From” links to originating findings/issues. Open comments includes all unresolved threads, with superseded-round comments identified rather than hidden.

Each fix begins with a proposal: intended outcome, source findings, expected behavior, scope, acceptance criteria, affected personas and preserved behaviors. Distinguish defect correction from a product enhancement. After the user starts a Fix, implement it in isolation and retest automatically, then show the actual evidence for approval. There is no extra proposal-approval gate before coding; approval is required before creating the draft PR.

Fix detail includes round selector, change summary/diff, candidate preview, before/after recordings or screenshots, per-persona retest results, comments and review controls. Store implementation status, verification status, review status and delivery status separately; derive a concise list badge from them.

Implementation can be queued/generating/failed/ready. Verification can be pending/passed/failed/inconclusive/invalidated. Review can be awaiting review/changes requested/approved/rejected. Delivery can be local/PR open/merged/deployed, only when observed from the corresponding integration. Approval identifies the candidate hash and round. New code starts a new candidate requiring its own verification and approval; previous checks and approvals remain historical evidence for their original hash. Mark old evidence invalidated only when its integrity or applicability was actually found defective, not merely because a later round exists.

Screenshot pins use normalized coordinates and the immutable artifact ID. Video comments use canonical original time plus artifact ID. Both support threads and open/resolved states, and record author and inclusion in a revision request. These are the first-release annotation tools; freehand drawing, regions and multiplayer collaboration are not required.

**Request changes** freezes the selected comments, relevant frames/markup and text into the next Muse Code request, then creates a new round. Preserve every previous round and its annotations. Closing a comment is not proof that the defect is fixed. Pins on old screenshots are never silently projected onto changed screenshots.

After evidence review, approval of the exact candidate authorizes creation of a **draft PR**. Show the destination repository, base branch, title and change summary as part of that concrete review. Do not merge or deploy automatically. No PR provider is selected yet: until connected, retain the reviewed candidate and patch with status Approved · Connection required. Connecting a provider must not silently publish old approvals; present Create draft PR with the current candidate and destination. Draft-PR creation is idempotent and links back to the fix and round.

### Insights: Coverage

Use a versioned screen/flow inventory from declared routes, curated discovery, repository information and, later, analytics. Record its source and completeness. Route patterns plus meaningful states distinguish authenticated, empty, error, role and device variations.

Show Not explored, Visited, Interacted, Evaluated against a criterion, Outcome verified, and Unavailable/Inconclusive. Filters include version, flow, persona, device, environment and time. A saved report retains its denominator even if new screens are discovered later.

With an inventory, display counts such as “14 of 22 known in-scope screens visited.” Without one, show observed counts and inventory status. Do not turn discovered screens into a claim of complete app coverage. Selecting a gap can prefill a charter; it does not launch an unrequested run.

### Insights: Experience

Screen list: screen/state, exposures, personas, observed friction, positive signals, lowest moments and available scores. Detail shows actions, comments and evidence for that context, with timestamp links to a finding or the originating journey signal when no finding exists.

Keep observed retries/backtracking/blocked goals separate from simulated reaction and reviewer ratings. Start with positive/neutral/negative valence and an optional versioned 0–3 friction rubric: none, mild, disruptive, blocking. Unknown is distinct from zero. A reviewer score requires a short reason and preserves the AI score.

Every aggregate includes its denominator and applicable versions. Prefer “negative signals in 3 of 8 eligible Runs” over human-satisfaction claims. Do not pool different persona/rubric contexts invisibly. Exclude invalidated evidence from trusted aggregates by default, while keeping it inspectable.

### Library: Charters

Fields: name, mission, scope, compatible/default environment references, starting state, goals, allowed actions, expected-behavior sources, success/stop criteria, personas, screens/flows, memory policy, capture policy, execution limits and budget. Environment connectivity and credentials are managed on Environments; the charter may narrow its action scope but cannot silently broaden it.

Every explicit Save creates an immutable version, even if it only changes wording. Autosaved drafts are distinguished from saved versions. Runs pin the selected version. Support history, differences, duplicate and restore-as-new-version. Archive entries instead of deleting them. Manual editing and AI-assisted drafting are both in scope for charters and personas, with version history for both.

### Library: Personas

Fields: name, role/lens, decision, goal, context, device/resources, skills, initial knowledge, constraints, expectations, priorities, success/stop conditions and continuity policy. These must influence behavior, not just the persona biography.

Technical personas prioritize defect investigation; product/business personas evaluate capability gaps and decisions; client personas pursue their own goal. Role does not confer permission to take forbidden actions or access hidden product facts. Use version history and inspect which Runs used each version. Personas start as first-time visitors by default; returning-persona memory must be explicitly enabled with its allowed knowledge snapshot.

### Library: Competitors

Competitor profiles contain atomic claims with product/tier/region/version, claim text, claim kind, source URL/artifact/excerpt, retrieval/observation date, confidence, freshness, review state and contradictions. Distinguish vendor assertions, third-party reports and directly observed behavior.

Compare each claim with a sourced claim about the current product, showing comparable/partial/unknown states. “Not found during exploration” must not become “does not exist.” The user supplies the competitors; AI researches public sources and maintains claim-level evidence. Refresh creates a revision and preserves sources. Authenticated competitor navigation, automatic competitor discovery and recurring monitoring are outside the agreed scope.

### Library: Memory

Entries cover navigation, expected behavior, rules, terms and test data. Each has screen/flow/global scope, sources, confidence and its basis, product/environment applicability, optional review status, audience, freshness and supersession history. Credentials are secure references, never memory content. Personas publish qualifying entries automatically; human review is available for correction, not a prerequisite for publication.

Separate three audiences:

- Operational: environment setup, allowed actions and approved test data.
- Evaluator: requirements, expectations and business rules used to evaluate observations.
- Persona: only knowledge explicitly allowed by the charter and learned in that journey.

Retrieve screen-relevant entries from the pinned snapshot as screens are encountered. A first-time persona must not receive a known workaround, existing diagnosis or candidate solution just because the evaluator knows it. Before/after pairs use identical allowed starting knowledge. New learnings publish immediately to their allowed Library scope, but become available only to subsequent snapshots; they do not change an active Run or ongoing comparison.

Lifecycle: Automatically published → optionally verified/corrected → superseded or disputed, with stale applicability flagged separately. Validate schema, source references and redaction automatically before publishing. Missing sources/confidence produce a visible publication failure rather than fabricated authority. Distinguish an observed claim from an approved product rule; both can be published without automatically replacing the rule. Preserve contradictory entries, link them, and exclude unresolved contradictions from authoritative instructions while keeping them inspectable. No content is deleted on supersession.

Display exactly which entries each agent role could access in a Run. Automatic publishing does not automatically grant every audience access. Calibration trials also publish their records, but to an explicitly experimental scope excluded from default operational/persona retrieval until the corresponding adjustment is adopted. This prevents automatic memory from bypassing calibration approval.

### Library: Calibration

Use a separate `CalibrationStudy` domain; the existing replay timing “calibration” remains media metadata.

Workflow: connect/import read-only analytics → map events/screens/goals → choose compatible cohort, environment/build and time window → check comparability → compare frozen synthetic Runs → automatically propose and test candidate adjustments → validate against held-out data/scenarios → show the change and evidence → request approval → adopt the exact approved version.

Start with observable metrics: goal start/completion, abandonment step, path choice, retries, backtracking and error incidence. Exclude synthetic traffic from real-user analytics. Do not use LLM waiting time as a human hesitation metric. An analytics cohort such as “mobile” does not establish an uncollected constraint such as “has no printer.”

Each comparison shows metric definition, real numerator/denominator, synthetic numerator/denominator, time/version, matching quality, exclusions and uncertainty. Support Agreement, Disagreement, Insufficient data, Stale, Unmapped and Not comparable. A product build without real-user exposure cannot be calibrated against unrelated production behavior. This restriction concerns the product build, not a candidate persona adjustment: a proposed persona can be tested against compatible real observations of the same product.

Use repeated synthetic sessions and separate development from validation data. Candidate experiments run automatically within finite per-study iteration, session and token limits; keep their persona/charter/policy versions and memory scope experimental. Do not activate a candidate merely because it improves agreement on the development data. Approval applies to the exact adjustment version and validation result; another revision needs its own approval. Preserve the prior active version and benchmark.

For a calibration experiment, hold the target product build, compatible reference cohort, metric definitions and unrelated controls fixed. The declared variable is the persona, prompt or policy adjustment under test. Record that variable and validate the result on held-out data/scenarios. Do not apply the product-fix rule of keeping the persona unchanged to an experiment whose purpose is to test a persona adjustment.

No analytics service or real dataset is selected yet. Build the study, mappings and import contract locally, then connect a read-only provider or import real data when available. Select the first goal and cohort from that data. Compare behavior first; include feelings only when aligned survey/research data actually exists. An import is not a claimed live provider integration.

Analytics agreement is behavioral agreement. Validating feelings requires human feedback/research labels aligned with the event. Do not show a universal “realism percentage” or infer actual business uplift from synthetic retests.

## 6. Media and comparison contract

Canonical anchors use original recording milliseconds, stable event IDs, Run IDs and immutable artifact IDs. Preserve original media. Each condensed variant stores explicit source-to-replay segments and measured timing uncertainty. Normalize existing second-based segment fields at the import boundary without rounding away precision.

Switching Original/Condensed preserves the corresponding event. A timestamp removed during condensation offers **View in original** or a clearly marked nearest retained boundary. Missing timing metadata falls back to the original; never invent alignment. Markers, subtitles/comments, finding clips, annotations and insight links all use this contract.

Before/after comparison offers independent playback and milestone alignment. Milestones such as activity selection or starting the first step have separately verified timestamps on both sides. If one side never reaches a milestone, display that absence. Starting both files at zero is labeled linked playback, not equivalent-step alignment.

The Fix view now defaults to matched-step emotional arcs. Suggest equivalent observations from the completed incoming action, actual control, safe field/value, route and visit sequence; never use emotion or elapsed-time similarity to decide equivalence. High-confidence suggestions participate with an explicit Suggested label; scrolls, incomplete context and conflicting matches require review. Accept, reject, restore or manually adjust one-to-one forward pairs. Each review is scoped to the exact fix, round and two Runs, with append-only revisions and stale-write protection. Selecting a match cues the two original timestamps; linked playback then retains that selected offset, without time-warping the interval to claim continuous equivalence. Recording time retains all unmatched observations. A relative-time drag editor lets the reviewer move either endpoint to another recorded observation, preview the offset in both videos and save the resulting manual pair. Pointer/keyboard cancellation restores the preview; the saved review retains its version history.

For a product-fix before/after pair, pin the same persona, charter, allowed memory, model/prompt/tool versions, viewport, action budget and equivalent starting test data. Pin each side's environment/deployment version; the declared variable is the product-build change. Use independent browser sessions and isolated, equivalently seeded data; do not depend on destructive resets under the keep-all policy. Keep candidate implementation details and desired conclusions out of the exploring persona's context. Record any unavoidable difference as a comparison limitation. Calibration experiments instead follow their separate control contract above. One successful pair demonstrates that observed case; stronger reliability claims require repeated sessions under a declared experiment.

Keep commentary as brief, public persona annotations tied to what was visible. Do not present private model reasoning as a transcript. Voice narration and the existing editorial demo remain compatible, but automatic narration/editing is not added to this requested expansion unless separately prioritized.

## 7. Execution, architecture and persistence

### Proposed architecture

For the richer workspace, recommend a typed component frontend with routed views; React + TypeScript is the working proposal. Keep proven browser recording, model adapters and verification logic behind typed service boundaries instead of replacing them as part of a visual redesign. Confirm dependency versions and local constraints when implementation starts.

The agreed deployment is a local app for one user with multiple projects. Use SQLite for indexed metadata and immutable local files for artifacts. Bind the application to loopback and preserve origin/mutation protections. Keep project isolation explicit. Hosted deployment, team accounts and multiplayer permissions are outside this implementation scope.

Service boundaries: project/environment configuration; execution/jobs; artifacts/media; findings/issues; fixes/review; versioned library; insights; integration adapters; calibration. Use Meta only for navigation, structured assessment, drafting and coding, preserving the exact model/version for each role. No non-Meta model implementation, provider-selection UI or automatic fallback is in scope. Keep role boundaries testable without building a multiprovider product.

### API work

Introduce a versioned API with cursor pagination, filters, idempotent mutations and structured errors. Representative resource families:

```text
projects / environments / builds / screens
runs / events / artifacts
findings / issues / occurrences
fixes / rounds / annotations / review-decisions / comparisons
charters / personas / memory / competitors / claims / versions
insights/coverage / insights/experience
integrations / analytics-snapshots / event-mappings / calibration-studies
```

Mutations that begin work return a job ID. Use resumable event delivery, such as SSE with an event cursor, and a polling fallback. Media uses streamed byte ranges; the current whole-file buffering should be replaced before scaling history. Avoid returning all event/artifact content in list endpoints.

### Durable jobs and model work

Persist job state, leases, heartbeats, cancellation intent, Run retry lineage and partial artifacts. A restart records an interrupted Run; restarting exploration creates a new Run rather than rewriting the old one. Internal request retries remain attributable events. A multi-persona launch returns the separate Run IDs with optional batch metadata. Prevent duplicate launches and duplicate draft-PR creation with idempotency keys. Runs start manually; automatic fix retests and calibration experiments are child work of the explicitly initiated workflow, not PR/schedule triggers.

Set configurable per-run action, time, token and cost limits where prices are known; include concurrency limits and finite calibration trial bounds. The user supplied no deadline or numerical budget; absence of a limit is not a reason to launch unbounded experiments. Use visible, finite execution defaults and record the actual limits with every job. A budget interruption is not a product failure. Deduplicate provider usage by request identity, retain partial/unavailable usage, and avoid double-counting cached/reasoning components. Do not display dollar estimates without a versioned pricing source.

General fix generation requires a derived and inspectable acceptance contract, isolated repository checkout, allowed-file/tool policy, build/test commands, candidate preview and independent verification. Browser content and comments are untrusted input; they cannot grant additional tool or credential access.

### Technical capture and data handling

Default capture is videos, screenshots, action events, console errors and redacted network metadata. Request/response bodies require explicit opt-in for the environment. Apply redaction before persistence and before model context. Mask secrets/identifying fields before screenshots/video or disallow sensitive flows where reliable masking is unavailable; post-processing alone is not adequate capture protection.

For arbitrary apps, define target-origin allowlists, redirect policy, dedicated test sessions, account roles, safe test data and permitted mutations. Dedicated test accounts may create/change test data in approved environments, as requested. Do not simply remove the prototype's localhost restrictions. Repository and analytics credentials are separate from the browsing persona and remain secure references. Private-network targets must be explicitly configured rather than reachable accidentally through an unrestricted URL field.

Retain all Runs, recordings, screenshots, permitted payloads, annotations, versions, exports and candidate workspaces indefinitely. No TTL, garbage collection, purge or deletion workflow is in scope. Archive is a visibility change only. Show disk use and stop new captures cleanly when capacity is insufficient; never free space by deleting existing evidence. Stopping a runtime process must not remove its retained workspace or data. The same policy excludes automatic destructive cleanup of test fixtures unless the user later explicitly changes that policy. Test data is the normal target; do not assume approval to test real customer data.

## 8. Migration and compatibility

1. Inventory and hash existing JSON, media, candidate workspaces and demo manifests; record an import manifest and recovery procedure.
2. Create the new schema and a local demo project without altering the source records.
3. Idempotently import existing IDs and relationships. Each existing browser run maps to exactly one Run, with its recorded experience in the Journey tab. Existing comparisons reference those Run IDs. Import a legacy environment snapshot only from recorded facts; unknown connectivity/build details remain unknown.
4. Import the single old conclusion as one legacy conclusion, not several invented defects. Keep unknown severity/type/sentiment/telemetry unknown. Later analysis creates a new, labeled analysis revision with its own provenance.
5. Preserve persona snapshots and known model/build/timing metadata. Missing charter/memory versions become explicitly legacy context, not fabricated historical versions.
6. Reconcile counts, token totals, original/replay mappings and media hashes against the manifest. Reimport produces no duplicates.
7. Keep legacy URLs or redirects and `/demo.html` usable while switching the workspace. Test existing source links and the film chapters.
8. Retain the original UI/data path until the new working sequence passes acceptance; do not remove it just because the navigation renders.

## 9. Delivery phases and exit criteria

All 20 scope questions are answered. No deadline or numerical budget was supplied, so do not invent a schedule or cost commitment. The agreed first milestone is the complete local run-to-reviewed-fix sequence; actual draft-PR delivery additionally needs a connected provider/repository. Keep that external acceptance gate explicit rather than calling an unconnected PR flow complete. Deliver remaining sections in dependency order.

### P0 — Decisions and design contracts

Implementation record: the application shell, Run detail, Finding detail, Fix review and Environment forms are implemented in `journey-workspace/`. The shared contracts below remain the reference; current acceptance is recorded in `MILESTONE_1_STATUS.md`.

Deliver: the confirmed decision register; feature priorities; three representative screen designs plus environment setup; entity/time/status/counting contracts; impact/experience rubric; migration manifest; connection/setup contracts. These decisions and contracts now underpin the implemented first-milestone views.

Exit: every requested feature maps to a phase, actual external setup dependencies are identified, and the environment/run/finding/fix designs support the same end-to-end scenario. Verify the visual direction against the user's bold, concise, Apple-influenced brief with personality and wit.

### P1 — Foundation and executable configuration

Implementation record: SQLite workspace, versioned configuration, legacy import, serialized execution, environment readiness and archive/restore, retry lineage, metadata capture and usage accounting are implemented. Historical and generated comparison environments are retained but archived from the normal launch picker.

Deliver: local application shell/routes, multiple-project scope, SQLite persistence/migrations, artifact streaming, durable jobs, Environments management and versions, source/runtime readiness, minimal saved charter/persona editing and selection, screen IDs, capture/action policies, exact usage accounting and legacy import. Include multi-persona launch returning separate Runs.

Exit: existing real Runs open in the new workspace; imports reconcile without modifying originals; a version-pinned Run can be launched/cancelled; three selected personas create three distinct Run rows; changing an environment does not alter active/past Runs; interrupted jobs preserve history; project/secret/target/data-isolation checks pass. No fabricated placeholder results are shown as live data.

### P2 — Runs, recordings and findings

Implementation record: the four-track player, Run tabs, canonical-time links, multiple structured findings and review controls are implemented. Real completed, obstacle and incomplete Runs are available in the new UI; see the acceptance record for exact IDs and browser checks.

Deliver: Runs table and filters, original/condensed player, four tracks, all four tabs, structured experience signals, multiple findings, finding detail, timestamp links, selected technical capture and keyboard controls.

Exit: a real run produces independently inspectable findings and persona moments; counts reconcile; all routes seek the correct recording; changing modes/tabs preserves context; unavailable telemetry is explicit. Validate both a completed journey and an interrupted/inconclusive one.

### P3 — Issues and the improvement loop

Implementation record: local generation, retest, annotation/revision and exact-candidate review are implemented. Both LittleSteps personas and a separate generic target have completed real model comparisons; a real annotated revision was verified on the generic fixture. Actual draft-PR delivery remains **awaiting provider connection**. The LittleSteps candidate is awaiting the user's approval.

Deliver: recurring issues, deduplication review, general fix proposal/acceptance contract, isolated Muse Code worker, fix rounds, screenshot pins/timestamped threads, revision requests, independent checks, per-persona retests, milestone comparison, evidence review, approval and the draft-PR delivery contract. Connect a provider when selected; none is assumed today.

Exit for the first local milestone: reproduce a finding → automatically generate/retest a candidate → inspect evidence → annotate/request a change → receive/retest a new round → approve the exact candidate. Validate a generic web target through its environment/source configuration, not just the hardcoded LittleSteps path. Stale approvals and invalidated candidates cannot advance. Failure/rejection remains inspectable. A configured provider must create a real draft PR only after approval; until that is observed, report PR delivery as awaiting connection rather than complete.

### P4 — Library authoring and shared knowledge

Deliver: full charter/persona editors and history, Meta-assisted drafts, automatic memory publication with sources/confidence, optional review/correction and contradiction handling, audience-scoped retrieval, version inspection and non-destructive archive behavior. P1 already provides minimum saved configuration; this phase completes the user-facing management experience.

Exit: changes create new versions; old/active Runs remain unchanged; sourced persona memory publishes without a human gate; first-time and returning personas receive only their allowed knowledge; contradictions are inspectable and project/experimental knowledge does not leak.

Implementation record (1 November 2026): authoring and sourced Memory are implemented. Full versioned editors, local drafts/conflicts, history/diff/restore/duplicate/archive and Meta proposal review are recorded in `docs/LIBRARY_AUTHORING_STATUS.md`. New Memory supports automatic validated publication, confidence, corrections, contradictions, exact snapshots, first-time/returning isolation and source-screen access logs. Flow-only retrieval requires a pinned curated screen-to-flow map, not merely a declared charter flow. Operational knowledge remains an inspectable setup checklist. New fix rounds consume eligible frozen evaluator references in their existing Muse Code acceptance-plan request, without exposing them to the explorer or adding a separate model pass. Fixture/API/browser acceptance and remaining fresh Meta acceptance are recorded in `docs/RELEASE_STATUS.md`.

### P5 — Cross-run experience and coverage

Deliver: curated inventory, coverage states/denominators, Experience screen list/detail, contextual aggregations, low moments, human scores/overrides, gaps-to-charter preparation.

Exit: a low moment opens its exact source in either video mode; scores and sample counts are explainable; unknown coverage remains unknown; saved reports retain their inventory and applicable versions.

Implementation record (1 November 2026): Coverage and Experience are implemented with scoped inventory/criteria, frozen reports, reviewer scores, source-video links and unsaved gap-to-charter preparation. Existing recorded journeys render in both views; a live source link was checked at original 20.244 seconds and its mapped condensed 12.987 seconds. State-specific, source-hash-bound reviewer assignments are implemented without rewriting original observations. See `docs/RELEASE_STATUS.md` for bounded acceptance evidence.

### P6 — Competitor intelligence

Deliver: user-supplied competitor profiles, Meta-assisted public-source research, claim/source versions, confidence/freshness/contradictions and own-product comparison.

Exit: every verified claim has evidence; incompatible tiers/versions are visible; refresh preserves history; absent evidence produces unknown, not a fabricated competitive conclusion.

Implementation record (1 November 2026): profile/source/claim versions, bounded Meta public research, exact excerpts, review, contradictions and contextual comparisons are implemented and fixture-tested. No competitor target has been supplied, so actual public research acceptance remains awaiting user targets. No synthetic source is seeded into the live product.

### P7 — Calibration with real data

Deliver: local read-only analytics import and connector contracts, event mappings, goal/cohort selection, immutable snapshots, comparable behavioral metrics, discrepancy reports, automatically generated/tested candidate adjustments, held-out validation and explicit adoption approval. Add the live connector when a provider is selected.

Exit: demonstrate at least one real connected/imported dataset with lineage, a comparable metric and an insufficient/non-comparable case. Candidate experiments run automatically within limits; active behavior remains unchanged until the exact adjustment is approved. A successful approval adopts a new version and preserves the benchmark. Without real data, calibration acceptance is awaiting setup; do not substitute a synthetic chart and call it complete.

Implementation record (1 November 2026): imports, structured event/screen mappings, frozen cohorts, uncertainty/exclusion reporting, finite automatic experiments, held-out validation and exact-result approval are implemented and tested with isolated fixtures. Experiments currently adjust persona-context fields and require stateless-demo isolation for mutating targets; arbitrary prompt/permission tuning and general backend fixture adapters are not implemented. Real-data acceptance remains **awaiting a compatible real import/provider**. Fixture results cannot be adopted as real validation.

### P8 — Release validation and polish

Deliver: operational limit/recovery checks, keep-all disk-capacity handling, accessibility/performance review, English copy/tone polish, install/start documentation and a local release procedure. Scheduled/PR-triggered Runs, hosted teams, non-Meta providers and advanced drawing/multiplayer tools are excluded from this agreed scope.

Exit: manual launch and child fix/calibration execution obey their distinct approval policies; no artifact is automatically deleted; large-history/media checks pass on recorded target hardware; the complete requested scope is implemented or an actual external dependency is reported explicitly. Re-run the LittleSteps comparison and demo review against actual current results, preserving prior recordings.

Implementation record (1 November 2026): capacity preflight, keep-all retention, interrupted-job handling, secure launcher with review fallback, metadata paging, lazy-loaded views and release/backup documentation are implemented. Core browser regressions, retained tests and the 1,000-journey metadata benchmark are recorded in `docs/RELEASE_STATUS.md` and `docs/RUNTIME_RELEASE_CHECKS.md`. Fresh LittleSteps and Fieldnote Meta sessions are prepared with a six-session cap but blocked by 1Password approval; no fresh inference success is claimed.

## 10. Requirement traceability

| ID | Requested capability | Delivery | Acceptance reference |
| --- | --- | --- | --- |
| R01 | Main navigation and clear UI | P0–P1 | All four groups and stable detail routes; no dead-end shell presented as complete |
| R02 | Run status/name/impact counts/length/tokens | P1–P2 | Values reconcile to Runs/findings/provider requests |
| R03 | Condensed/original video and four tracks | P2 | Canonical-time seeking and removed-interval fallback |
| R04 | Findings/Journey/Summary/Technical tabs | P2 | Shared player state, grounded content, uncaptured-data states |
| R05 | Findings list and detailed moment/expectation/POV/path/evidence | P2 | Every claim and link resolves to its source |
| R06 | Recurring Issues with Status/Seen/Last seen | P3 | Distinct occurrence/Run counts and correct observation dates |
| R07 | AI fixes with rounds, before/after, comments, annotations and approval | P3 | Feedback reaches the next model request; immutable rounds and approval |
| R08 | Linked fix/PR status and resolution | P3 | Candidate verification, approval, PR, merge and resolution remain distinct |
| R09 | Coverage | P5 | Versioned denominator and visited/interacted/verified distinction |
| R10 | Experience by screen, scoring and low moments | P2/P5 | Contextual signals, reviewer provenance and exact media links |
| R11 | Charters with a version on every save | P1/P4 | Old runs retain old versions |
| R12 | Personas with roles, knowledge, skills and goals | P1/P4 | Versioned context changes behavior and knowledge access |
| R13 | Competitor profiles and sourced/confident claims | P6 | Source lineage, contradictions and comparable product contexts |
| R14 | Screen-scoped Memory, learning and checking | P4 | Audience separation, pinned snapshots and review/contradiction flow |
| R15 | Calibration against real analytics | P7 | Comparable data, explicit discrepancies and validated adjustments |
| R16 | Multiple managed test environments per project | P1 | Create/edit/version/check/archive; Run pins its environment, build and test-data configuration |
| R17 | Personality and wit | P0/P8 | Distinctive working surface and concise secondary copy; factual controls remain precise |

## 11. Verification strategy

Use meaningful contract tests for time mapping, immutable revisions, state transitions, token accounting, issue counts, redaction, project/environment boundaries and job idempotency. Use integration tests for the API/importer/worker interfaces and a small set of real browser flows for the working sequence. Avoid tests that merely repeat rendering implementation.

Critical cases:

- Import the existing history twice; preserve original hashes, IDs and counts.
- Seek events at edit boundaries, inside removed intervals and where mapping is missing; verify against the frame/timing uncertainty actually recorded.
- Reconcile aggregate token usage including retries, cached input and reasoning output without double-counting or treating missing as zero.
- Capture two occurrences of one issue across Runs, merge/split, resolve for one build and observe recurrence on another.
- Cancel or restart during model navigation and media finalization; retain partial results without a false success label.
- Change a persona, charter or memory entry during an active run; its resolved context remains unchanged.
- Launch one charter with multiple personas in a chosen environment; verify one Run per persona and that Journey is an internal tab, not another selectable Run.
- Save a changed environment URL/account/fixture configuration; old Runs retain their resolved version. A source/build mismatch must not look verified.
- Mutate test data in one baseline/candidate session; verify the other side's initial data is unchanged. Missing isolation prevents an equivalence claim.
- Automatically publish sourced memory without requiring review; ensure the next eligible snapshot can use it but the active Run cannot change and the first-time persona receives no forbidden prior knowledge.
- Give a novice persona no hidden diagnosis/workaround while the evaluator can read expected behavior.
- Request a second fix round with a screenshot pin and video comment; verify the model request contains the correct artifact/round/time and review text.
- Modify candidate code after verification/approval; require fresh verification and review of the new hash.
- Align before/after at an actual shared milestone, and display a missing milestone honestly.
- Test technical capture with seeded secret/PII canaries; prohibited data must not reach stored artifacts or model input.
- Compare analytics with incompatible cohort/build/event mapping; show the problem instead of a confidence score.
- Automatically execute a bounded calibration candidate, including its experimental memory; active persona behavior remains unchanged until adoption approval.
- Request draft-PR creation before approval, with a stale hash, or without a connection; verify no PR is created. After valid approval and connection, repeated submission creates exactly one draft PR.
- Simulate low disk capacity and archiving; pause new work and preserve all historical records/media/workspaces. Do not purge data or fixtures.
- Navigate Runs → Finding → Fix → Comparison and Experience → Moment using keyboard, refresh and Back; preserve useful context and focus.
- Validate playback, contrast, color-independent labels, reduced motion, overflow and narrow-screen review in the actual browser.

Use saved recordings for deterministic media tests and fresh model runs for final behavior acceptance. Choose run counts and budgets before repeated paid experiments. Report stochastic outcomes and exact partial completion rather than forcing a success narrative.

## 12. Decision register

All 20 questions were answered by the user on 31 October 2026. This register supersedes the draft recommendations. “None yet” for integrations is a valid decision: provider setup remains a dependency at the point of use, not a reason to reopen the product questionnaire. The answers authorize the planned product behavior; creating a particular PR still follows the in-product evidence/approval flow.

| ID | Topic | Confirmed user decision | Implementation consequence |
| --- | --- | --- | --- |
| D01 | First milestone | Complete Runs → Finding → Fix → Retest, then remaining sections | P1–P3 form the first complete local flow |
| D02 | Deployment and users | Local app, one user, multiple product projects | SQLite/local artifacts, loopback access, project isolation; no hosted-team scope |
| D03 | Supported products | Other web apps through URL and source repository; LittleSteps is the demo | Configurable environments/repositories and generic fix contracts |
| D04 | Run triggers | Manual saved charter, one or several personas | One atomic Run per selected persona; no PR/scheduled trigger |
| D05 | Fix authority | Implement, retest and show evidence automatically; after approval create draft PR | Approval binds candidate hash/round and draft destination; no automatic merge/deploy |
| D06 | Authenticated actions | Dedicated test accounts, create/change test data in approved environments | Versioned environment action policy and isolated test data |
| D07 | Impact and experience | AI proposes severity and separate experience signals, with evidence and human override | Versioned rubrics, provenance and preserved overrides |
| D08 | Default capture | Videos, screenshots, console errors, network metadata; bodies opt-in | Redacted default capture, explicit environment body-capture setting |
| D09 | External services | None selected yet | Keep connectors unconnected; configure real repository/provider and analytics at point of use |
| D10 | Persona/charter authoring | Manual plus AI-assisted drafting, version history for both | Saved immutable versions and editable drafts |
| D11 | Memory publishing | Personas publish automatically with sources and confidence | No review-before-publication gate; preserve audience/snapshot/experimental isolation |
| D12 | Competitors | User supplies competitors; AI researches public sources and maintains claim evidence | Public research and versioned sourced claims |
| D13 | Fix feedback | Screenshot pins and timestamped video comments, threaded and resolvable | Complete annotation-to-revision loop; no freehand/multiplayer requirement |
| D14 | Models | Meta only | Muse Wonder/Muse Code and Meta-supported role implementations; no other provider fallback |
| D15 | Design and constraints | English desktop-first/responsive review/sidebar/keyboard direction accepted; personality and wit requested | Distinctive visual design and concise witty secondary copy; no deadline/numeric budget supplied |
| D16 | Run meaning and environments | One charter with one persona in one environment; Journey is a Run tab; add environment management | Atomic Run IDs, one Persona/Environment per row, versioned Environments page |
| D17 | Calibration evidence | Behavior first; feelings only when survey/research data exists | Behavioral agreement metrics; no inferred human sentiment from analytics |
| D18 | Persona continuity | First-time by default; explicitly enable returning memory | Knowledge separation and fixed allowed snapshots |
| D19 | Calibration authority | Automatically test candidate adjustments; approval before adoption | Experimental versions/jobs, held-out checks, exact-version adoption gate |
| D20 | Retention and data | Test data in general; do not delete anything | Indefinite retention, no purge/TTL/cleanup, non-destructive archive and capacity handling |

### Setup dependencies to resolve when needed

These are not additional clarification questions or reasons to stop design/foundation work:

1. For an external product: an actual URL/source checkout, build/start/test configuration, dedicated test account and a non-destructive test-data isolation method. LittleSteps can validate the local foundation meanwhile; external-app acceptance needs a generic configured target.
2. For draft-PR delivery: a selected source/PR provider, destination repository/base branch and secure connection. Keep local fix/retest/review working before this exists.
3. For calibration: a real analytics provider or import with event definitions, a meaningful goal/cohort and data lineage. Study machinery can be built first; real-data acceptance cannot be fabricated.
4. For execution: accessible Meta models/credentials and finite run/experiment limits. Reuse authorized secure configuration where available; never place secrets in this plan or artifacts.

## 13. Instructions for later implementation

Read this plan, current project instructions and the latest user answers before starting. Recheck the live code and dependency state; this document is a dated plan, not proof of implementation.

Use the confirmed decision register; do not re-ask the settled scope questions. Start with P0's remaining designs/contracts, then P1's local project/environment foundation. Turn each phase into bounded implementation tasks with its exit criteria. Delegate independent frontend/backend work only after agreeing on shared contracts. Preserve user edits, synced sources, artifacts and working demo behavior.

Mark a phase complete only after its acceptance behavior has been observed. Record implementation references and test results under that phase. If a requested feature is deferred, record the explicit decision and its replacement milestone instead of quietly omitting it. Do not publish a repository, create external issues, merge or deploy merely because a later phase mentions those capabilities. Preserve a visible Pending connection/data acceptance state for unconfigured external services.

### Revision history

- 0.1: scoped draft, source audit and 20 clarification questions.
- 1.0: recorded all answers; made Runs atomic; added Environments; fixed local/Meta-only/manual scope; enabled automatic sourced memory and calibration candidate experiments; specified evidence approval before draft PR/adoption; retained everything; added personality and wit. Product implementation remains outstanding.
- 1.1: saved Relay CRM and Gather as user-shortlisted future demos; recorded the user's pre-merge and post-merge persona-impact ideas and separately labeled additional assistant proposals. No execution or integration was started by this revision.

## 14. Saved product concepts — 1 November 2026

### Provenance and status

Edson said: “I loved the 1 and 3... Save them for now...” and proposed an automated process on PR merge to test the impact of a change on different personas, or running a PR against personas to discover possible flaws in a design. He asked to keep these ideas and explore more options.

The two shortlisted cases are **Relay CRM** and **Gather**. Neither has been selected for immediate implementation. Handoff remains an earlier alternative, not part of this shortlist. LittleSteps, its recordings, and all existing results remain preserved. All example numbers and reactions below are fictional fixture/design proposals, not measured results. Reactions should arise from observable journey events rather than a required emotional script.

### User-shortlisted demo A: Relay CRM

**Promise:** “Bring your customer list. Start working in minutes.”

**Personas:** An operations manager migrating an inconsistently formatted spreadsheet, and an experienced sales administrator importing a clean export. Their goal is usable, trustworthy customer data.

**Discovery to explore:** An import displays Success for 12 source contacts, but only nine appear; three rows were silently skipped. Searching for missing contacts and retrying can expose omissions and duplicate creation. Success means reconciling every source row, not merely observing a toast.

**Candidate repair:** Mapping preview; explicit row-level results and understandable validation; user confirmation of ambiguous values; correction and retry for rejected rows without duplicating successful records. Do not silently change source data to manufacture a pass.

**Acceptance story:** Before/after recordings aligned at checking imported customers. All 12 rows must be accounted for; after correcting the three rejected rows, there should be 12 unique contacts. Verify actual record contents as well as counts. Preserve the clean-file expert's quick path.

**Possible experience signals:** Anticipation, initial relief at Success, confusion at the count mismatch, loss of confidence after duplicate creation, and restored confidence only when reconciliation supports it. These are hypotheses, not mandatory model output or human sentiment measurements.

**Value:** Connect false success, data integrity, recovery, user effort, and a reviewable repair. This was the assistant's preferred first demo, not a user choice of implementation order.

### User-shortlisted demo B: Gather

**Promise:** “Find the right room for your team and budget.”

**Personas:** An office coordinator booking for 12 people with a strict $250 all-in budget, and an executive assistant who prioritizes speed and required equipment.

**Discovery to explore:** A room appears to cost $220. Required equipment adds $35 and a service charge adds $25 late in checkout, producing $280. Going back to choose another room erases booking details. The coordinator completes UI steps but cannot complete the intended job.

**Candidate repair:** Show totals including selected requirements before commitment, preserve booking details, and offer alternatives satisfying capacity, equipment, availability, and budget. Keep underlying prices and eligibility unchanged. A proposed alternative costs $245 all-in.

**Acceptance story:** Align choosing a room and confirming a booking. Verify the actual reservation satisfies all constraints and requires no repeated entry. Preserve the assistant's short booking path. Do not call fewer clicks an improvement if the persona's objective fails.

**Possible experience signals:** Optimism, commitment, disappointment at the late total, frustration at lost work, and regained control after a valid alternative is found. Ground every interpretation in the recorded event.

**Value:** Expose problems spanning functioning screens, the cost of hidden constraints, and recovery quality.

### User proposal: persona impact review before merge

Run selected charters/personas against isolated baseline and candidate deployments for a PR. Attach the exact base/head source and deployment identities. Compare the same goals, fixture states, persona versions, allowed memory, and environment conditions; keep first-time sessions independent.

The proposed review presents a per-persona matrix: goal outcome, data correctness, meaningful effort/recovery, observed problem, simulated experience signal, confidence/limitations, and matched before/after clips. Highlight helped, harmed, unchanged, and inconclusive outcomes separately. A favorable average must not hide a failed persona.

Select relevant journeys using changed areas and the screen/flow map, while retaining important adjacent regression journeys. Report what was not exercised. Start with advisory results; an automatic release-blocking policy would require separately defined reproducible acceptance conditions. Mood alone is not a release gate, and agent/tool failure remains inconclusive.

If requested in a later implementation, Muse Code can propose a repair, create an isolated candidate, and repeat the comparisons under the existing approval-before-draft-PR policy. Automatic review does not grant automatic approval, merge, deployment, or posting permission.

### User proposal: impact review after merge

After the merged build is actually available in an approved test environment, verify its identity and compare against an identified prior build. A merge event alone is not evidence that the tested deployment changed.

Use the same per-persona report to identify an improvement that survived integration, a regression, or an inconclusive result. Preserve recordings and history. Any follow-on repair uses the existing review boundary.

**Future dependencies for both modes:** Selected repository/PR provider, an authenticated event/check integration, an available runner, approved baseline/candidate deployments, dedicated test accounts, isolated fixtures, exact build readiness, bounded per-change cost/action/time limits, event deduplication, and explicit handling of superseded commits. None is activated by saving this concept. The local manual-launch implementation remains the baseline until a later build request.

### Additional assistant proposals — unselected

| Mode | Question and concrete value | Boundary |
| --- | --- | --- |
| Design comparison | Run the same goals against functioning prototypes or variants; expose which users each design helps or harms before choosing a direction. In Gather, a Book now redesign may speed up the assistant but hide costs needed by the coordinator. | A static mockup supports visual/expectation critique, not functional completion or backend verification. |
| Promise-to-product audit | Follow a landing/pricing-page claim through onboarding to first value; connect Relay's import promise to whether every customer is actually usable. | Record the source claim and the observed journey; do not invent product promises. |
| Recovery drills | Introduce controlled invalid rows, an unavailable room, an interrupted save, or an expired test session; inspect recovery, lost work, duplicate creation, and confidence changes. | Faults must be repeatable and limited to approved test environments; report the injected condition. |
| Support story to reproducible journey | Turn a supplied support complaint into a draft charter, constraints and fixtures; reproduce it, repair it, and preserve the journey as regression coverage. | Separate customer-reported facts, unconfirmed assumptions and reproduced behavior; use approved test data. |
| Customer-fit rehearsal | Model a buyer, operator or internal reviewer with explicit adoption requirements; reveal a missing workflow even when the existing product functions. | A simulation does not certify compliance or prove willingness to purchase. |
| Analytics-guided investigation | Use observed abandonment/error segments to choose where to explore; produce testable explanations and candidate repairs linked to those segments. | Requires real analytics inputs; simulated explanations and reactions are not measured human causes or feelings. |

### Candidate next demonstration, still unselected

An apparently helpful change speeds up one persona but breaks another persona's goal. The review shows the split, Muse Code proposes a third version, and independent retests establish whether the affected goal is restored while preserving the other path. Match moments by meaningful actions, not equal clock time. Use task completion, record correctness, constraint satisfaction and recovery as acceptance evidence; attach public persona comments and emotional arcs to those events.

This frames Journey Lab as reviewing the effect of product decisions on different users. It remains a proposed demonstration; no new runs, changes, automation, external comments or PRs were launched for this brainstorming request.

## 15. Gather change-impact demo — implementation selected, 1 November 2026

**New explicit instruction:** “Let's build Gather around the PR impact demo: a change helps one persona but hurts another, Muse Code fixes it, and we retest both with synchronized videos and emotional arcs. Save the other ideas you have as use cases we can explore later...” This selects Gather and supersedes section 14's earlier unselected status for Gather only.

Build a polished, functioning local booking product and a project-scoped Change impact review inside Journey Lab. Keep the comparison truthful: current and proposed source builds, real independent journeys, actual Muse Code candidate, and real paired retests. The source/PR provider remains unconnected; label the proposed change as local instead of inventing an external PR or webhook execution.

### Product and controls

- Same rooms, capacities and prices in all variants: Atlas $220 room + $35 projector + $25 service = $280; Willow $235 room + included projector + $10 service = $245. Both hold 12 people. Final booking details persist only as isolated fictional session data; no real payments or external reservations.
- Coordinator: 12 people, projector, total budget $250; assistant: same meeting requirements, $350 ceiling and efficient booking. Both use first-time knowledge, a fixed charter and independent sessions; no known issue, solution or emotional script enters their persona context.
- Current flow makes all-in prices available before choosing and preserves entered details. The proposed quick flow reduces steps but prominently recommends the cheaper advertised Atlas room, reveals required charges late, and loses details on returning to room selection. Alternatives remain available: do not manufacture an impossible trap.
- Harm may be lost work, unexpected cost and extra recovery even if the coordinator ultimately succeeds. Report the actual result; do not force a blocked outcome or claim the assistant improved without observable evidence.

### Delivery sequence and acceptance

1. Build both source variants, transparent fixture contracts and actual browser tests.
2. Configure Gather project, two environments, two personas and one charter. Record source fingerprints and existing-history preservation receipts.
3. Run four Muse Wonder journeys: current/proposed for each persona. Pin versions, record outcomes, real mouse/typing videos, experience comments and usage.
4. Create a fix from an observed proposed-flow finding, include the other persona's compatible journey, and let Muse Code derive and implement a repair in an isolated candidate. Do not prewrite or attribute a human-authored repair to Muse Code.
5. Use the existing fix pipeline to independently retest proposed/repaired for both personas (four fresh journeys). Verify unchanged prices, actual booking constraints, preserved fast path, and recovery behavior.
6. Show Current → Proposed and Proposed → Repaired with per-persona results, synchronized original/condensed recordings, matched actions and emotional arcs. Keep unknown/inconclusive evidence visible. Approval remains a user action; no PR publication or merge.

Initial finite execution envelope: at most eight browser journeys, each capped at 16 actions, 350,000 model tokens and six minutes, plus one Muse Code generation using the existing 35-step/ten-minute process policy. Preserve interrupted attempts and stop to diagnose uncertain dispatch or missing usage instead of silently duplicating paid work. Model limits are admission estimates, not a provider-enforced currency ceiling. Any materially different experiment gets a separate explicit configuration and retained reason.

### Saved for later

- Relay CRM remains fully described in section 14: silent skipped imports, reconciliation, duplicate-safe recovery.
- Handoff: an agency project lead sharing a deliverable externally discovers that internal comments/costs are exposed; compare with an internal collaborator. Explore audience previews and actual authorization boundaries, verifying client access to deliverables while protecting internal material. A cosmetic preview alone is insufficient.
- The six additional modes in section 14 remain an exploration backlog: design comparison, promise-to-product audit, recovery drills, support story to reproducible journey, customer-fit rehearsal, and analytics-guided investigation.
- Actual pre-merge checks, post-deployment checks triggered by merge, provider connections and release-blocking policies remain future integrations beyond this local, inspectable demonstration.

### Gather delivery receipt

Implemented 1 November 2026: `gather/base` and `gather/proposal`; versioned local Change impact API and workspace; real Muse Code candidate; eight completed Muse Wonder journeys. The first comparison recorded Alex 8 → 6 actions and Maya 7 → 12, with both goals reached. The fresh repair comparison recorded Maya 12 → 6 and Alex 6 → 5; Alex's last repaired journey ended at confirmation while its counterpart also opened My reservations, so that one-action difference is not attributed to an additional product optimization. Actual browser checks verify that the four-interaction quick booking path is preserved.

Maya independently observed late $280 pricing and lost meeting details in both unrepaired recordings, then completed the repaired path directly at the unchanged $245 all-in price. Candidate acceptance passed 16/16 checks. The code was generated by Muse Code (`muse-spark-1.3`), with its exact candidate hash and process receipt retained. The candidate is awaiting user review, with null approval and no external PR.

- [Interactive change review](http://127.0.0.1:4319/projects/gather/impact/3c976cd2-5a9a-4c58-aef7-a40e4948f5e3)
- [Eight-journey report](../outputs/gather-pr-demo/report.json)
- [Muse Code receipt](../outputs/gather-pr-demo/muse-code-receipt.json)
- [Independent candidate checks](../gather/qa/results/muse-candidate-2026-11-01T23-11-43.791Z/receipt.json)

The view supports linked original recordings, independent condensed cuts, full emotional arcs and reviewed matched actions. Weak action suggestions require review; impact-page match changes are session-only, while the existing Fix view retains its persistent alignment workflow. Synthetic reactions and navigation counts remain distinct from human satisfaction and elapsed human effort.

## 16. Experience feedback explorer — current UI direction

The user selected a feedback-first entry: list every recorded feedback item, optionally group by page, and filter by persona, environment and type. This supersedes the earlier persona-comparison table as the default Experience landing view.

- The landing view shows meaningful, sourced experience feedback: what helped or hurt the persona and why. Routine click/type/navigation narration stays in journey details. The complete raw signals, media and independent records remain intact; filtering the feed never rewrites or deletes them. Findings are linked to their cited moments where available.
- Persona, Environment and Type are primary compact filters. Search, Reaction, Page, quick views and sorting refine the same collection. Counts describe the currently filtered feedback, not distinct people or measured human sentiment.
- Clicking a page opens its own feedback view. Gather's recorded screen states distinguish Room selection, Room details, Review booking, Confirmation and Meeting plans despite their shared route.
- Clicking a feedback item opens its exact reaction, screenshot, linked findings, original video timestamp and recorded emotional arc. Missing timing or media remains explicit; retrospective finding comments do not create a timed emotional signal.
- Journey replaces Environment as the primary provenance column. Its saved name links to the exact execution and original feedback timestamp. Environment remains a configured target, a filter and a secondary detail; it is not renamed to Journey. Historical unnamed journeys use a short run ID rather than a fabricated name.
- Future browser actions can record `experience_feedback: {kind, summary, why}` alongside their original observation and persona comment. Meaningful kinds are benefit, friction, uncertainty and unmet_need; ordinary narration is routine. The capture boundary validates this optional metadata.
- Experience headlines must name the observed behavior and its consequence for the recorded persona in the headline itself. Generic "matches my needs" is insufficient. Muse Wonder derives the presentation from the current observation/reaction, recorded persona/charter context and earlier action results. Rejected automation actions cannot establish a product defect; later completion cannot be projected onto an earlier screen.
- Existing recordings and new terminal journeys use the same bounded headline rewrite service. Derived revisions are retained separately with exact source citations, source fingerprints, model identity and usage receipts; original comments, findings, recordings, timing, valence and impact remain unchanged. Only revisions matching their current evidence are displayed. Routine classifications leave the Experience feed but remain in Journey details. Reopening the page is read-only and never starts a model request. Valid captured feedback and conservative source-extractive wording provide a fallback when no current derived revision exists.
- Editorial corrections append a separate source-bound revision, preserving the generated wording and citations. Unsupported feedback may be reclassified as routine without deleting the underlying experience. Live Experience views refresh when journeys complete and while headline processing is active; frozen reports retain their saved content.
- Before/after comparison is optional inside a page and stays scoped to that logical screen. Returning to feedback restores the prior filters and grouping. Feedback and page links survive reloads.
- Scope controls, inventory authoring and saved scope reports remain available under Advanced. Reports retain their existing server scope semantics; local feedback filters are navigational state.
- This revision uses existing recorded data. It does not launch new model journeys, alter source findings or recordings, approve a candidate, or publish a PR.

Validation artifacts are retained in `outputs/experience-feedback-qa/`: desktop list/page/detail and mobile list/detail screenshots plus a browser-check receipt. Focused tests cover feedback provenance, screen identity, comparison matching, emotional arcs, aggregation and filtering; the production build includes TypeScript validation.

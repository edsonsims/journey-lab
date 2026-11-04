# Journey Lab — local release status, 1 November 2026

The remaining workspaces are implemented: sourced Memory, Coverage/Experience, Competitors and Calibration. The existing Journey → Finding → Fix → Retest flow remains available. The application runs locally at http://127.0.0.1:4319 with the existing 1Password connection approved and **Meta enabled**. Authenticated Muse Wonder navigation is verified; the acceptance history below distinguishes incomplete attempts from completed validation.

This record separates local tests, authenticated synthetic navigation and real-world validation. Real analytics calibration, competitor research and PR delivery still need their specified external setup.

## Delivered behavior

| Area | Working behavior | Boundary |
| --- | --- | --- |
| Memory | Automatic sourced/confidence-rated publication, failed-publication receipts, immutable versions, corrections, review, contradictions, archive/restore, launch snapshots and per-screen access history | First-time personas receive no prior learning. Returning personas also need an enabled charter. Only their own eligible persona entries enter exploration. Historical journeys are not backfilled. |
| Insights | Versioned curated inventories, scoped coverage/experience, exact recording links, distinct synthetic/reviewer scores, saved reports and gaps prepared as unsaved charters | No whole-product percentage without a declared inventory. Unknown state/ratings remain unknown. Experimental and invalidated observations are excluded by default. |
| Competitors | Supplied profiles, bounded public-source capture/research, exact excerpts, confidence/freshness, versions, review, contradictions and compatible-context comparisons | No targets supplied yet. Research tests use clearly isolated fixtures and mocked model responses. |
| Calibration | Versioned read-only event import, mappings, frozen cohorts/builds, comparable behavioral rates, bounded candidate experiments, separate development/held-out trials and exact-result adoption review | No real dataset/provider selected. Experiments currently adjust persona-context fields. Mutating targets require the supported stateless-demo adapter. No automatic adoption. |
| Runtime | Capture capacity preflight, keep-all retention, interrupted-job recovery, secure-start fallback, paged metadata history and lazy-loaded views | Capacity is a preflight, not a reservation against other programs consuming disk space. A configured key is not proof of successful inference. |

Operational/evaluator memory is kept out of the exploring persona's prompt. New fix rounds use eligible evaluator references from the source journey's frozen snapshot in the existing Muse Code acceptance-plan request, retaining exact IDs, versions, source frames and confidence. Operational entries remain an inspectable setup checklist. There is no separate evaluator-model request. Source fingerprints describe the connected checkout and do not independently verify a remote deployment.

## Verification receipts

- Engine: **275/275 passed** after the budget and memory-receipt corrections, zero failures/skips. [Retained log](../outputs/release-qa/engine-budget-fix-reviewed.txt). The subsequent empty-textarea placeholder correction passed all five focused browser tests, including visibility, ambiguity and populated-value rejection.
- A second recorded navigation issue came from decorative `aria-hidden` checkmarks in save buttons. The resolver now excludes those descendants from visible control names, preserving exact meaningful text and ambiguity/privacy checks. All six focused browser checks passed after this final fix. No additional paid retest was run; earlier label rejections remain part of their original recordings.
- Frontend: **147/147 passed**, TypeScript and production build passed. [Latest tests](../outputs/release-qa/frontend-budget-fix.txt). The new Technical budget card was also inspected in the browser with an actual incomplete journey; it distinguishes reported usage from the reserved next request.
- Memory/Insights browser: **12/12**, including publication, isolation, conflicts, version history, unknown denominator, report snapshots, source links, review and mobile layout. [Results](../outputs/memory-insights-qa/2026-11-01T05-34-41.816Z/results.json).
- Competitors browser: **9/9**, isolated actual API/store with mocked research. [Results](../outputs/competitors-qa/2026-11-01T05-05-20.587Z/results.json).
- Calibration browser: **13/13** after correcting the outcome selector, screen matching and retry/backtracking rules. Covers import/mappings, trials, cancellation, limits, stale edits, exact approval and fixture-adoption rejection. [Results](../outputs/calibration-qa/2026-11-01T05-33-23.833Z/results.json).
- Screen-state review browser: **9/9**, including exact frame selection, source-hash validation, versioned correction to unknown, frozen reports and mobile layout. [Results](../outputs/release-qa/insights-state/2026-11-01T05-37-21.934Z/results.json).
- Existing workflow browser regressions: Library **14/14**, Findings **20/20**, matched playback **13/13**, smart filters **4/4**, demo **4/4**. [Audit](../outputs/core-regression-qa/report.md).
- Preservation: **34 original journey JSON hashes**, **528 artifacts** checked for presence/size/nanosecond modification time, and **five fixes** checked for unchanged status, approval, round hashes and manifests. No differences. This is not a fresh byte hash of all media. [Final receipt](../outputs/release-qa/final-receipt.json).
- History benchmark: retained 1,000-journey fixture; 100-row metadata page median 7.78 ms versus 75.10 ms for the prior full-record list, and 115,101 versus 1,483,801 response bytes. Three warm local samples on the documented machine; this is not an end-to-end browser performance claim. [Report](../outputs/release-qa/paging-2026-11-01-final/report.json).

All engine test suites now retain their filesystem fixture directories under `outputs/automated-test-fixtures`; legacy suites were migrated too, and the focused legacy retention run passed 37/37. Tests use isolated stores, not the active user's workspace. The current full suite passes ordinary iframe-focus/private-field/shadow-root privacy checks; it does not establish visual masking in every cross-origin iframe. A previous timeout remains in the historical Library authoring report.

## Real scenarios and remaining acceptance

The owned Fieldnote app's deterministic browser form flow passed. A **resumable six-session Meta acceptance** is prepared in `scripts/acceptance-journeys.mjs`: LittleSteps mother/teacher before-and-after (four sessions), then Fieldnote first-time/returning memory (two sessions). Every session is capped at 12 actions, 150,000 tokens and five minutes. It preserves intent and run IDs, refuses a missing key and never approves a candidate or publishes a PR.

After the user approved 1Password, that initial phase produced **five incomplete recordings**, using 385,137 reported tokens in total. Conservative full-history reservation stopped the next request at 70–82k actual tokens per journey; the returning-memory gate prevented the sixth session. [Original report](../outputs/live-scope-acceptance/partial-model-report.json).

The engine now anchors unchanged conversation prefixes to verified provider input usage and conservatively estimates only appended content. Changed request configuration, inconsistent usage or observed drift falls back to full estimation. Every invocation is charged, including repeated provider response IDs; no cached-token deduction. Memory access requires a recognizable completed/incomplete provider response with measured input usage. A separate validation then reached Fieldnote's saved-note screen at **140,210 tokens**, but the remaining 9,790 could not admit a final report. Its incomplete status and absence of Memory publication remain intact. [Report](../outputs/live-scope-acceptance/budget-fix/partial-model-report.json), [independent audit](../outputs/live-scope-acceptance/budget-fix/audit-memory.json).

An additional, explicitly configured validation uses the app's normal **250,000-token** allowance in new environment/charter versions, retaining 12 actions and five minutes. Its separate checkpoint is `outputs/live-scope-acceptance/completion-budget/`; two memory journeys gate the four paired sessions. The empty-textarea navigation issue observed in the earlier attempts was also fixed. This configuration does not rewrite or reinterpret any earlier outcome.

**Final authenticated acceptance passed: six finished sessions, all 16 receipt checks true, 853,908 reported tokens.** The first-time Fieldnote journey completed with no prior persona knowledge and automatically published three sourced learnings. The returning journey pinned exactly those three versions, received them after a confirmed provider response at the mapped screen, and saved the exact requested title/category/text. Each also published three observed claims; the returning run's new publications did not enter its active snapshot. [Model receipts](../outputs/live-scope-acceptance/completion-budget/real-model-report.json), [35-check Memory audit](../outputs/live-scope-acceptance/completion-budget/audit-memory.json).

| Persona | Before | After | Evidence boundary |
| --- | --- | --- | --- |
| Phone-only parent | Printer/materials obstacle observed | Began the no-printer first step by selecting Water, Space suit and Telescope | Save my first picks was not executed successfully before the navigation limit. No saved selection or physical activity completion is claimed. |
| Prepared teacher | Printable preparation plan saved | Printable preparation plan saved | The browser recorded plan preparation; no physical printing is claimed. |

All paired persona/charter/model/capture controls and source hashes match; the eight original/condensed recordings are readable. The existing candidate remains **awaiting review, unapproved**, with no PR. [Paired audit](../outputs/live-scope-acceptance/completion-budget/audit-pairs.json). Native UI checks confirmed source-link seeking at 28.002s original / 17.661s condensed and matched-step playback with the paired offset preserved within 6ms at the observed pause. [UI receipt](../outputs/live-scope-acceptance/completion-budget/ui-audit.json).

Across all three finite phases, twelve new sessions used **1,379,255 reported tokens**: six incomplete attempts retained plus the six final completed sessions. This is synthetic acceptance, not proof of human sentiment, causal UX uplift or general reliability across every website.

The remaining external acceptance gates are:

1. Supply a compatible real analytics import for Calibration acceptance. Fixture adoption checks are not real-user validation.
2. Supply competitor targets before actual public research.
3. Select the source/PR provider and destination repository, and approve the exact candidate before draft-PR delivery. No PR was created or candidate approved in this pass.

The earlier pre-unlock review check had 34 journeys, 38 findings, five fixes and 47 observed screen groups. New acceptance runs are additional records. The original 34 journey hashes, 528 artifact metadata records and five fixes' source hashes/manifests and null approvals were verified unchanged after the first two phases. [Preservation audit](../outputs/live-scope-acceptance/budget-fix/preservation-audit.json). No synthetic analytics datasets or competitor claims were seeded into the active Library.

The final preservation audit also passed after all six completion-phase sessions finished: all original records plus the six earlier incomplete journeys and twelve pinned files remain unchanged. [Final preservation audit](../outputs/live-scope-acceptance/completion-budget/preservation-audit.json).

Start, backup and recovery instructions: [release runbook](RELEASE_RUNBOOK.md). Continuing work and finite budgets: [checkpoint](OVERNIGHT_DELIVERY.md). Accepted requirements remain in [the implementation plan](IMPLEMENTATION_PLAN.md).

## Gather: local change-impact demo

The later Gather implementation adds an owned booking product with current/proposed builds and a project-scoped **Change impact** workspace. It shows Current → Proposed and Proposed → Repaired, per-persona goal outcomes and action differences, real original/condensed recordings, synchronized comments, full emotional arcs and reviewed action matches. Low-confidence matches require explicit review; impact-page decisions remain session-only. Exact source/environment identities and immutable review versions are retained. This is a local proposed change, not a connected external PR or running webhook.

Eight real Muse Wonder sessions finished successfully, using **1,224,043 reported journey tokens**. Muse Code separately generated a candidate using `muse-spark-1.3`; its process completed successfully and its source hash is retained. That coding request's usage is not included in the journey-token total.

| Perspective | Current → Proposed | Fresh proposed → Repaired | Observed result |
| --- | --- | --- | --- |
| Alex, executive assistant | 8 → 6 actions; both goals reached | 6 → 5 actions; both goals reached | The shorter booking path is preserved. The repaired run ended at confirmation; its counterpart also opened My reservations, so the extra one-action difference is not attributed to the code repair. |
| Maya, office coordinator | 7 → 12 actions; both goals reached | 12 → 6 actions; both goals reached | Late all-in pricing and lost meeting name appeared in both unrepaired sessions. The repair exposed the real $245 option up front and avoided repeated input. |

Maya's harm was extra work and negative recorded reactions, not a fabricated blocked goal. Atlas remains $280 and Willow $245 for 12 people with a projector. Independent actual-browser candidate checks passed **16/16**, including exact persisted reservation contents, reload persistence, isolated sessions, early totals, preserved meeting name and the same four-interaction quick path. All original 46 journey JSON records and five fix JSON records remained unchanged in the retained preservation receipt.

Validation for this addition: **288 engine tests**, **153 frontend tests**, **9 harness guard tests**, **6 Gather browser tests**, and **14 isolated change-impact browser checks** passed, plus actual-recording UI checks. The initial source variants serve build-identity responses matching their frozen fingerprints. Candidate source remained unchanged after verification. Reports distinguish deterministic checks, recorded synthetic behavior and unvalidated human impact.

The candidate remains **awaiting review**, unapproved, with no PR, merge or deployment. Relay CRM, Handoff and the six exploratory use modes are retained in plan sections 14–15.

- [Open Gather's impact review](http://127.0.0.1:4319/projects/gather/impact/3c976cd2-5a9a-4c58-aef7-a40e4948f5e3)
- [Run/recording/preservation report](../outputs/gather-pr-demo/report.json)
- [Muse Code identity and process receipt](../outputs/gather-pr-demo/muse-code-receipt.json)
- [Candidate browser checks](../gather/qa/results/muse-candidate-2026-11-01T23-11-43.791Z/receipt.json)
- [Live matching and video checks](../outputs/gather-impact-ui-qa/live-review-fixes.json)


## Gather: 90-second English judges film

The Gather case retains its narrated film inside [Guided example](http://127.0.0.1:4319/projects/gather/guide), available under Settings. The standalone Watch demo button and page were removed; the original LittleSteps demo remains available. Its 2 November positioning is **One product. Many journeys.**: begin with each persona’s goals, expectations, and constraints; follow the experience and recorded reactions; then use feedback to shape an improvement. It uses the retained real browser recordings, exact recorded persona comments, actual Muse Code patch excerpts, and source-backed action counts. It does not launch new model sessions or modify the generated candidate.

Six chapters: 0:00 One product, many journeys; 0:08 Meet Alex; 0:20 Follow Maya’s perspective; 0:38 Turn feedback into an improvement; 0:53 Explore how the journey changes; 1:16 Understand the journeys your product creates. The reveal at **0:58–1:06** holds both first Review booking frames at the recorded **22.597s / 20.156s** anchors: $280 and a negative reaction before, $245 and an excellent reaction after. The full recorded emotional arcs remain visible. Other chart positions are relative recording time, not asserted to be equivalent actions.

Exports: 1920×1080 H.264/AAC, exactly 90 seconds, English narrator, selectable English captions, and a separate MP4 with captions rendered in the reserved footer. Narration is local macOS speech synthesis, distinct from recorded persona comments. The guided example retains film playback and captions, with links to the comparison and candidate review. Candidate approval and PR connection remain unchanged.

Initial film verification: **126/126 film/source checks** and **20/20 native-browser player checks** passed. The 2 November positioning refresh passed **40/40 media/source checks**, **10/10 Gather control tests**, the production build, and **327 frontend tests**. Both exports remain exactly 90.000 seconds. All 158 original recording/record/media files matched their pre-edit hashes. Browser checks confirmed the new dashboard and film, caption playback, chapter navigation, and mobile layouts without horizontal overflow. Earlier final film assets are retained in the local archive. [Current film audit](../outputs/gather-film/verification.json), [initial player checks](../outputs/gather-film-player-qa/browser-checks.json).

- [Captioned export](../outputs/gather-film/film-captioned.mp4)
- [Clean export](../outputs/gather-film/film.mp4)
- [Narration script](../outputs/gather-film/script.txt)
- [Source manifest and edit decisions](../outputs/gather-film/source-manifest.json)
- [Presenter notes](../outputs/gather-film/presenter-notes.txt)
- Rebuild locally: `python3 scripts/gather-film.py`; reuse unchanged chapter renders with `--reuse-render-cache`.

## Sidebar, compact filters, and Experience review

The workspace now uses a left sidebar with Journeys, Insights, Library, and Environments. Only the active group's children expand; Insights is ordered Experience → Change impact → Coverage. Small screens use a keyboard-accessible navigation drawer. The Journeys attention panel is removed while row priority indicators and filters remain available.

Collection filters share a compact search/preset/facet/sort bar, with secondary controls in popovers, active-filter chips, result counts, and URL persistence. Environments now uses the same controls. Experience presents page names above recorded URLs and replaces the sentiment/friction columns with colored count pills. Legacy records without captured titles use readable route/project fallbacks. Scope controls are collapsed until needed.

Validation: production build, **37 focused navigation/filter/insights tests**, **54 native-browser filter/navigation checks** across 11 collection pages, and **8 Experience browser checks** passed. Desktop filter bars measure 40px; mobile bars 70–74px with no document overflow in the checked pages. Mobile drawer focus, Escape, and route-close behavior were also checked. Source recordings and model results were not changed.

- [Filter and navigation checks](../outputs/sidebar-filter-qa/browser-checks.json)
- [Experience checks](../outputs/compact-insights-qa/checks.json)
- [Final Experience screenshot](../outputs/sidebar-filter-qa/experience-final.png)

### Experience: one row per product page

Experience now groups the same recorded product route across environments into one expandable page row. Inside, comparisons retain separate persona, environment, build, device, state, and mission versions, ordered by persona and recorded chronology. Count pills use deduplicated source signals/findings/journeys. Each context offers highlighted video moments and an expandable list of original comments, frames, and timestamp links. Expansion survives browser back and reload; scope updates retain their open controls. Coverage and original source-screen detail routes remain unchanged.

Gather's six source rows now display as **one page, eight recorded contexts, eight journeys, 62 signals, and 14 findings**. The grouping follows recorded routes; discarded URL fragments are not reconstructed, and similarly named but distinct routes stay separate. No source records or media were rewritten.

Validation: production build and **37 focused tests** passed, including grouping/deduplication/unknown-provenance cases. **16 native-browser checks** covered filters, expansion, comments/frames, responsive table containment, Coverage preservation, and actual before/after video seeks at **22.597s / 23.921s**. [Browser receipt](../outputs/experience-grouping-qa/browser-checks.json), [expanded comparison](../outputs/experience-grouping-qa/experience-expanded.png).

# Library authoring increment

Implemented 1 November 2026 as the first P4 increment. This completes persona and charter authoring; automatic sourced memory publication/retrieval remains the next P4 increment.

## Working surface

- Library → Personas and Charters now have compact searchable collections, contextual facets, quick views, sorting, visible-result summaries and project-scoped detail URLs.
- Full-page editors expose structured context, knowledge, resources, constraints, goals, success/stop criteria, scope and expected-behavior sources. Personas retain explicit first-time/returning settings; returning knowledge must still be declared manually.
- Charters specify suggested personas, default/compatible environments, and narrower optional execution/capture settings. The launch dialog honors these selections without turning suggestions into requirements.
- Edits recover from a local browser draft. Saving creates an immutable version with optimistic concurrency. A conflict keeps the draft and offers a copy or explicitly discarding it to load the latest version.
- History compares fields between versions, restores old content as a new version and duplicates a selected historical definition. Archive preserves history. Journey usage links each definition to actual journeys and their recorded version; missing version data remains unknown.
- Muse Wonder proposals are reviewed field by field and applied to the editable draft. Applying a proposal does not save a version or launch a journey. Only approved content fields are accepted; model output cannot set IDs, environment permissions, credentials, budgets or continuity.

## Execution integration

New journeys pin exact authored persona, charter and environment snapshots plus a separate effective execution policy. Structured persona and charter fields enter runtime instructions. Steps, tokens, duration, network mutation permission and payload capture use the intersection of the environment, charter and pinned policy. Retry and supporting-persona retests retain their snapshots and restrictions.

First-time personas receive no hidden previous-journey knowledge. Returning mode is currently declared knowledge only. Authored expectations remain assumptions/reference material, not proof of observed behavior. Historical source records are not backfilled or rewritten.

Unavailable suggested personas no longer prevent a fix from being generated from an old charter. Explicitly required profiles still must be available. Existing LittleSteps supporting-persona behavior is retained.

## Implementation

- UI: `journey-workspace/src/LibraryWorkbench.tsx`, `library-authoring.ts`, `library-workbench.css`, `run-selection.ts` and routing in `App.tsx`.
- Persistence: `journey-engine/workspace-store.mjs`.
- Drafts/API: `journey-engine/library-drafts.mjs`, `workspace-api.mjs`.
- Execution: `journey-engine/library-context.mjs`, `server.mjs`, `workspace-execution.mjs`, `workspace-fixes.mjs`.
- QA receipts and screenshots: `outputs/library-authoring-qa/`.

## Validation

- Backend initial full suite: 126 passed. After the final draft-validation additions, the 129-check full suite produced 128 passes and one 15-second browser timeout in the existing iframe/shadow-focus regression. That exact test passed on an isolated rerun in 2.36 seconds; no test or timeout was changed. Final draft/API subset: 16 passed. Both full-suite output and the isolated retry outcome are retained in the QA artifacts.
- Frontend suite: 136 passed, including authoring payload boundaries, historical version mapping, local-draft recovery validation and charter launch selection. TypeScript and production build passed.
- Browser acceptance: 14 intercepted fixture workflows passed, including local draft reload, new-draft cleanup, stale save recovery, historical duplicate/restore, archive, selective AI apply, charter policy payloads, launch defaults, clear-all reload, keyboard navigation and 320/390px layouts. These checks made no real API writes or model calls.
- Live read-only browser smoke: 6 routes passed, covering both Library collections, real persona editor/history, existing Journeys and the existing Fix with both recorded videos ready. No page JavaScript errors.
- Real Meta draft requests are preserved separately from fixture tests. One response-format failure was followed by a schema-valid response whose content review found repeated placeholders and unrelated text. HTTP success alone did not satisfy semantic acceptance; that content was not saved. The final bounded follow-up passed full field-by-field review against the supplied brief.
- Before/after preservation checks confirmed 34 journeys, 38 findings, 5 fixes and all approvals unchanged. Library definitions and environment versions are unchanged; newly exposed `versionCreatedAt` is metadata only.

## Remaining planned work

Automatic sourced memory publication, audience-scoped retrieval, contradiction inspection and knowledge adoption are still pending in P4. Cross-journey Coverage/Experience (P5), competitor research (P6), and calibration (P7) remain separate increments. Real analytics acceptance and draft-PR delivery still need user-selected connections/data. No PR, approval or existing candidate change is part of this authoring increment.

## Real Muse Wonder drafting acceptance

Three bounded provider attempts are retained in `outputs/library-authoring-qa/real-meta-draft-attempt-*.json`. The first failed local output validation. The second returned HTTP 200 with valid structure, but manual content review rejected repeated placeholders and unrelated text. Its original response/audit remain intact; later review records the failure.

The final attempt used strict JSON Schema with field-specific descriptions and explicit empty values for unknown facts. The actual generated persona retained the phone, fifteen-minute availability and no-printer constraints; knowledge, skills, context and priorities stayed empty. Success/stop criteria were proposed goals, not observed product results. Full content review passed. Provenance: `muse-wonder-1.0`, response `resp_6ae6bb350b27b2c54e32433f`, 204 input + 1,421 output = 1,625 reported tokens, 17.4 seconds. This is one successful drafting probe, not a general model-quality benchmark or a fresh journey acceptance run.

The service also rejects repeated nonempty placeholder-like content and retains safe failure diagnostics/usage without exposing provider debug data. Review-before-save remains necessary: structural and repetition checks do not establish semantic correctness. No generated persona was saved and no journey was launched. The final response, content review and record-preservation receipts are in `real-meta-draft.json` and `after-restart-preservation.json`.

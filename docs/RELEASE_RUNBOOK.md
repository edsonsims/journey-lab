# Local release runbook

## Start and review

Requirements: Node with `node:sqlite` (validated locally with Node 23.6), npm, Google Chrome, FFmpeg/FFprobe, Python 3 for the optional static LittleSteps server. Muse Code is required for candidate implementation. Only the existing Meta connection is used.

1. Install dependencies in `journey-engine` and `journey-workspace`; build the workspace with `npm --prefix journey-workspace run build`.
2. Start the owned target: `python3 -m http.server 4320 --bind 127.0.0.1 --directory little-steps` from the repository root. Do not start another process if that port is already serving it.
3. From `journey-engine`, use `JOURNEY_SHOW_BROWSER=1 npm run start:secure` with the existing 1Password Environment mount. Approve/unlock 1Password when required. The launcher never prints or copies secrets and does not unlock 1Password automatically.
4. If the secure mount is unavailable, the launcher opens review mode after ten seconds. History, videos, editing and local analysis remain available; model-dependent actions require a connected Meta key. Stop review mode before restarting securely after approval.
5. Open `http://127.0.0.1:4319`. Connections displays model configuration and whole-volume disk capacity. A configured key is not a successful inference receipt; verify an authorized journey separately.

`npm start` starts directly using the current process environment. `JOURNEY_PORT`, `JOURNEY_WORKSPACE_DIR`, `JOURNEY_RUNS_DIR` and `JOURNEY_COMPARISONS_DIR` support isolated local workspaces. Never use a control-panel origin as a test target. Framework apps need explicit start/build/test commands and dedicated test data.

## Memory

New final journey reports may propose reusable learnings with actual screenshot references and confidence. Validation happens after recording timing/integrity checks. Missing or invalid sources become retained publication failures. Historical recordings are not backfilled automatically.

First-time personas have no prior persona-role knowledge. Returning continuity **and** a charter with `Relevant Memory` are both required. Optional selected entries further narrow retrieval. Persona identity, source build, environment, screen, expiry and contradiction checks still apply. A source fingerprint is not independent proof that a hosted deployment matches the source directory.

The Technical tab shows role snapshots and actual persona screen-access history. Operational/evaluator snapshots stay separate from the exploring persona. New fix rounds select eligible evaluator references from the discovery journey's frozen snapshot and recorded finding screens, then include them in the existing Muse Code acceptance-plan request. Code & checks shows the selected versions, sources and confidence. Operational knowledge remains an inspectable setup checklist and cannot grant execution permissions. There is no extra evaluator-model request. Memory published during a run cannot change its active snapshot or an ongoing comparison. Experimental source provenance cannot be removed by editing a memory entry.

## Coverage and Experience

Start with observed screens, which deliberately have no whole-product denominator. Define a curated inventory with provenance, scope, device/environment and criteria, or prepare it from observations as a partial inventory. Saving creates a new version. Saved scope reports freeze the inventory, source records and reviews. Product aggregates exclude experimental and invalidated records by default.

A screenshot establishes a visit; an executed action establishes interaction. Sourced criteria establish evaluation; an explicit criterion review is needed for a verified outcome. Synthetic friction (0–3) and reviewer scores remain separate. A low moment opens its original recording timestamp, and a charter prepared from a gap must still be saved before launch. Screen states can be assigned to an exact captured frame with a reviewer reason; assignments have immutable versions and do not rewrite the original observation or grant the persona later knowledge. Frozen reports retain the assignment versions.

## Competitors

Supply a competitor and up to five public source URLs. Research performs at most one Meta request over bounded captured text and proposes at most twelve unreviewed claims. DNS/address/redirect checks prohibit private-network fetches. Authenticated competitor navigation and automated discovery are outside scope.

Every claim needs a retained source and an exact excerpt. Direct behavior claims require an actual recorded journey reference. Profiles and claims are versioned; source refreshes never replace earlier captures. Comparisons expose missing evidence, topic/context mismatch, review status, freshness and contradictions. They do not infer a winner or business uplift.

## Calibration

No live analytics provider is connected. Import a bounded JSON event export (up to 5,000 events / 2 MB) with explicit source provenance and human/synthetic/unknown traffic labels. Session identifiers are pseudonymized; private URL details are removed. Unknown or synthetic traffic is excluded from real reference cohorts. Raw provider credentials never belong in imports.

Map analytics events to actual outcomes (`goal_reached`, `obstacle_observed`, `inconclusive`), visible action labels, recorded event types or canonical screens. Use compatible product build/environment/cohort/time data and repeated baseline sessions. A mobile cohort does not establish a printer constraint. Retry compares repeated exact actions/events with a declared minimum of 2–20. Backtracking compares a canonical A → B → A screen sequence after collapsing repeated frames, using an explicitly mapped event stream. Missing or ambiguous sequence data remains unknown. LLM wait time is never a human hesitation metric.

Study creation freezes definitions and a disjoint reference split. Starting a study proposes bounded **persona-context field** adjustments and executes independent development/held-out browser trials. This release does not tune arbitrary system prompts or execution permissions. Mutating calibration targets currently require the stateless-demo isolation adapter; framework/backend test-data seeding needs an adapter before use.

Candidate trials have explicit session/action/token/time limits and isolated experimental memory. Missing usage stops further work. Approving an eligible real-reference candidate requires its exact version, result ID and result hash, still-current source/environment controls, and a human review action. Adoption creates one new persona version and retains the benchmark. Fixture outcomes never qualify for real adoption.

## Retention, backup and recovery

No purge/TTL or automatic evidence deletion exists. Archive changes visibility. New captures require a capacity preflight with a 2 GiB reserve and a 1 GiB capture allowance; the displayed use is for the storage volume, not a per-project quota.

Before replacing a running service, check health, queued journeys and active fix/research/calibration jobs. Prefer letting authorized work finish. A controlled shutdown cancels/drains child work and retains partial artifacts. Interrupted work remains marked; a journey retry creates a new recording ID. Calibration with unknown spend requires a recorded usage receipt before further trials.

For a backup, stop the service cleanly and copy the full `journey-engine/workspace-data/`, `journey-engine/runs/`, `journey-engine/comparisons/` and `improvement/workspaces/` directories together. Keep candidate source directories and their referenced paths. For a running SQLite database, use the SQLite backup API instead of copying only the main file while ignoring its WAL. Preserve existing source/media when restoring; restore into a separate workspace and validate there before replacing the active one.

## Verification

Run `npm --prefix journey-engine run check`, `npm --prefix journey-workspace test`, and `npm --prefix journey-workspace run build`. Browser acceptance scripts and retained results live under `outputs/`; fixture stores are separate from the live workspace. Mocked Meta responses prove control flow, not current provider behavior.

The prepared real acceptance script is `scripts/acceptance-journeys.mjs`. It refuses to run without a configured Meta key, records intent and IDs, resumes without duplicate journeys, and never approves or publishes a fix. Its budget is six sessions: four LittleSteps before/after recordings plus Fieldnote first-time/returning memory. Each session uses at most 12 actions, 150,000 tokens and five minutes; provider usage is checked conservatively but an in-flight request's actual reported usage can exceed its estimate.

That initial acceptance stopped after five incomplete sessions on 1 November: the conservative next-request estimate exceeded the remaining allowance before actual usage reached the configured limit. Original records remain intact. The separate post-fix harness, `node scripts/acceptance-budget-fix.mjs --execute`, has its own checkpoint and at most six new sessions; it tests first-time/returning memory before admitting the four paired journeys. It does not retry failed or uncertain submissions. Read the current checkpoint before using either harness.

Journey preflight now reuses a verified provider input-token receipt only when the request configuration and entire prior input prefix are unchanged. New content receives the conservative byte/image estimate plus a positive margin. Missing/inconsistent usage, configuration changes, prefix edits or measured estimate drift force the original full estimate. The ledger charges every invocation's complete provider usage, including cached tokens. Estimates are not a provider-enforced spending ceiling. Technical shows actual usage separately from next-request reservation; numeric per-request diagnostics are retained without prompt contents or encrypted reasoning. A persona-memory access receipt is written only after a valid provider response, never for a locally rejected request.

Before running it, start the owned Fieldnote target with `node outputs/live-scope-acceptance/serve-fieldnote.mjs` on port 4388. Then run `node scripts/acceptance-journeys.mjs`. Preserve its state/report and investigate failures rather than repeatedly launching to force a success. A final “finished” model report does not by itself prove the goal; inspect the recordings and source references.

## Gather change-impact demo

Start `node gather/serve.mjs` from the repository root to serve the frozen current/proposed products on 4390/4391. `GET /__gather/build` returns each served source identity. These apps use fictional reservations in independent browser sessions; there is no real booking or payment. The repaired candidate is available through the existing Fix preview controls.

The current completed review is `/projects/gather/impact/3c976cd2-5a9a-4c58-aef7-a40e4948f5e3`. It uses the existing secure Journey Lab server on 4319. The header and contextual submenu lead to the local change review; external PR-provider automation is not connected.

`scripts/gather-demo.mjs` retains its setup, intent/receipt and finite eight-session checkpoint in `outputs/gather-pr-demo`. Its explicit phases are `--prepare`, `--discover` (four journeys), `--fix` (one real Muse Code candidate followed automatically by four fresh retests), `--link`, and `--report`. The completed checkpoint must be reused; do not delete/reset it or replay a paid phase to manufacture a preferred outcome. Unknown dispatches/usage stop further paid work. A new experiment needs its own configuration and preserved provenance.

The independent product verifier accepts an isolated source directory: `node gather/qa/verify-candidate.mjs --directory /absolute/path/to/candidate --label candidate-review`. It makes no Meta requests, preserves source, runs actual browser reservations, and retains screenshots/results. The original base/proposal fixtures intentionally fail different parts of the complete repair criteria; those negative-control receipts are not product passes.

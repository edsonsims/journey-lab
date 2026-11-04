# Runtime release checks — 2026-11-01

The P7 adapters and P8 operational checks are implemented locally. No real model call, external research request, or live server restart was performed during this verification pass. Real analytics calibration remains awaiting a compatible user-supplied dataset.

## Verified behavior

- Insights, Competitors, and Calibration APIs mount before the generic workspace router, behind the same loopback host/origin boundary.
- Calibration sends only authored persona context and development comparisons to Meta. Held-out observations and expected metric outcomes never enter the exploring persona’s prompt.
- Experimental journeys preserve exact persona, charter, environment, model, and memory snapshots. Each journey has a separate browser context. Source changes and changed environment versions stop execution. Mutating calibration currently requires the supported `stateless-demo` strategy; a general server-side fixture adapter is not implemented.
- Candidate attempts and sessions are finite. Output requests have a 4,096-token ceiling; preflight estimates reserve input capacity and provider receipts account for actual usage. Estimates are not a provider-enforced exact total-token ceiling. Unknown or exhausted usage stops subsequent work, and interrupted studies cannot resume without trustworthy reconciliation.
- Explicit adoption targets the exact original persona version and validation result. A changed current persona cannot be overwritten. Persona append and idempotent adoption receipt commit in one SQLite transaction. Environment and source are checked again before a new adoption; an already-committed receipt can be reconciled without appending twice.
- Experimental memory inherits its provenance even through manual edits. Default Insights excludes experimental journeys. First-time personas receive no prior persona knowledge; operational/evaluator snapshots do not enter their exploration prompt.
- Shutdown cancels and drains current workspace jobs and browser recording finalization. Restart marks orphaned active records interrupted; it does not resume them or delete their captured experience.
- Capture preflight requires 2 GiB of reserve plus 1 GiB of capture allowance. Low or unknown storage stops a new browser capture. Health reports whole-volume free/used space. This is a preflight, not protection against another process filling the disk mid-recording.
- `POST /api/workspace/fixes/:id/retest` accepts optional `limits:{maxSteps,maxTokens,maxDurationMs}`. Positive integer caps may only narrow every pinned persona’s effective limits. The override applies identically to both variants and every selected persona, is recorded in comparison metadata, and does not rewrite source snapshots. Omitting limits preserves previous behavior.

## Automated checks

Earlier retained full-suite baseline, `node --test journey-engine/*.test.mjs`: **240 passed, zero failed, zero skipped**, 12.10 seconds after calibration outcome/privacy hardening and fixture retention. Includes 18 Fix tests, 9 calibration runtime tests and 4 secure-launcher tests; a complete fixture study used the production domain and runtime adapters with mocked Meta/browser execution, recorded four independent sessions and remained unadopted.

Retained final log: `outputs/release-qa/engine-tests-2026-11-01-retention-final.txt`. Earlier 238- and 233-test passes remain preserved in `engine-tests-2026-11-01-final.txt` and `engine-tests-2026-11-01.txt`.

## History benchmark

A retained synthetic SQLite fixture contains 1,000 journeys with 50 events each. Three warm 100-row page samples compared a reconstruction of the prior full-record list implementation with the metadata projection/cursor implementation:

| Measurement | Previous list | Metadata page |
| --- | ---: | ---: |
| Median local query time | 75.10 ms | 7.78 ms |
| Serialized 100-row response | 1,483,801 bytes | 115,101 bytes |

Page IDs matched; the complete source-record hash remained unchanged. Snapshots, model requests, technical payloads, and replay maps are absent from list responses and remain available on detail routes. This measures local metadata reads, not browser rendering or video loading, and does not claim pagination for every other collection.

Recorded target: Apple M4 Max, 16 CPUs, 64 GiB RAM, Darwin 27.2.0 arm64, Node v23.6.0. Report and retained fixture: `outputs/release-qa/paging-2026-11-01-final/`. The first benchmark attempt exposed a Node SQLite statement lifetime issue in the benchmark helper; it was corrected and its fixture was retained under `paging-2026-11-01/`.

Real authenticated journeys, visual acceptance, and replay review are separate verification steps managed by the main task.

## Secure local startup

From `journey-engine/`, run `npm run start:secure`. The launcher starts the existing command `node --env-file=.env server.mjs`; only that child Node process consumes the 1Password mount. The launcher never opens or reads the FIFO, unlocks 1Password, copies keys, or prints child startup stderr.

If startup has not reached the app’s ready message within ten seconds, the launcher terminates that child before starting review mode. Review mode deliberately removes provider-key variables from its child environment and reports Meta unavailable; existing journeys and recordings remain usable. If review mode also fails, startup stops without retrying. A stop signal prevents fallback, and normal shutdown gives the server time to flush recordings before a bounded forced stop.

Recovery: unlock 1Password yourself, stop the review-mode app, and run `npm run start:secure` again. Do not read, copy, or replace the mounted `.env` file. `npm start` retains its existing direct-server behavior and does not itself load the secure mount. `JOURNEY_START_TIMEOUT_MS` optionally changes the bounded startup wait (100–60,000 ms); no unlock is automated.

Launcher verification uses simulated Node child processes only: secure handoff, blocked-mount timeout and termination before fallback, credential-free review mode, cancellation during startup, two-failure exit, and suppressed raw startup errors. These tests do not unlock 1Password, consume the real mount, restart the live app, or invoke a model.

## Test fixture retention and browser regression

New Library authoring, Memory, Insights, Competitors, Calibration, capacity and paging tests now allocate unique retained directories through `retained-test-fixtures.mjs` under `outputs/automated-test-fixtures/`. Their teardown closes servers, databases and child processes without removing fixture files. Database fixtures previously held only in memory now also persist in this output folder. Launcher tests use simulated child processes and do not create filesystem fixtures. Earlier fixture artifacts were not removed by this migration. The main release pass subsequently migrated the remaining legacy test teardown as well; its final full-suite receipt is recorded in the release status document.

The final 240-test run includes **focused input metadata follows iframe and open shadow focus and identifies private fields**, which passed in 662 ms. It checks ordinary iframe focus, private-field classification/redaction and shadow-root privacy; it does not by itself establish visual masking in every cross-origin iframe. The earlier 15-second timeout documented in `LIBRARY_AUTHORING_STATUS.md` remains historical evidence and was not overwritten or reclassified.


## State-specific coverage review

Insights now supports a versioned reviewer observation on one exact recorded screenshot. `POST /api/workspace/insights/screen-states` requires project, run, screenshot event index, source hash, visible state (or null for unknown), reason, and the current assignment version. A replaced source, stale version, foreign project, active recording or invalidated evidence cannot be silently accepted. Original run JSON and captured media are never rewritten.

Only the assigned screenshot exposure matches a state-specific inventory definition. Other frames at the same path remain unknown until separately observed; a state label never establishes a verified criterion outcome. Saved reports pin the assignment IDs, versions, reasons and exact frame provenance used at report creation. These reviewer observations are confined to Insights; they do not publish Memory or enter an exploring persona’s context. The existing recorded-state field remains an explicitly labeled recorded observation when present.

The screen detail includes a compact frame selector, source image, visible state, reason and append-only assignment history. An empty state explicitly restores unknown. Frozen reports expose their pinned observation without authoring controls. Screen table subtitles now identify environment and a short build identity; full context IDs remain available in the tooltip and detail.

Focused validation: **26/26 Insights domain/API tests**, **8/8 frontend data tests**, production TypeScript/Vite build, and **9/9 isolated browser checks**. The browser exercised the production UI against a separate retained SQLite fixture API, including frame selection, exact-source save, unknown correction, untouched recordings, frozen reports and a 375-pixel layout without page overflow. No real workspace API mutation, external model call or live server restart was used. Final state-review receipt and desktop/mobile screenshots: `outputs/release-qa/insights-state/2026-11-01T05-37-21.934Z/`. Two earlier fixture-browser startup timeouts are retained; their local static harness omitted the build’s `/workspace-assets/` prefix, which was corrected before the passing check.


## Final integrated pass

After all Memory flow, evaluator-reference prompt budget, screen-state review and Calibration sequence fixes, `npm run check` passed **259/259** engine tests, and the frontend passed **147/147** tests plus its production build. Logs: `outputs/release-qa/engine-post-audit.txt`, `frontend-post-audit.txt`, `build-post-audit.txt`.

The parent task also migrated the remaining legacy engine filesystem fixtures to `retainedFixture`; no filesystem rm/rmdir teardown, tmpdir or direct mkdtemp remains in engine test files. The earlier scoped-retention limitation above is superseded for future test runs. Existing files were preserved. The focused legacy subset passed 37/37 before the full integrated pass.

The local app was restarted with no active jobs in credential-free review mode. Final health, counts and original-record preservation are in `outputs/release-qa/final-receipt.json`. Fresh authenticated Meta sessions remain blocked by 1Password approval; zero new paid model calls were made. See `RELEASE_STATUS.md` for all browser receipts and explicit setup gates.

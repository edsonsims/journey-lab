# Journey Lab

**One product. Many journeys.** Journey Lab helps you understand your product through the eyes of AI personas. Each persona has its own goals, context and constraints. It goes through a task (a *mission*) in your real app while Journey Lab records every action and reaction, simulating a real user. You then follow their journeys, see what works and what frustrates them, try a fix, and run the same mission again to compare.

Built for the Meta Global AI Developer Hackathon.

## What it does

1. **Create a persona.** Type it, or speak the brief. Motivation, context, expectations and constraints shape how the persona makes choices.
2. **Create a mission.** Set the objective, the scope and what success looks like.
3. **Run the mission in your live app.** A real browser session in which the persona clicks, types and navigates the actual UI (not a mockup). Every action, screenshot and reaction is recorded.
4. **Review the evidence.** You get frame-by-frame tracks, source-linked findings and an **emotional arc** of the persona's reactions. Clicking a finding or a reaction jumps to that exact moment of the recording.
5. **Improve, rerun, compare.** Journey Lab proposes a visual direction, implements an isolated fix candidate, and reruns the same personas and missions. Before/after recordings, outcomes and emotional arcs sit side by side. A fix for one persona is checked against the others.

## Meta models and their roles

| Model | Role in Journey Lab |
| --- | --- |
| **Muse Voice Transcribe 1.0** | Transcribes spoken persona and mission briefs |
| **Muse Wonder 1.0** | Drafts personas and missions, drives the browser journeys, records reactions, runs independent retests |
| **Muse Image 1.0** | Creates a visual design proposal from a recorded screen |
| **Muse Code (Muse Spark 1.3)** | Implements the fix candidate in an isolated workspace |
| **Muse Glimmer 30B (local)** | Summarizes supplied observations locally on your computer, with no cloud fallback |

## Example app: Gather

`gather/` is a fictional meeting-room booking app, used to demonstrate the loop:

- **Maya** (office coordinator, $250 budget) sees a $220 headline turn into $280 all-in, and loses her meeting name when she changes rooms. The fix shows full prices earlier and keeps the details filled in. In the recorded retest she goes from 10 actions to 5.
- **Alex** (executive assistant, wants it quick) is used as a regression check: still 6 steps after the fix.
- **Casey** (keyboard-only) hits a deliberately seeded barrier (`gather/keyboard-demo/`), where **Confirm reservation** is a `span` that Tab never reaches. The fix replaces it with a native `<button>`, and the retest completes with Enter.

## Quick start

Requirements: Node.js 23.6+, npm, Google Chrome, FFmpeg/FFprobe (on `PATH`, or set `JOURNEY_FFMPEG` / `JOURNEY_FFPROBE`).

```sh
npm --prefix journey-engine ci
npm --prefix journey-workspace ci
npm --prefix journey-workspace run build
(cd journey-engine && npx playwright install ffmpeg)

npm --prefix journey-engine start          # http://127.0.0.1:4319
node gather/serve.mjs                      # Gather base :4390, proposal :4391
```

Without a key, the workspace opens in review mode. To run journeys with Meta models, provide `MODEL_API_KEY` through the process environment. Never commit it. Muse Code is used through its CLI (`MUSE_BIN`, default `.tools/bin/muse`).

Optional local analysis with Muse Glimmer (llama-server on port 1234; set `JOURNEY_GLIMMER_PATH` to the GGUF checkpoint):

```sh
npm --prefix journey-engine run model:local
JOURNEY_LOCAL_MODEL_URL=http://127.0.0.1:1234/v1 JOURNEY_LOCAL_MODEL=muse-glimmer npm --prefix journey-engine start
```

## Repository layout

| Path | What it is |
| --- | --- |
| `journey-engine/` | Node server: journeys, recording, findings, fixes, retests, insights, memory, Meta model calls |
| `journey-workspace/` | React + Vite workspace UI (Home, Journeys, Findings, Fixes, Insights, Library, Settings) |
| `improvement/` | Isolated Muse Code fix workspaces, reviewable patches and independent verification |
| `gather/` | Example app (base, proposal and keyboard-demo fixture) and its QA tests |
| `little-steps/`, `journey-ui/` | Earlier scenario and legacy UI |
| `scripts/` | Demo, acceptance and film tooling |
| `docs/` | Features, development, release notes and design docs |

Run records, recordings, databases, fix workspaces and generated media stay local and are excluded from Git. A fresh clone starts without recorded journeys.

## Tests

```sh
node --test journey-engine/*.test.mjs
npm --prefix journey-workspace test
npm --prefix journey-workspace run build
node --test gather/qa/runtime-lifecycle.test.mjs scripts/gather-demo.test.mjs
```

## More

- [Features in detail](docs/FEATURES.md)
- [Development](docs/DEVELOPMENT.md) · [Device profiles](docs/DEVICE_PROFILES.md) · [Release status](docs/RELEASE_STATUS.md) · [Runtime checks](docs/RUNTIME_RELEASE_CHECKS.md)

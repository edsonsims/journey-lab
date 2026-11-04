# Development

Source repository: `edsonsims/journey-lab`.

## Changes and commits

Commit completed changes in focused, descriptive commits after relevant checks pass. Inspect the diff and staged files before each commit. Preserve unrelated user edits. Push completed commits to the repository; report the commit and checks with the result. Do not change repository visibility, merge a product-fix candidate, or publish a deployment as part of this workflow.

The Journey Lab source repository is separate from the product repositories under test. Creating this repository does not configure draft-PR delivery for those products. Candidate approval still precedes draft-PR creation.

## Local setup

Use Node.js 23.6 or newer, npm, Google Chrome, and FFmpeg/FFprobe for recordings.

```sh
npm --prefix journey-engine ci
npm --prefix journey-workspace ci
npm --prefix journey-workspace run build
```

Start the app with `npm --prefix journey-engine start`. Without a Meta key, it opens for local review. For model execution, supply `MODEL_API_KEY` through the process environment or the existing 1Password mount and use `npm --prefix journey-engine run start:secure`. Never commit a key or mounted `.env` file.

Gather's fixture server can be started with `node gather/serve.mjs`. The managed demo runner starts and tears down temporary instances during its runs. See [Gather](../gather/README.md) for the scenario and commands.

## Validation

```sh
node --test journey-engine/*.test.mjs
npm --prefix journey-workspace test
npm --prefix journey-workspace run build
node --test gather/qa/runtime-lifecycle.test.mjs scripts/gather-demo.test.mjs
```

Use focused tests while editing, then the appropriate checks for the completed change. Validate visible UI changes in the browser. Live Meta acceptance runs are separate from deterministic tests and consume provider usage.

## Local data

Git excludes local SQLite databases, credentials, authenticated browser sessions, model runs, recordings, generated demo media, QA outputs, temporary fix workspaces, and synced ChatGPT reference material. Those files remain on disk. Do not remove them to prepare a commit.

Generated files under `journey-ui/demo-assets/` and `journey-ui/gather-demo-assets/` can be rebuilt with the film scripts when the source recordings are present. A clone contains the players and scripts, but not the local evidence archive.

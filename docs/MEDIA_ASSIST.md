# Media assistance

New local Journey Lab tools use the existing server-side Meta connection. No browser receives an API key. SAM is not integrated.

- Library persona/charter drafts accept microphone input or uploaded audio. The browser converts decoded audio to mono PCM16 WAV at 16 kHz. Recordings stop after 60 seconds; uploads must be under two minutes and 12 MB. Review the editable transcript before drafting or saving.
- Fix review uses an expanded Meta exploration workspace in place of Review Notes. Ask, Design, and Local analysis have suggested prompts and a dedicated result area. Voice input is available under Prefer to speak. Existing saved notes remain stored, but are not automatically included in new rounds.
- Full recording players have an expandable assistant. Ask Muse Wonder about up to eight sampled screenshots per recording, with captured annotations and validated evidence IDs. This is frame review, not continuous-video analysis. Missing timestamps remain unavailable. Answers and usage are saved under the workspace media-assist directory.
- Explore a design sends the selected original screenshot to Muse Image and saves a PNG concept with source provenance. The design is a proposal, not a tested improvement. In Fix review, select the before or after recording, choose Use proposal in next fix round, review the direction, then Create next fix round. The exact proposal image and provenance are copied to the new round for Muse Code; the existing verification and retest workflow applies.
- Local analysis summarizes or categorizes pasted observations using a separately configured local Meta model. It has no cloud fallback. It does not replace the existing hosted journey engine.

## Local Glimmer model

This Mac uses Homebrew `llama.cpp` with Metal and the official `Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf` checkpoint in `.tools/models/` (excluded from Git). The text-only server uses an 8,192-token context, one request slot, and low reasoning strength. No vision projector is installed. See [Meta deployment instructions](https://dev.meta.ai/docs/muse-glimmer/deploy) and [the official weights](https://huggingface.co/meta-models/Muse-Glimmer-30B-GGUF).

From `journey-engine`, run these in two terminals:

```sh
npm run model:local
```

```sh
npm run start:with-local
```

The second command uses the existing 1Password-mounted Meta environment and configures the local model without writing secrets. Unlock 1Password before launching. Stop each process with Ctrl-C. These commands do not install a login service. `JOURNEY_GLIMMER_PATH` and `JOURNEY_LLAMA_SERVER` optionally override the checkpoint and runtime binary paths.

For a different compatible local server, configure the Journey Lab environment:

```
JOURNEY_LOCAL_MODEL_URL=http://127.0.0.1:1234/v1
JOURNEY_LOCAL_MODEL=<the exact served Meta model identifier>
```

Only loopback HTTP endpoints are accepted; redirects are rejected. Restart Journey Lab to apply configuration. The local tab stays disabled when no endpoint and model are configured. A configured endpoint must still be running for inference to succeed.

## Verification scope

Automated tests check request limits, source isolation, citation validation, local-provider restrictions and the transcription multipart contract. These do not establish live provider success or local inference availability. Live Meta calls and microphone behavior need separate verification.

## Live verification — 3 November 2026

The existing secure Meta connection was restored after the user unlocked 1Password. One synthetic narrated brief was transcribed by Muse Voice Transcribe; the output contained repetitions, confirming the need for editable review. Muse Wonder answered a Gather recording question with valid source-frame citations and original timestamps. Muse Image returned a PNG concept. The first concept incorrectly treated base room rates as booking totals; the generation prompt now explicitly requires unknown totals to be placeholders, and the fix worker treats generated business facts as unverified. A second proposal used verified $280/$245 totals and was copied byte-for-byte into Gather fix round 2 with its source provenance. Muse Code (`muse-spark-1.3`) implemented the card layout in an isolated candidate, followed by the configured tests and automatic Muse Wonder retests. Both Gather personas reached the goal in fresh before/after sessions (four successful journeys). Independent browser QA passed all 16 checks, including exact prices, reservation persistence, name preservation, and the quick booking path. All 54 pre-existing run files and the complete first fix round remained unchanged. These are synthetic runs and functional checks, not human validation. The candidate is awaiting review, with no approval or delivery performed. Evidence: `outputs/media-assist-full-flow/flow-result.json` and `candidate-qa/receipt.json`.


Local Glimmer was installed and its complete 16,756,683,904-byte checkpoint matched the official SHA-256 `4cc57c0f51040a226e5a72cc47b7613f7772950e460a665f7083de89f183f60e`. The Metal runtime loaded successfully and exposed `muse-glimmer` through `/v1/models`. Journey Lab's Local analysis UI returned a correct three-bullet summary of the verified test facts in about 6.3 seconds (141 generated tokens, about 26.6 tokens/second in this single check). The response explicitly retained the synthetic-versus-human limitation. Evidence: `outputs/media-assist-full-flow/local-install.json`, `local-analysis.png`, and runtime logs. The server binds loopback and permits browser origins only from localhost. No cloud fallback is configured for Local analysis.

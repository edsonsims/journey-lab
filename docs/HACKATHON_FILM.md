# Three-minute hackathon review film

The current 2 November review cut follows the 364-word English script in
`scripts/hackathon-film-v2.json`. It introduces Journey Lab immediately, shows the
first recorded discrepancy at 16 seconds, and uses sixteen focused beats of 8–16
seconds. This revision follows Edson's direction to emphasize perceived value,
short hooks and the effect of one change on different users. It uses Samantha
from macOS for temporary narration.
ElevenLabs and Edson's own voice are deferred until he approves the edit.

The local deliverable is `outputs/hackathon-film-v2/index.html`. Serve its directory
on localhost to review the video, captions, transcript and chapter navigation.
`film-captioned.mp4` includes burned captions; `film.mp4` has selectable captions.
Both are 180 seconds at 1920×1080/30fps.

Rebuild on the source Mac with Pillow, NumPy, FFmpeg and the installed Samantha voice:

```sh
python3 scripts/hackathon-film-v2.py --preview
python3 scripts/hackathon-film-v2.py --reuse
python3 scripts/serve-hackathon-film.py --cut v2 --port 4329
```

Retained run records, original videos, the Gather candidate, QA receipts and local
UI captures are required. The generator snapshots existing feature-preview images;
`assets/home.jpg` and `assets/candidate.jpg` are native current-UI captures made for
this cut. Generated media and recordings remain excluded from Git. Earlier films
are preserved. The first cut retains its original 330-word, nine-chapter script
in `scripts/hackathon-film.json` and media in `outputs/hackathon-film-v1`.

The included localhost server supports HTTP byte ranges for native video seeking.
The standard Python simple file server does not provide that behavior on this Mac.

The early comparison shows Alex's 8 to 6 and Maya's 7 to 12 recorded actions for
the current-to-proposed change. The later paired review holds original frames at
22.597s before and 20.156s after for five seconds (film 1:49–1:54), labeled
**Held review frames**. The full reaction curves show observation
progress; other points are not asserted to be equivalent actions. Maya completes
both bookings; 12 to 6 is an observed action count, not human time savings. Atlas
remains $280 and Willow $245. The candidate remains awaiting review.

`source-manifest.json` records clip edits, visible ranges, source hashes and output
hashes. `picture.mp4`, `narration.wav`, sixteen chapter narration stems, `music.wav`,
`narration-cues.json` and `voice-replacement.json` keep the edit replaceable. When the
approved voice is supplied, align it to the picture and regenerate captions from
the new audio timing. Mac caption timings are not a guarantee for another voice.

The renderer makes no model requests, changes no candidate approvals, and uploads
nothing. The soundtrack is a quiet original procedural instrumental pad generated
locally. Visual inspection and full media decoding are separate from product tests.

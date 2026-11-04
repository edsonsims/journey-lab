# Gather: local PR-impact product

Gather is an owned fictional meeting-room booking product. `base/` and `proposal/` are independent static source directories for paired browser journeys. Each contains `index.html`, `styles.css`, `app.js`, and two local room images under `assets/`. There are no external dependencies, accounts, payment calls, or real reservations. The original three-file builds are preserved under `versions/2026-11-01/` for historical evidence.

Start both:

```sh
node gather/serve.mjs
```

- Base: `http://127.0.0.1:4390/`
- Proposal: `http://127.0.0.1:4391/`
- Each server exposes its current manifest, including room images, and manifest hash at `/__gather/build`.
- Optional port overrides: `GATHER_BASE_PORT`, `GATHER_PROPOSAL_PORT`.

## Fixture

The default selection is **Tomorrow**, **10:00–11:00**, **12 people**, **projector required**. Tomorrow is a literal fixture label rather than a clock-derived date. Meeting-name input is empty; suggested acceptance input is **Quarterly planning**.

| Room | Capacity | Room rate | Projector | Service | Total with projector |
| --- | --- | --- | --- | --- | --- |
| Atlas | 12 | 220 | 35 | 25 | 280 |
| Willow | 12 | 235 | 0 | 10 | 245 |

Prices are CAD. Both source versions preserve these exact prices and capacity rules. The selected projector requirement affects the actual total, not only the displayed label. Confirming writes a reservation containing room, meeting name, people, projector, date, time, line items, total and confirmation ID into `sessionStorage` under `gather-reservations-v1`. The confirmation screen and My reservations read that stored record. A new browser context has no reservations.

## Behavior

Base displays all-in totals on cards and keeps the entered meeting name when changing rooms. Its primary path is:

1. Plan a meeting.
2. See available rooms (requirements already default to the fixture).
3. Choose Atlas or Choose Willow.
4. Fill Meeting name.
5. Review booking.
6. Confirm reservation.

Proposal enables the `QUICK_BOOKING` feature flag, making rooms directly selectable on the landing page. It displays room rates on cards and reveals mandatory line items only at review. Choose another room clears the entered name. Its shortest direct path is four interactions: choose room, fill name, review, confirm.

These are deliberately observable trade-offs, not hardcoded persona reactions. A coordinator with a 250 budget may choose the initially cheaper Atlas, encounter the 280 total, then recover through Willow at 245 after re-entering the meeting name. Recovery remains available; a completed journey must not be relabeled blocked. An assistant with a 350 budget can complete the short Atlas path. Actual model choices, reactions and outcomes require real journey evidence.

The repair candidate should retain the short path while resolving the finding. Simply switching off `QUICK_BOOKING` would discard the proposed speed benefit. No repaired third version was handcrafted here.

## Historical source identities

- Base: `88ee8fccc38c1b57dcd1d2aba53f19780fc2aeaba9fffe6a506b98bce810dc20`
- Proposal: `816de64ef3deb77c89a586aeb8a977e007c5e15c6f8404be06dd323307a010c9`

These are the original SHA-256 hashes of sorted filename/content-hash pairs, consistent with the isolated fix runtime's manifest representation. Those exact three-file builds remain in `versions/2026-11-01/base/` and `versions/2026-11-01/proposal/`. The active builds received new room imagery on 2 November 2026 and have distinct hashes: Atlas reuses Home v3's image losslessly, and Willow uses a new photorealistic generated image. See [image provenance](room-images.txt). Existing recordings and pinned demo manifests retain their original identities; the new visuals do not change their historical evidence.

## Deterministic browser verification

```sh
node --test gather/qa/booking.test.mjs
```

Final Chrome run: six tests passed. Checks cover exact displayed and stored prices, both baseline goals, the shorter proposal path, late total/name loss with valid recovery, baseline name preservation, session isolation, projector pricing, and desktop/mobile overflow and page errors. Scripted interaction counts are not model/user timing measurements.

Retained receipt and screenshots: `qa/results/2026-11-01T23-02-49.083Z/`. Tests start temporary loopback servers and isolated browser contexts, preserve their artifacts, and do not alter the frozen source files or the active Journey Lab data. These checks do not establish Muse Wonder behavior, human reactions, or business uplift.

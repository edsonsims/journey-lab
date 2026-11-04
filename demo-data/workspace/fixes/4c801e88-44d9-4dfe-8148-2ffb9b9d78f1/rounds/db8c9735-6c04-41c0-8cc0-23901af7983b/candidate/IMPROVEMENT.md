# Improvement: compact aligned room-card pricing with prominent all-in totals

## Changed behavior
- Room cards keep the compact, consistently aligned price panel from the prior round (`min-width`, end-aligned flex column): the dominant figure is the softly highlighted **All-in total** pill computed from the existing `total(room)` logic — **Atlas $280** ($220 + $35 + $25) and **Willow $245** ($235 + $0 + $10) for the default 12-person, Tomorrow 10:00–11:00, projector-required configuration.
- Below the total, the card shows a dynamic context line (`1 hr · {slot} · with/no projector`), a conditional includes note, the hourly room-rate line, and a three-row fee breakdown (Room rate / Projector / Service fee) with breathing room (stacked rows, gaps, dashed separator).
- WITHOUT-projector math is unchanged and correct: Atlas $220 + $0 + $25 = **$245**, Willow $235 + $0 + $10 = **$245**, with the Projector line showing $0, the context line reading "no projector", and the includes note reading "Includes service fee · projector not selected" (no projector-included claim when deselected).
- The Choose buttons remain distinct real semantic buttons with unique visible names — **Choose Atlas** / **Choose Willow** — now with explicit `type="button"`; both keep the existing `:focus-visible` outline and lead through the unchanged short flow (choose room → one meeting-name field → review → confirm).

## Rationale (source-linked)
- Recorded finding `finding-49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc-0`: hourly rates ($220 Atlas vs $235 Willow) reverse the true all-in ranking ($280 vs $245); the persona expects to judge suitability from the full cost.
- Human review 2026-11-03: implement the selected proposal (image 5) only as a compact pricing-panel refinement — aligned panels, prominent all-in totals, readable line-item fees, distinct Choose buttons — while explicitly excluding the concept's AI Design Proposal banner, Maya/Alex names, budget badges, one-step claim, duplicate inline meeting-name fields, concept footer, and garbled text.
- Charter `gather-book-room` v1: preserve factual prices, capacities, and the existing successful booking path.

## Changed files
- [app.js](./app.js): `card()` Choose button gains `type="button"` only; pricing pill, conditional includes note, fee breakdown, `total()` math, `data-room-select` flow, `state.purpose` persistence, and `confirmReservation()` session-only logic are untouched.
- [styles.css](./styles.css): unchanged this round — existing `.room-price` alignment, `.all-in-total` highlight, and `.fee-breakdown` spacing carry the compact-panel refinement.
- [FIX_PLAN.json](./FIX_PLAN.json): acceptance contract for this round.

## Checks performed
- Re-read the edited `card()` line to confirm Atlas $220+$35+$25=$280 and Willow $235+$0+$10=$245 flow from `total()`/`projectorFee` with no hard-coded totals, the WITHOUT-projector path yields $245/$245, and the `details()` single meeting-name field plus `state.purpose` persistence are untouched.
- No tests were run and no browser retest was performed in this session (shell execution is disabled for this task). Treat the behavior above as code-inspection verified only.

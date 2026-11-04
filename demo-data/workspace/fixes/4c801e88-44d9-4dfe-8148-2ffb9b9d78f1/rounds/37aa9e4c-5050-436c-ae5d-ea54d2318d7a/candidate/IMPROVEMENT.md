# Improvement: aligned room-card price panels with highlighted all-in total

## Changed behavior
- Room cards (home and room list) now show a consistently right-aligned price panel (`min-width`, flex column, end-aligned) so Atlas and Willow totals line up.
- The dominant price is a softly highlighted pill: **All-in total $280** (Atlas) and **All-in total $245** (Willow) for the verified 12-person, one-hour, projector-required configuration, computed from the existing `total(room)` logic.
- Below it, a dynamic context line (`1 hr · {slot} · with/no projector`), a conditional includes note, the hourly room-rate line, and a three-row fee breakdown (Room rate / Projector / Service fee) with breathing room (stacked rows, gaps, dashed separator).
- The includes note is now conditional: "Includes projector and service fees" only when a projector is selected; otherwise "Includes service fee · projector not selected". No hard-coded slot, duration claim, or unconditional projector-included claim.

## Rationale (source-linked)
- Recorded finding `finding-49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc-0`: hourly rates ($220 Atlas vs $235 Willow) reverse the true all-in ranking ($280 vs $245); the persona expects to judge suitability from the full cost.
- Human review 2026-11-03: implement the selected proposal (image 5) as a modest readability refinement — aligned panels, highlighted dominant total, readable itemized fees — preserving exact totals, business logic, booking controls, persistence, accessibility, quick booking, saved reservations, and responsive layout; image values are guidance only, dynamic values from source, no projector-included claim when deselected.
- Charter `gather-book-room` v1: preserve factual prices, capacities, and the existing successful booking path.

## Changed files
- [app.js](./app.js): `card()` renders the highlighted `all-in-total` pill from `total(room)`, a dynamic `price-context` line from `state.slot`/`state.projector`, a conditional `includes-fees` note, and a three-row `fee-breakdown` from `room.base`/`projectorFee`/`room.service`. Pricing math, `data-room-select` buttons, and flow untouched.
- [styles.css](./styles.css): `.room-price` becomes a consistently aligned end-anchored panel; `.all-in-total` gets the soft `#edf2df` highlight; `.fee-breakdown` rows get gaps, separator, and line-height for readability. Palette, landmarks, and responsive breakpoints kept.
- [FIX_PLAN.json](./FIX_PLAN.json): acceptance contract for this round.

## Checks performed
- Re-read the edited `card()` line to confirm Atlas $220+$35+$25=$280 and Willow $235+$0+$10=$245 flow from `total()`/`projectorFee` with no hard-coded totals, and confirmed `go()`/`render()`/`bind()` purpose-persistence and booking flow are untouched.
- No tests were run and no browser retest was performed in this session (shell execution is disabled for this task). Treat the behavior above as code-inspection verified only.

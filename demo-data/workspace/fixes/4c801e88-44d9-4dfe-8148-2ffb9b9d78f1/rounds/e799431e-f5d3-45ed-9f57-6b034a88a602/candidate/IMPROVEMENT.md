# Improvement: dominant all-in totals with includes-fees label on room cards

## Changed behavior
- Room cards on home and the room list now lead with the all-in total as the dominant price: **All-in total: $280** for Atlas and **All-in total: $245** for Willow (12 people, one hour, projector required).
- Each card adds a visible **Includes projector and service fees** note (with a decorative info mark) plus secondary lines keeping the existing hourly room rate (`$220 room rate / hour`, `$235 room rate / hour`) and the fee breakdown (`$220 room + $35 projector + $25 service`; `$235 room + $0 projector + $10 service`).
- Totals are computed from the existing `total(room)` business logic in `app.js`; no prices, fees, or discounts were changed and no new controls or steps were added.

## Rationale (source-linked)
- Recorded finding `finding-49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc-0`: Atlas listed at $220/hour vs Willow at $235/hour reverses the true $280 vs $245 all-in ranking; the persona expects to judge suitability from the full cost.
- Human review 2026-11-03: implement the selected visual proposal (image 5) with dominant all-in price and the Includes label, preserving exact totals, room rates, meeting-name persistence, keyboard accessibility, quick booking, and saved reservation data; the image is visual guidance only.
- Charter `gather-book-room` v1: preserve factual prices, capacities, and the existing successful booking path.

## Changed files
- [app.js](./app.js): `card()` renders `All-in total: total(room)` as the dominant price with the includes-fees label, room-rate line, and computed breakdown; pricing math and button/booking flow untouched.
- [styles.css](./styles.css): `.room-price` right-aligned stacked layout with a slightly emphasized `.includes-fees` line; existing palette and landmarks kept.
- [FIX_PLAN.json](./FIX_PLAN.json): acceptance contract for this round.

## Checks performed
- Re-read the edited `card()` region and `total()` definition to confirm Atlas $220+$35+$25=$280 and Willow $235+$0+$10=$245 come from source logic, and confirmed `go()`/`render()`/`bind()` add no purpose-clearing or flow changes.
- No tests were run and no browser retest was performed in this session (shell execution is disabled for this task). Treat the behavior above as code-inspection verified only.

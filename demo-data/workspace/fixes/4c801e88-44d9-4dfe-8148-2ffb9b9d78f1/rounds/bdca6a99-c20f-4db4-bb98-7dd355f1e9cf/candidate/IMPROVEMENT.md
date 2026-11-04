# Improvement: all-in totals on room cards, meeting name preserved

## Changed behavior
- Room cards on home and the room list now lead with the all-in total for the
  current meeting setup instead of the hourly room rate alone.
  - Atlas shows **$280 total for your meeting** with
    "$220 room + $35 projector + $25 service · nothing added later."
  - Willow shows **$245 total for your meeting** with
    "$235 room + $0 projector + $10 service · nothing added later."
  - The correct budget ranking (Willow below Atlas) is visible before the
    visitor enters a meeting name.
- The meeting-details page now shows the same price breakdown beside the name
  field, so the total is visible while naming the meeting, not only at review.
- Going back with "Choose another room" no longer clears the entered meeting
  name. The name stays in the field when switching between Atlas and Willow,
  and review still requires a non-empty name.

## Rationale (source-linked)
- Recorded finding `finding-49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc-0`:
  Atlas listed at $220/hour vs Willow at $235/hour, but review totals were
  $280 ($220 + $35 + $25) vs $245 ($235 + $0 + $10). Comparing by hourly rate
  alone reverses the true ranking.
- Persona `gather-coordinator` (Maya): must keep the complete cost at or below
  $250 and expects "to understand what you are paying and keep the details you
  have already entered when changing a choice."
- Charter `gather-book-room` v1: preserve factual prices, capacities, and the
  existing successful booking path; the fix changes presentation only.

## Changed files
- [app.js](./app.js): `card()` always renders `total(room)` with the
  "total for your meeting" label and the fee-breakdown line; `details()`
  always passes `withPrice=true` to `summary()`; removed the two
  purpose-clearing guards in `go()` and `render()`.
- [FIX_PLAN.json](./FIX_PLAN.json): acceptance contract for this fix.

## Checks performed
- Read [app.js](./app.js) and [index.html](./index.html) and re-read the edited
  regions to confirm the edits match the recorded $280/$245 fixture math.
- No tests were run and no browser retest was performed in this session (shell
  execution is disabled for this task). Browser retesting and review happen
  separately after this handoff, so treat the behavior above as
  code-inspection verified only.

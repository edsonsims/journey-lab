# Improvement — Confirm reservation is keyboard-reachable

## Changed behavior
- On the Review page, **Confirm reservation** is now a native `<button type="button">` in the sequential Tab order. It receives visible focus after **Edit meeting name** (and in reverse with Shift+Tab) and activates with **Enter** and **Space**, completing the booking to the confirmation view.
- Before, it was a `<span class="primary" … role="button" tabindex="-1">`: `tabindex="-1"` removed it from the Tab order, and a span never fires `click` on Enter/Space, matching the observed finding (Tab cycled past it, Enter left the page unchanged, Space scrolled).

## Rationale (source-linked)
- `finding-210d2e86-9bd6-4376-8cda-e94c8d60a42c-0`: Tab moved from Edit meeting name to an unfocused step and wrapped to the logo; Shift+Tab returned to Edit meeting name; Enter/Space did not confirm.
- Charter `gather-keyboard-booking` v3 + persona `gather-keyboard`: required booking controls should receive keyboard focus and activate with standard keys; keyboard-only completion is the success criterion.
- `DEMO_FIXTURE.md` confirms the span was the deliberately seeded defect.

## Changed files
- [app.js](app.js): `review()` — replaced the Confirm reservation `span` (`role="button" tabindex="-1"`) with `<button type="button" class="primary" id="confirm-reservation" data-action="confirm">`. Same id, class, and `data-action="confirm"`, so the existing `bind()` click handler and `confirmReservation()` flow (including the `button.disabled` guard, previously a no-op on a span) work unchanged. No styling changes needed: `styles.css` already styles `.primary` and `button:focus-visible`.

## Checks performed
- Read `app.js`, `index.html`, `styles.css`, and `DEMO_FIXTURE.md`; located the single `tabindex` occurrence (line 56) and confirmed no other `role="button"` spans remain.
- Verified by inspection that the new button keeps the same `data-action` click path and gains native Tab focus, focus-visible outline, and Enter/Space activation.
- No tests were run (shell execution is disabled in this session; browser retesting happens separately).

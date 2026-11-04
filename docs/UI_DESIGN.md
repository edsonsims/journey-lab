# Journey Lab workspace design

The workspace is a compact desktop review tool with responsive mobile review. A single dark header holds four horizontal sections; each page shows only the active section's submenu. The main workspace is light, with a pearl canvas, white surfaces, deep ink text and a vivid iris primary. This direction replaces the sidebar and all-dark workspace at the user's request. Recordings and evidence images retain their actual colors.

## Navigation

Use `workspace-navigation.ts` as the route-to-section source of truth. The four top-level destinations are Journeys, Insights, Library and Environments. Their children appear inside `.page-content`, not in dropdowns or a persistent sidebar:

- Journeys: All journeys, Findings, Issues, Fixes.
- Insights: Coverage, Experience.
- Library: Charters, Personas, Competitors, Memory, Calibration.
- Environments: All environments, Connections.

Journeys is the user-facing name for the existing Run entity. Its experience tab is labeled Emotional Arc. Keep internal identifiers, recorded content and route keys unchanged. Use existing leaf URLs, including canonical settings URLs for environment configuration and connections. Deep links and history determine the active group and submenu item. Group links open the group's first destination. Keep project selection and connection status in the shared header. Native links support browser navigation, with arrow/Home/End focus navigation, Enter to open and a skip-to-content link. On small screens the four main choices remain visible in their own row, and only the current submenu wraps. Do not bring unrelated tools into the page's navigation.

## Surfaces and typography

Use the tokens in `journey-workspace/src/workspace-theme.css`: canvas `#f5f5f7`, surface `#ffffff`, raised `#f0f1f5`, hover `#ececf6`, primary text `#202131`, secondary text `#626779`, borders `#d9dce5`. The primary action and link color is `#5338e8`, with white text on filled actions and pale iris selected surfaces. The header keeps its own light-on-dark tokens. Body/table text remains 12–13px. Compactness comes primarily from shorter headers, less padding and tighter relationships. Coarse-pointer controls keep larger hit targets.

`workspace-theme.css` follows the existing layout styles; `evidence-theme.css` follows it for specialized evidence and charts. `collection-summary.css` styles the reusable summary. `workspace-navigation.css` follows the component styles and owns the horizontal shell. New components should consume these tokens. Dark surfaces are reserved for navigation and original-media mats; the surrounding players, forms, charts and review panels use the light workspace system.

## Semantic color

Severity/status: critical or failure uses a filled rose pill; high impact or an observed obstacle uses orange; running actions use iris; review uses golden yellow with dark text. Goal reached and routine completion remain readable green tints. Low impact is blue and informational is slate. Reserve the strongest fills for signals requiring attention. A finished run can still have an obstacle outcome. Both labels remain visible and independently colored.

Finding/track types: Broken uses rose, Experience violet, Product cyan, Business amber. Keep the same type colors on timeline labels and finding icons. Emotion has its own labeled scale: Excellent teal, Positive green, Neutral slate, Negative orange, Very negative rose, Unrated hollow/slate. Finding impact is not an emotion score. Preserve the Before dash/square and After solid/circle distinction in comparisons.

## Collection summaries

Place a single compact summary strip next to the collection's filters. Summarize the displayed rows, with “Showing X of Y” when filtered. Prefer count and severity distribution, recorded run time/tokens, review states, rounds, comments or configuration readiness according to the collection. Do not force irrelevant metrics onto every list.

Missing measurements display an em dash or explicit known-record coverage. Explicit zero is distinct from unknown. Run time sums elapsed run durations including model waits; it is not video duration or a claim about time saved. Overlapping runs may contribute overlapping time. Distinct affected runs and finding occurrences are separate quantities. Environment readiness must refer to the current version; an old successful check does not establish readiness after configuration changes.

Aggregation lives in `collection-summary-metrics.ts`, rendering in `CollectionSummary.tsx`. New collection kinds should add meaningful metric tests, particularly missing data and filtered totals.

## Smart table filters

Every implemented table (Journeys, Findings, Issues and Fixes) uses `SmartFilters.tsx`. Keep search, the two most useful facet controls, the full Filters chooser and sorting in one compact toolbar. Quick views sit underneath; removable chips appear only when filters are active. The chooser offers searchable values with contextual match counts. Desktop uses a nonmodal popover; small screens expand the chooser inline. Keyboard users can close with Escape and return to the opening control. Table rows keep their existing density.

The pure engine in `table-filters.ts` combines selections with OR inside a facet and AND across facets. Option counts respect search and other facets while ignoring the facet's own selection. Count each matching row once per value; retain selected zero-count/obsolete values so they can be removed. Unknown is distinct from explicit zero, no findings, or no linked fix. Value labels are sorted naturally; duplicate identity names include a short ID. Both record search and option search fold accents.

`collection-filters.ts` owns domain choices: journey status/outcome/impact/persona/environment/charter/attention/date; finding impact/type/review/journey/persona/environment/fix state/date; issue status/impact/recurrence/history/last-seen; and fix status/comments/rounds/source journey/persona/environment/date. Resolve associations from explicit source records, never comparison candidates or synthetic emotion. Date filters use rolling windows with missing/future timestamps explicit. Sort missing values last in either direction and preserve source order for ties.

Repeated query parameters represent multi-select values. Preserve project routes, existing search/status/attention/sort links, unrelated parameters and the legacy Findings `status` impact alias. Facet/sort/preset changes add browser history; search typing replaces the current entry. Quick views replace facet choices while retaining search and sort. Clear all removes search and facets but retains sorting. Summaries and result counts reflect visible rows; the Journeys attention strip remains explicitly project-wide.

## Journeys attention queue

Lead Journeys with a compact, project-wide attention strip and a single actionable item. Critical findings use rose, fixes awaiting review use gold, and recorded journey blockers use orange. Category controls filter the table; selecting the active category again restores all journeys. The spotlight can cycle through matching items and links directly to the finding, fix, or journey. Keep project-wide queue counts distinct from the filtered table summary.

Default table order is critical findings, fixes awaiting review, recorded blockers, then remaining runs, preserving newest-first chronology within each priority. Offer Newest first explicitly. Keep search, status, attention focus and ordering in the URL. Clearing filters preserves ordering. Row markers and direct finding/fix links replace decorative run numbers without adding another column or another line of row height.

`run-attention.ts` derives attention from source records: explicit `obstacle_observed` or `blocked` outcomes, effective critical findings excluding dismissed/duplicate triage and explicitly resolved linked issues, and fixes with status `awaiting_review`. Runner failures/restrictions and negative emotion alone do not establish a product blocker. Count fixes once globally and associate them only with explicit source runs/findings. Successful candidate retests do not silently resolve source findings; historical blocked journeys remain recorded history.


## Dragging step alignment

The matched-step comparison offers **Drag to align**. Each lane positions observed steps relative to its own original recording duration, with exact source times and the resulting signed offset visible. Dragging either endpoint snaps to an observed step and previews both videos; saving explicitly accepts the manual pair. The relative horizontal position is an editing aid, not evidence that two actions are equivalent. Original recordings and emotion values are never stretched or rewritten.

Use pointer capture for mouse/touch, arrow/Home/End keys for step navigation, and the adjacent-step buttons when points are dense. Escape or pointer cancellation restores the gesture-start pair; Cancel restores the alignment from before opening the editor. Keep the existing one-to-one ordering checks, stale-review handling and per-round/run-pair persistence. A pending save must not seek a different persona after navigation.

Hovering or focusing a drag-lane point previews its captured screen, original timestamp, recorded tone and own persona comment. During a drag, the preview follows the snapped point rather than the marker holding pointer capture. Keep hover inspection separate from selection and video playback. Use the resolved screenshot event; label nearby frames with their actual timestamp. Do not substitute a sibling persona's comment. Missing images/comments remain explicit, and an observation fallback is labeled as an observation. Place the hoverable preview outside both lanes; during dragging it must not intercept pointer events.


## Emotional Arc moment colors

Each Moment by moment row uses its recorded tone across the full background, number badge, tone label, timestamp and replay icon. Excellent is teal, Positive green, Neutral slate, Negative orange and Very negative rose. Keep headings in deep ink and secondary copy darkened from the tone for readable contrast. Unrated moments use a hollow tone marker and dashed row/number borders; unknown is not neutral.

Hover and selected states retain the emotion hue. A stronger border and an outlined number badge mark selection; keyboard focus adds a visible outline and selected rows expose `aria-pressed`. Untimed observations retain their color and explicit missing-timestamp label, but cannot seek. Color never substitutes for the text label, and finding severity does not determine a row's emotion.


## Library authoring

Personas and Charters use the shared smart-filter toolbar with state, usage, date and persona perspective facets. Default to active definitions; a persistent `view=all` route distinguishes a cleared filter from the initial default. Summary counts describe the visible definitions and linked journeys, not invented version-history totals.

Use a full-page, compact editor with grouped fields and a violet Meta proposal panel. Persona identity is violet; charter identity is teal. Primary actions retain iris. Copy can have personality around the task, while labels, policy choices and version state stay precise. Browser drafts are visibly distinct from saved versions. Conflict recovery preserves the draft; archive preserves stored history.

Proposal fields are selectable and individually expandable with current/proposed text. Applying fields changes only the draft. Saving is explicit. History has a field-by-field before/after view and immutable version dates. Green and rose distinguish additions/previous content, accompanied by labels. Used-in-journeys tables retain filters and show the actual pinned version; never infer missing historical versions.

The editor becomes one column on narrow screens, with drafting above the form and comparison rows stacked. Keep visible focus rings, native labeled controls, scoped CSS, and text readable without horizontal page overflow.

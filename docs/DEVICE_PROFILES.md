# Devices and network profiles

Settings contains Devices, Environments, Network profiles and Connections. Devices and network profiles belong to the selected project. Common presets seed each project's catalog; custom configurations can be created, edited as new versions, duplicated, archived and restored. Only unused profiles with no historical references can be permanently deleted.

Personas select several saved devices and exactly one primary device. A typical network profile can be saved with the persona. Journey creation defaults each selected persona to its primary device and allows a device override for each persona, plus an optional network override for the batch. Run creation resolves and freezes each selected device and connection before queueing.

The device badge on a journey opens its retained settings on hover, keyboard focus or click. It is also available in findings, comparisons and experience details. Historical badges never resolve settings from the current catalog. Device dimensions remain available in the advanced device editor and recorded configuration details.

## Execution

The current runner uses Chromium / Chrome. Mobile presets apply viewport and screen size, pixel density, browser identity, mobile layout and touch behavior. An iPhone or iPad preset uses Chromium emulation and is explicitly labeled; it is not Safari or physical-device testing. Screenshots use CSS pixels so model coordinates match the browser viewport at every density.

Network profiles provide unthrottled, fast connection, slow mobile and offline presets. Custom profiles can set latency in milliseconds and upload/download speeds in Mbps; blank speeds mean unlimited. Chromium receives throughput in bytes per second. Throttling affects the target browser rather than the Node process or model requests. The selected settings and actual browser identity are recorded with the run.

Offline starts disconnected. It can observe a first-load failure; it does not validate a previously cached PWA, since the runner uses independent sessions with service workers blocked. Disconnect/reconnect sequences, CPU throttling and additional browser engines are outside this release.

## History and comparisons

The migration creates versioned custom device profiles for existing viewport-only personas, preserving the original viewport, desktop input behavior and pixel density. It adds a new persona version; older persona versions, run records, screenshots and recordings stay intact. A historical narrow viewport is not relabeled as a named phone.

Runs retain device and network IDs, versions, names and full configuration snapshots. Retry and retest paths reuse their source snapshots. Before/after comparison checks include the applied device and network settings; Insights keeps distinct recorded configurations in separate contextual rows. Archived devices remain inspectable but cannot be selected for a new ordinary journey.

## Verification

Run the normal development checks in [Development](DEVELOPMENT.md). Focused coverage includes `device-profiles.test.mjs`, `browser-device.test.mjs`, `recorded-device.test.mjs`, frontend device-context and recorded-conditions tests, plus store, comparison, calibration and retry tests. Browser QA should exercise preset creation (including fractional pixel density), editing, duplication, persona assignments, primary selection, network overrides and hover/focus details.

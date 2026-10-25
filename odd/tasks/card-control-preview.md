# MarketFavs card-control preview

Objective: install a local, visual-only card-control preview and verify it in Marketplace.
Branch: main; delivery: local working tree, manual commits only; checks: npm run check plus live Spotify inspection.

## Specs

- S1: "Vamos a implementar los botones en las cards pero sin funcionalidad todavia, vamos a ver si se aplican."
- S2: "Hay que registrar la extención." / "Cómo aún no está en el marketplace debe ser una instalación local."
- S3: "Luego hay que probar poner los botones en las cards."

Existing confirmed presentation rules: footer placement, hover/keyboard-focus visibility, preserve native actions, catalogue extensions/themes/snippets/apps, exclude manually created snippets. No storage or classification behavior.

## Tasks

- T1 [S1] inline, implemented; RED: three DOM tests failed; GREEN: four tests, types and formatting pass; commit: pending manual user action.
- T2 [S2] inline, completed: local bundle copied, registered and applied; registration restored after startup comparison; deployed/source hashes match; commit: N/A for runtime config.
- T3 [S3] inline runtime inspection plus independent verifier for risks 4/5; source verification passed, live card proof needs user input because Spotify could not be inspected reliably; commit: pending manual user action.

## Log

L1 — User request, verbatim:

> Vamos a implementar los botones en las cards pero sin funcionalidad todavia, vamos a ver si se aplican.
> Hay que registrar la extención.
> Cómo aún no está en el marketplace debe ser una instalación local.
> Luego hay que probar poner los botones en las cards.

L2 — Baseline: 7de7124, clean main. Existing bootstrap was committed manually. No new commit, staging or remote is authorized. Parent PROJECT_CONTEXT.md remains untouched because planning continues in another chat.

L3 — Mapping: Marketplace card metadata and native action placement confirmed in .tools/marketplace/src/components/Card/Card.tsx:513–619; grid data-tab/class confirmed in Grid.tsx:555–590. CodeGraph initialized/queried but found no relevant symbols; bounded source fallback used. Legacy .references/manage-marketplace was not inspected.

L4 — Implementation route: inline after one bounded explorer handoff. Added DOM adapter and CSS with no private React patch. Scans only Marketplace cards, handles later cards/reinjection/tab changes/pagehide, stops own button activation propagation. Snippet controls are limited to the Snippets catalogue tab because Installed cards do not reveal whether snippets were manually created. No Marketplace storage is read.

L5 — Added jsdom 30.1.3 as an exact dev dependency; no runtime dependencies. npm audit returned zero vulnerabilities. npm run check passes all four tests. Independent verifier verify_card_preview is checking source/tests in fresh scratch outside the workspace. Risks: item 4 (observer lifecycle) and item 5 (dependency/local environment).

L6 — Local registration: Spicetify 2.45.3 reports extension root C:/Users/taiel/AppData/Local/spicetify/Extensions and config C:/Users/taiel/AppData/Roaming/spicetify/config-xpui.ini. Existing extensions field was empty; custom_apps was and remains library|marketplace. Copied marketfavs.js and map, added extension, applied successfully; bundle hashes matched. Config backup is C:/Users/taiel/AppData/Local/Temp/marketfavs-local-install-196ef4b0f7404311957568b65c1ae672/config-before-marketfavs.ini. Preserve this backup until runtime diagnosis is resolved.

L7 — Live observation: Spotify first displayed Something went wrong after apply. Computer Use screenshots timed out and pointer input reported geometry unavailable; accessibility inspection works. Opening DevTools by keyboard worked, but console focus/editing could not be established reliably. Temporarily removed only marketfavs.js from extension config and applied again to compare baseline. Latest baseline snapshot showed an empty document surface; startup comparison is still inconclusive. Do not claim runtime compatibility or a cause from this evidence.

L8 — Next: finish baseline startup comparison, restore the requested MarketFavs registration if it does not cause the failure, collect verifier result and perform its required spot check. Preserve incomplete live proof honestly. Native RDD assessment/review for this new candidate has not started; prior bootstrap consent does not authorize a new candidate. Engram writes were previously blocked by host-session resolution and may remain pending.

L9 — Independent verifier completed: fresh npm ci and npm run check passed (four repository tests). Four additional scratch probes passed for keyboard/click inertness, account/network/storage sentinels, pre-body reinjection, pagehide cleanup, metadata replacement/card relocation, and original entry-log preservation against baseline. Parent repeated node --test verification-probes.mjs successfully. No candidate-caused blocker found. Visual placement/visibility/Spotify compatibility remain unverified. No new source commits or staging.

L10 — Baseline comparison remained inconclusive: Spotify without MarketFavs showed an empty accessibility surface. This does not establish a cause for startup failure. Requested registration was restored and spicetify apply succeeded again. Final extensions field is marketfavs.js; custom_apps remains library|marketplace. Installed/repository bundle SHA256 is 415D78D161773B623984FDE6DFDAE65F51F0267FBD9CB33092ED5026C43C5C2C. Keep the pre-install config backup until the live check is resolved.

L11 — Engram task mirror remains pending: native mem_save was blocked because host-session resolution could not be confirmed. Local task notes are authoritative for resumption. Next required input: whether the user can open Spotify/Marketplace and observe the two buttons on card hover/focus. Do not mark S3 passed from DOM-only tests. Complete native RDD assessment after runtime proof is resolved and before declaring the new implementation complete; no consent for this new candidate has been requested yet.

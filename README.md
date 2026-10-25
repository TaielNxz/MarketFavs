# MarketFavs

An independent Spicetify extension that adds favorites and not-interested buttons to Marketplace cards. Classified items appear in their saved section and are hidden from catalogue categories. Installed keeps every item visible. Both lists and their card metadata are saved locally for the verified Spotify account and restored after reload.

## Start developing

Use Node.js 24.15.0 or a newer Node.js 24 release, with npm. Run these commands from this directory on Windows, Linux or macOS:

```sh
npm ci
npm run check
npm run dev
```

`dev` rebuilds on source changes. Stop it with Ctrl+C. It does not reload Spotify or install the extension.

| Command             | Result                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `npm run build`     | Bundle `src/main.ts` into `dist/marketfavs.js` with a source map. |
| `npm run dev`       | Watch source files and rebuild the bundle.                        |
| `npm run typecheck` | Check source using strict TypeScript rules.                       |
| `npm test`          | Build and run bundle and DOM integration tests.                   |
| `npm run format`    | Format project files using Prettier.                              |
| `npm run check`     | Run type checking, formatting checks and the bundle test.         |

The same commands are prepared for all three operating systems. Automated execution has been verified on Windows only. DOM tests use jsdom and do not establish compatibility with a live Spotify session.

## Install locally on Windows

Run these commands from this directory using PowerShell and the installed Spicetify CLI:

```powershell
npm run check
$extensionRoot = (spicetify path -e root).Trim()
Copy-Item -LiteralPath 'dist/marketfavs.js', 'dist/marketfavs.js.map' -Destination $extensionRoot
spicetify config extensions marketfavs.js
spicetify apply
```

The CLI discovers the extension directory for this installation. Registration adds MarketFavs to Spicetify's extensions. Applying may reload Spotify. After editing, rebuild and copy both files again, then run `spicetify -e refresh restart`. `npm run dev` alone only rebuilds the repository output.

Open Marketplace and hover or keyboard-focus a card. Two outlined icon buttons, labeled “Favoritos” and “No me interesa”, appear at its foot. Click one to add the card to its section. Click the active button to clear the classification, or the other button to switch lists. Active buttons use an accent color and expose their pressed state to assistive technology. Enter and Space also activate the buttons without opening the card or triggering installation. Cards loaded later receive the same controls without duplicates.

After a successful save, marking a card hides it from the catalogue. Clear its active button in the saved section to show it again. Switching lists keeps it hidden. **Installed** continues to show all installed items regardless of classification. Hidden cards remain in Marketplace's DOM, preserving native lifecycle and pagination; **Load more** remains available when all loaded cards are classified. Removing the extension restores native visibility; reloading it restores saved classifications and filtering.

This preview supports catalogue extensions, themes, snippets and apps. Installed extensions and themes also receive controls. Snippets in the Installed tab are excluded because their DOM does not distinguish catalogue items from manually created snippets. No stored Marketplace data is read to infer that distinction.

## Saved sections

Marketplace's navigation contains **Favorites** and **Not Interesed**, immediately following the native tabs after **Installed**. Each shows cards marked with its button, or an empty-state message. Cards retain their title, image, subtitle, description and safe outbound link even after the source DOM is replaced while browsing. The same classification controls work in the saved sections. This preview renders presentation snapshots without duplicating native install/remove controls; those actions remain available on the original Marketplace cards.

Both lists group cards vertically in this order: **Extensions → Themes → Snippets → Apps**. Each nonempty group uses Marketplace's `h2.marketplace-card-type-heading` and a native card grid below it. Empty categories are omitted, matching Marketplace's grouped layout. Moving or removing a card updates its group immediately.

Saved cards retain Marketplace's installed class and checkmarked label, including its native installed border. This presentation refreshes when an eligible native card reports a changed installation state, without changing its saved list. When its native card is absent, the snapshot keeps the last observed state. Installation status is read from Marketplace's DOM; saved views still do not provide install/remove actions.

The original **Marketplace header** stays visible above both lists. It remains mounted in its original location, preserving native controls, search text, selected sort and callbacks without recreating or cloning it. Update and settings retain their native actions. **Sort by** also orders saved cards within each type group using Stars, Newest, Oldest, Last updated, Most stale, A–Z and Z–A, following Marketplace's comparators. Search still applies only to the underlying catalogue.

Sorting resolves the native dropdown's displayed selection through its own translated options, since its component value prop can retain the initial selection. Its callbacks remain intact. Stars and repository dates are captured from encountered native card component data and saved as optional metadata. Old entries and snippets without those fields compare equal for the corresponding mode; dates are never guessed from display text. Existing entries gain missing metadata when their native cards are encountered again. Opening saved lists does not fetch the catalogue. Private React data is read through a bounded adapter and may require adjustment after a Marketplace/Spotify update.

Choosing any native category leaves the saved section and shows that category's catalogue. Exactly one visible tab is active. **Back to Marketplace** remains available as an optional return action.

The two controls use native tab styling and are positioned immediately after the last visible native tab. Their DOM list stays separate, preserving the width and item measurements used by Marketplace's More menu. Alignment updates when navigation or window size changes. The adapter coordinates active classes and accessibility state across both lists while preserving native callbacks, including More's mouse-down selection. No Marketplace configuration or saved preferences are written by the adapter.

## Project layout

- `src/main.ts`: browser entry point with cleanup when the preview is reloaded.
- `src/card-preview.ts`: scoped DOM adapter, classification controls, styles and lifecycle cleanup.
- `src/saved-cards.ts`: saved-state interface, presentation snapshots and safe card rendering.
- `src/persistence.ts`: account verification, versioned local storage and failure-safe list updates.
- `src/sorting.ts`: native selection/metadata adapter and saved-card comparators.
- `src/navigation.ts`: saved-list navigation, card grids and catalogue restoration.
- `tests/`: bundle smoke test and DOM integration tests using Node's built-in runner.
- `tsconfig.json`: strict browser-source type checking.
- `package-lock.json`: exact dependency tree for reproducible installs.
- `dist/`: generated bundle and source map, ignored by Git.

TypeScript, esbuild, Prettier and jsdom are development dependencies. There are no runtime dependencies. esbuild produces a single browser IIFE; TypeScript checks types separately. The project uses direct bundling because [Spicetify Creator is deprecated](https://github.com/spicetify/spicetify-creator#warning).

## Local persistence

MarketFavs checks `UserAPI.getUser().username` against `LocalStorageAPI.namespace` before loading saved data and again before writes. Until they match, saved lists remain unavailable and classification controls are disabled. It rechecks on focus, visibility, relevant storage events and once per second. Namespace guards and account generations reject stale queued writes; account switching in live Spotify still needs runtime validation.

Each account has one MarketFavs-owned `window.localStorage` value at `marketfavs:state:${encodeURIComponent(username)}`. Version 2 stores both lists and their presentation metadata in `entries`, plus empty reserved `matches.accepted` and `matches.rejected` arrays. Optional `card.sort` fields contain validated stars, creation date and last-update date. Version 1 documents remain readable without rewriting merely to sort; subsequent successful saves or metadata enrichment write version 2. Older extension versions cannot read version 2 and will block editing rather than discard it. Match decisions, import/export and recovery tools are not implemented. A missing key starts empty without writing a document until a change is made.

Saving completes before memory and UI are updated. On a write failure, the previous classification stays visible and **Retry** repeats the intended change after account verification. A conflicting external edit is reloaded and requires reviewing/retrying the change. Invalid or unsupported stored documents remain untouched, with editing blocked; no automatic reset or migration occurs. Storage read errors are retryable. These guarantees apply to browser storage operations, not physical-disk durability or cross-process transactions.

Saved lists open directly from stored presentation data without loading the entire catalogue. Native Marketplace storage and installations are not modified. Local browser/Spotify storage removal can still remove MarketFavs data; this is local persistence, not cloud synchronization or a portable backup.

## Scope and next work

The planning context lives in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), outside this repository. Native actions within saved sections, saved-list search, durable manifest identity, import/export and explicit recovery flows remain future work.

The DOM adapter depends on Marketplace's current private class names and structure; it does not patch Marketplace or Spotify's React components. Item identity still combines card type, outbound link, title and subtitle; identical presentations share a classification, and metadata changes can prevent a match. This is not an authoritative manifest identifier and no uncertain match is transferred automatically. Account identity is used internally for storage isolation; no catalogue crawl or publication is performed.

Review and commit changes manually. A publication manifest and license can be added when distribution is scoped.

For additional installation details, consult the [official extension documentation](https://spicetify.app/docs/development/extensions). Building alone does not enable the bundle in Spotify.

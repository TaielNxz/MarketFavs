# MarketFavs

An independent Spicetify extension that adds favorites and not-interested buttons to Marketplace cards. Classified items appear in their saved section and are hidden from catalogue categories. Installed keeps every item visible. Lists reset when Spotify or the extension reloads; persistent storage is not implemented yet.

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

Marking a card hides it from the catalogue immediately. Clear its active button in the saved section to show it again. Switching lists keeps it hidden. **Installed** continues to show all installed items regardless of classification. Hidden cards remain in Marketplace's DOM, preserving native lifecycle and pagination; **Load more** remains available when all loaded cards are classified. Leaving or reloading the extension restores visibility.

This preview supports catalogue extensions, themes, snippets and apps. Installed extensions and themes also receive controls. Snippets in the Installed tab are excluded because their DOM does not distinguish catalogue items from manually created snippets. No stored Marketplace data is read to infer that distinction.

## Saved sections

Marketplace's navigation contains **Favorites** and **Not Interesed**, immediately following the native tabs after **Installed**. Each shows cards marked with its button, or an empty-state message. Cards retain their title, image, subtitle, description and safe outbound link even after the source DOM is replaced while browsing. The same classification controls work in the saved sections. This preview renders presentation snapshots without duplicating native install/remove controls; those actions remain available on the original Marketplace cards.

Both lists group cards vertically in this order: **Extensions → Themes → Snippets → Apps**. Each nonempty group uses Marketplace's `h2.marketplace-card-type-heading` and a native card grid below it. Empty categories are omitted, matching Marketplace's grouped layout. Moving or removing a card updates its group immediately.

The original **Marketplace header** stays visible above both lists. It remains mounted in its original location, preserving native controls, search text, selected sort and callbacks without recreating or cloning it. Update and settings retain their native actions. Search and sorting still operate on Marketplace's underlying catalogue; filtering and ordering saved snapshots through those controls are not implemented yet.

Choosing any native category leaves the saved section and shows that category's catalogue. Exactly one visible tab is active. **Back to Marketplace** remains available as an optional return action.

The two controls use native tab styling and are positioned immediately after the last visible native tab. Their DOM list stays separate, preserving the width and item measurements used by Marketplace's More menu. Alignment updates when navigation or window size changes. The adapter coordinates active classes and accessibility state across both lists while preserving native callbacks, including More's mouse-down selection. No Marketplace configuration or saved preferences are written by the adapter.

## Project layout

- `src/main.ts`: browser entry point with cleanup when the preview is reloaded.
- `src/card-preview.ts`: scoped DOM adapter, classification controls, styles and lifecycle cleanup.
- `src/saved-cards.ts`: shared session state, presentation snapshots and safe card rendering.
- `src/navigation.ts`: saved-list navigation, card grids and catalogue restoration.
- `tests/`: bundle smoke test and DOM integration tests using Node's built-in runner.
- `tsconfig.json`: strict browser-source type checking.
- `package-lock.json`: exact dependency tree for reproducible installs.
- `dist/`: generated bundle and source map, ignored by Git.

TypeScript, esbuild, Prettier and jsdom are development dependencies. There are no runtime dependencies. esbuild produces a single browser IIFE; TypeScript checks types separately. The project uses direct bundling because [Spicetify Creator is deprecated](https://github.com/spicetify/spicetify-creator#warning).

## Scope and next work

The planning context lives in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), outside this repository. The current implementation adds session-only classification and saved-card previews. Persistent account storage, native actions within saved sections, Marketplace ordering and durable item identity remain future integration work.

The DOM adapter depends on Marketplace's current private class names and structure; it does not patch Marketplace or Spotify's React components. The session key combines card type, outbound link, title and subtitle; identical presentations share a classification, but this is not an authoritative manifest identifier. Storage schema and recovery details remain open in planning. The preview does not access account data, save preferences, fetch a catalogue or publish anything.

Review and commit changes manually. A publication manifest and license can be added when distribution is scoped.

For additional installation details, consult the [official extension documentation](https://spicetify.app/docs/development/extensions). Building alone does not enable the bundle in Spotify.

# MarketFavs

An independent Spicetify extension with a visual preview of favorites and not-interested buttons on Marketplace cards. The buttons have no classification, storage or installation actions yet.

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

The CLI discovers the extension directory for this installation. Registration adds MarketFavs to Spicetify's extensions. Applying may reload Spotify. After editing, rebuild and copy both files again, then run `spicetify -e refresh`. `npm run dev` alone only rebuilds the repository output.

Open Marketplace and hover or keyboard-focus a card. Two outlined icon buttons, labeled “Favoritos” and “No me interesa”, appear at its foot. Clicking or activating them does nothing and does not open the card or activate its native install action. Cards loaded later receive the same controls without duplicates.

This preview supports catalogue extensions, themes, snippets and apps. Installed extensions and themes also receive controls. Snippets in the Installed tab are excluded because their DOM does not distinguish catalogue items from manually created snippets. No stored Marketplace data is read to infer that distinction.

## Saved-list navigation preview

Marketplace's navigation also contains **Favorites** and **Not Interesed**, immediately following the native tabs after **Installed**. Both open empty sections; the card buttons remain inert and do not populate these views yet. Choosing any native category leaves the saved section and shows that category's catalogue. Exactly one visible tab is active. **Back to Marketplace** remains available as an optional return action.

The two controls use native tab styling and are positioned immediately after the last visible native tab. Their DOM list stays separate, preserving the width and item measurements used by Marketplace's More menu. Alignment updates when navigation or window size changes. The adapter coordinates active classes and accessibility state across both lists while preserving native callbacks, including More's mouse-down selection. Saved-section selection exists only in memory; no Marketplace configuration or saved preferences are written by the adapter.

## Project layout

- `src/main.ts`: browser entry point with cleanup when the preview is reloaded.
- `src/card-preview.ts`: scoped DOM adapter, inert controls, styles and lifecycle cleanup.
- `src/navigation.ts`: saved-list navigation, empty sections and catalogue restoration.
- `tests/`: bundle smoke test and DOM integration tests using Node's built-in runner.
- `tsconfig.json`: strict browser-source type checking.
- `package-lock.json`: exact dependency tree for reproducible installs.
- `dist/`: generated bundle and source map, ignored by Git.

TypeScript, esbuild, Prettier and jsdom are development dependencies. There are no runtime dependencies. esbuild produces a single browser IIFE; TypeScript checks types separately. The project uses direct bundling because [Spicetify Creator is deprecated](https://github.com/spicetify/spicetify-creator#warning).

## Scope and next work

The planning context lives in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), outside this repository. The current implementation scope is local installation, visual-only card controls and empty saved-list sections. Classification and persistence remain separate work.

The DOM adapter depends on Marketplace's current private class names and structure; it does not patch Marketplace or Spotify's React components. Future compatibility, item identity and Spicetify API typings require further validation. Storage schema and recovery details remain open in planning. The preview does not access account data, save preferences, fetch a catalogue or publish anything.

Review and commit changes manually. A publication manifest and license can be added when distribution is scoped.

For additional installation details, consult the [official extension documentation](https://spicetify.app/docs/development/extensions). Building alone does not enable the bundle in Spotify.

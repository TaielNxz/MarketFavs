# MarketFavs

Development foundation for an independent Spicetify extension that will add favorites and not-interested lists to Marketplace. This bootstrap provides tooling and an entry point that logs its loading; product features remain under planning.

## Start developing

Use Node.js 24.15.0 or a newer Node.js 24 release, with npm. Run these commands from this directory on Windows, Linux or macOS:

```sh
npm ci
npm run check
npm run dev
```

`dev` rebuilds on source changes. Stop it with Ctrl+C. It does not reload Spotify or install the extension.

| Command             | Result                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `npm run build`     | Bundle `src/main.ts` into `dist/marketfavs.js` with a source map.                            |
| `npm run dev`       | Watch source files and rebuild the bundle.                                                   |
| `npm run typecheck` | Check source using strict TypeScript rules.                                                  |
| `npm test`          | Build and check that the generated script runs without a module loader and has a source map. |
| `npm run format`    | Format project files using Prettier.                                                         |
| `npm run check`     | Run type checking, formatting checks and the bundle test.                                    |

The same commands are prepared for all three operating systems. Execution has been verified on Windows only; the bundle test uses Node's isolated JavaScript context, not a live Spotify session.

## Project layout

- `src/main.ts`: browser entry point; currently logs scaffold loading only.
- `tests/bundle.test.mjs`: build-output smoke test using Node's built-in runner.
- `tsconfig.json`: strict browser-source type checking.
- `package-lock.json`: exact dependency tree for reproducible installs.
- `dist/`: generated bundle and source map, ignored by Git.

TypeScript, esbuild and Prettier are development dependencies. There are no runtime dependencies. esbuild produces a single browser IIFE; TypeScript checks types separately. The project uses direct bundling because [Spicetify Creator is deprecated](https://github.com/spicetify/spicetify-creator#warning).

## Scope and next work

The planning context lives in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), outside this repository. Its earlier planning-only authorization is historical: the current request authorizes this bootstrap, Git initialization and dependency installation, with no commits. Feature implementation remains a separate step.

Marketplace integration, item identity, Spicetify API typings and runtime compatibility still require validation before their implementation. Storage schema and recovery details remain open in planning. This scaffold does not access account data, save preferences, inject UI, install into Spotify, or publish anything.

Git is initialized locally on `main`. No remote, staging or commit is created by this setup. Review the files before making the first commit manually. A publication manifest and license can be added when distribution is scoped.

For future manual installation, consult the [official extension documentation](https://spicetify.app/docs/development/extensions). Building alone does not enable the bundle in Spotify.

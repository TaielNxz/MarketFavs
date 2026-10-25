# Native sorting for saved lists

Branch: development; baseline: cceccfc. Delivery: manual commit; no staging, commits or publication by the agent.
Route: inline implementation, independent verification of backward-compatible stored metadata. Runner: npm run check. Risk: item 1 (persisted format extension).

## Specs

- S1: “Ahora que el filtro Sort By presente en el lado izquierdo del header también funcione en 'Favorites' y 'Not Interesed', de la misma forma que funciona en Extensions, Themes, Snippets y Apps.” Reuse the native dropdown and seven native sort keys/comparators without replacing native callbacks.
- S2: Preserve the established Extensions → Themes → Snippets → Apps group order. Sort cards within each group; missing date/star metadata compares equal like native Marketplace.
- S3: Preserve existing saved lists. Read version 1 unchanged; write version 2 with optional validated sorting metadata on subsequent successful saves. Never infer dates or fetch the catalogue just to open a saved view.
- S4: Native header replacements, metadata updates and saved-list changes must update ordering. Do not mutate saved classifications, native settings or callbacks merely to sort cards.
- Assumption: old entries without sorting metadata retain native missing-data behavior until their source cards are encountered again. React metadata access is read-only and bounded; unavailable internals must fail safely.

## Tasks

- T1 | S1–S3 | inline | complete | live dropdown selection fixed; persistence compatibility remains verified; commit: manual/pending
- T2 | S1–S4 | inline | complete | stale-prop regression and runtime verification passed; commit: manual/pending
- T3 | S1–S4 | independent verifier for item 1 | complete | storage compatibility and native-control verification; commit: manual/pending

## Log

- L1: User request: “Ahora que el filtro Sort By presente en el lado izquierdo del header también funcione en 'Favorites' y 'Not Interesed', de la misma forma que funciona en Extensions, Themes, Snippets y Apps.” Supplied header markup selects “Oldest”.
- L2: Native Utils.ts:697–761 defines localeCompare names, descending stars, created dates and lastUpdated dates, with equal comparison when dates are missing. Native Card.props.item holds stars/created/lastUpdated; saved snapshots currently omit them. The retained header and React dropdown keep the native selection.
- L3: The previous persistence review remains stopped at the user's choice. This is a new feature against cceccfc; do not resume or alter that review lineage.
- L4: Supplied markup, verbatim:

```html
<div class="marketplace-header__left">
  <h2 class="marketplace-header__label">Sort by:</h2>
  <div class="marketplace-sortBox">
    <div class="marketplace-sortBox-header">
      <div class="marketplace-sortBox-header-title"></div>
      <div class="Dropdown-root">
        <div class="Dropdown-control" aria-haspopup="listbox">
          <div class="Dropdown-placeholder is-selected">Oldest</div>
          <div class="Dropdown-arrow-wrapper">
            <span class="Dropdown-arrow"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- L5: Observed RED: Stars kept insertion order. Added bounded read-only native React props access, all seven native comparators and character-data observation for native placeholder updates. Each type group is sorted on its own; right-side scheme dropdown is ignored. Sorting does not write saved classifications or call native callbacks itself. Metadata enrichment uses the existing guarded automatic-save path.
- L6: Optional validated metadata is written in version 2; version 1 remains readable unchanged. Tests cover both lists/all modes, translated labels, mouse-down/click, source-free reload, v1 enrichment without lost entries, invalid metadata protection, live metadata changes and header replacement/current instance props. Full npm run check passes 33/33, formatting/typecheck pass. Independent compatibility verification pending.
- L7: Independent verification passed S1–S4 with no reproducible blocker: full check 33/33, four additional public-bundle probes passed, baseline v1 byte/hash comparison unchanged, write-failure/Retry preserves both lists, nine invalid metadata shapes rejected intact, and unavailable/cyclic/stale React adapters fail safely. Parent repeated all four probes. Live Spotify integration remains unverified. Native review assessed high for persisted format item 1; candidate review/installation pending.
- L8: User granted this candidate's native review. All four lenses returned no findings; exact acknowledgement closed review-6848a4e9ad5ca9b9 for target `sha256:7c9f23f2470df4cb00f59099ade1361d7b4d2d9bfcb910f9f56f07b1785de190`. Reviewed tree `65228ab46f8ca958853ec34d26ca80c394aab241` matched all 26 current files before installation. Copied JS/map, verified matching bundle SHA-256 `FB483783CE309FB6262DEA67E386BF3870EE05160EA0AB29464778231C304A0E`, then `spicetify -e refresh restart` succeeded. No staging or commits. This completion log is a passive post-review documentation update; application code/tests remain the reviewed bytes. Previous persistence review remains stopped.
- L9: Suggested manual commit: `feat(sorting): support native sorting in saved lists`. Runtime checks used mocked native React fixtures; visual confirmation in Spotify remains manual. Missing metadata continues to compare equal until a source card is encountered.
- L10: User report, verbatim: “El sort funciona en las otras secciones, pero no ordena las de 'Favorites' y 'Not Interesed'”. Reopened only selection/integration work; existing storage compatibility proof remains valid.
- L11: Reproduced in installed Spotify with a temporary application test harness: visible native placeholder changed to A-Z, Z-A and Newest while Dropdown component props.value remained oldest; all eight Favorites retained oldest order. Actual Favorites have all three metadata fields, ruling out missing metadata for this failure. Restored the original sort criterion. Deterministic regression with translated native labels and stale props fails before the fix. Temporary instrumentation must be removed before delivery. Fix scope: read live visible selection through native options, with unchanged metadata/persistence/comparators. Risk: none.
- L12: Fixed selection by matching the displayed label against the native dropdown's translated options before falling back to its value prop. RED → GREEN regression covers both lists, all seven modes, stable native callback counts and unchanged saved storage; full npm run check passes 34/34. Real Spotify verification on eight existing Favorites passes Stars, A-Z, Z-A, Oldest, Newest, Last Updated and Most Stale while component props remain oldest. The saved tab stays visible, classifications are unchanged and the original criterion is restored. Not Interesed is empty in this account, so its populated behavior is covered by deterministic tests. Native assessment: medium, review_due false, under_budget; no new review transaction required. Suggested manual correction commit: `fix(sorting): follow live Marketplace sort selection`.
- L13: Removed all temporary runtime instrumentation and scratch probe/backup files. Installed clean JS/map and refreshed/restarted Spicetify. Source, extension and loaded JS hashes match `CB625D20441776212D7DFEEE74D377D935CAF89B74E739EEE4D948EECC25CEF5`. No staging or commits. Spicetify's incidental update lookup hit GitHub's rate limit; extension refresh and hash verification succeeded.

# Persistent saved lists

Branch: development. Delivery: manual commit by the user; no staging, commit or publication by the agent.
Route: inline implementation; account-bound storage and asynchronous checks require independent verification. Runner: npm run check.

## Specs

- S1: “Ahora implementamos la persistencia de las listas.” Restore both lists and card presentation after reload; preserve grouping, classification and catalogue filtering.
- S2: Existing planning C40/C41/C56: keep accounts separate; require a nonempty UserAPI username matching LocalStorageAPI.namespace before reading or editing saved state; otherwise show waiting state.
- S3: Existing planning C20/C57/C58: use a MarketFavs-owned window.localStorage key per account and one versioned JSON value. Commit memory/UI only after a successful write; failed writes retain the prior state and expose Retry.
- S4: Existing planning C59: reject corrupt or unsupported existing data without modifying its original bytes; block editing. Recovery/import/export are separate work.
- S5: Preserve native Marketplace actions and existing installed presentation. Detect namespace changes, recheck identity before writes and reject stale work after account changes or disposal.
- Assumption: an absent account key is first use and starts empty without writing until a change is made. Version 1 uses the existing presentation-based item identity; robust manifest identity remains separate.

## Tasks

- T1 | S1–S4 | inline | complete | versioned storage and account gate; commit: manual/pending
- T2 | S1–S5 | inline | complete | store lifecycle, waiting/error/retry UI and documentation; commit: manual/pending
- T3 | S1–S5 | inline + independent verifier for risk items 2/4 | pending | deterministic tests, account/race/failure checks and local installation; commit: manual/pending

## Log

- L1: User request: “Ahora implementamos la persistencia de las listas.”
- L2: Clean baseline 88ec774. Planning selects direct localStorage, one document per verified account and fail-closed handling of unknown account/corrupt data. Local getUser source is asynchronous; no documented account-change event was identified. Use namespace guards, identity checks before writes and periodic/focus/storage revalidation; real account-switch behavior still requires live validation.
- L3: Risk: items 2/4 (account isolation and stale asynchronous work). No automatic resets, migrations, import/export, account logging or writes to Marketplace-owned keys.
- L4: Implemented `marketfavs:state:${encodeURIComponent(username)}`, version 1 with entries and empty reserved match-decision arrays. Missing key starts empty; corrupt/unsupported state is preserved and blocked. Async username/namespace verification precedes reads/writes; memory commits follow setItem. Retry replays an intended change only for its verified account. Account generations invalidate stale queues, including A→B→A; disposal cancels writes. Focus/visibility/storage/poll revalidation is implemented; live switching remains unverified.
- L5: Observed RED (no persisted document). Focused persistence tests and full `npm run check` pass 25/25, including reload without catalogue cards, write failure/retry, corrupt/unsupported data, unknown/mismatched accounts, stale/disposed writes, A→B→A, external edits and invalid records. Existing tests now wait for account verification and durable writes; reinjection restores previous lists instead of clearing them. Independent verification pending.
- L6: Independent verification found three change-caused blockers: array-valued classification accepted by coercion; automatic observer-driven metadata retries after quota failure; obsolete conflict reload recreating Retry after account roundtrip. One correction batch added strict enum typing, retry gating for automatic updates and a post-reload generation guard, with repository regression tests prepared for the user's manual commit. Full `npm run check` now passes 27/27; scoped independent recheck and parent repeat pass all three probes with rejected-state hashes unchanged. Functional verification complete; native high-risk review and local installation pending. Live account switching remains unverified.

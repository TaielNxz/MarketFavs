import type { SavedCard, SavedList } from "./saved-cards";

type RecordEntry = { card: SavedCard; list: SavedList };
type Platform = {
  UserAPI?: { getUser(): Promise<{ username?: unknown } | null> };
  LocalStorageAPI?: { namespace?: unknown };
};
const waiting = "Waiting for the active Spotify account.";
const damaged =
  "Saved lists are damaged or incompatible. Original data was preserved; editing is blocked.";
const stringFields = [
  "key",
  "type",
  "title",
  "subtitle",
  "description",
  "image",
  "href",
  "installedLabel",
] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

function decode(raw: string | null): Map<string, RecordEntry> {
  if (raw === null) return new Map();
  const value: unknown = JSON.parse(raw);
  if (
    !object(value) ||
    !exact(value, ["version", "entries", "matches"]) ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    !object(value.matches) ||
    !exact(value.matches, ["accepted", "rejected"]) ||
    !Array.isArray(value.matches.accepted) ||
    !Array.isArray(value.matches.rejected) ||
    value.matches.accepted.length ||
    value.matches.rejected.length
  )
    throw new Error(damaged);
  const records = new Map<string, RecordEntry>();
  for (const entry of value.entries) {
    if (
      !object(entry) ||
      !exact(entry, ["card", "list"]) ||
      typeof entry.list !== "string" ||
      !["favorites", "not-interested"].includes(entry.list) ||
      !object(entry.card) ||
      !exact(entry.card, [...stringFields, "installed"])
    )
      throw new Error(damaged);
    const card = entry.card;
    if (
      !stringFields.every((key) => typeof card[key] === "string") ||
      typeof card.installed !== "boolean" ||
      !card.key ||
      !card.title ||
      !["extension", "theme", "snippet", "app"].includes(String(card.type))
    )
      throw new Error(damaged);
    for (const field of ["href", "image"]) {
      if (
        card[field] &&
        !["http:", "https:"].includes(new URL(String(card[field])).protocol)
      )
        throw new Error(damaged);
    }
    const record = entry as unknown as RecordEntry;
    if (records.has(record.card.key)) throw new Error(damaged);
    records.set(record.card.key, record);
  }
  return records;
}

export function createPersistentLists(view: Window) {
  let records = new Map<string, RecordEntry>();
  let account: string | undefined;
  let lastRaw: string | null = null;
  let disposed = false;
  let revision = 0;
  let epoch = 0;
  let queue = Promise.resolve();
  let retryAction: (() => void) | undefined;
  let pendingReload: number | undefined;
  let pendingNamespace: string | undefined;
  let retainedRetry:
    | { owner: string; raw: string | null; action: () => void; message: string }
    | undefined;
  let state = { ready: false, message: waiting, retryable: false };
  const listeners = new Set<() => void>();
  const platform = () =>
    (view as Window & { Spicetify?: { Platform?: Platform } }).Spicetify
      ?.Platform;
  function namespace(): string | undefined {
    try {
      const value = platform()?.LocalStorageAPI?.namespace;
      return typeof value === "string" && value.trim().length > 0
        ? value
        : undefined;
    } catch {
      return;
    }
  }
  const key = (name: string) => `marketfavs:state:${encodeURIComponent(name)}`;
  const accessible = () =>
    !disposed &&
    state.ready &&
    account !== undefined &&
    namespace() === account;
  const notify = () => {
    if (!disposed) for (const listener of listeners) listener();
  };
  async function identify() {
    try {
      const before = namespace();
      if (!before) return;
      const user = await platform()?.UserAPI?.getUser();
      return user?.username === before && namespace() === before
        ? before
        : undefined;
    } catch {
      return;
    }
  }
  function block(message: string, retryable: boolean) {
    const changed =
      state.ready || state.message !== message || records.size > 0;
    records = new Map();
    state = { ready: false, message, retryable };
    if (changed) notify();
  }
  function invalidate() {
    epoch++;
    queue = Promise.resolve();
    account = undefined;
    retryAction = undefined;
    block(waiting, false);
  }
  async function reload(hide = false) {
    const observed = namespace();
    if (!hide && pendingReload !== undefined && pendingNamespace === observed)
      return;
    const request = ++revision;
    pendingReload = request;
    pendingNamespace = observed;
    if (
      hide &&
      account &&
      observed === account &&
      state.ready &&
      state.retryable &&
      retryAction
    )
      retainedRetry = {
        owner: account,
        raw: lastRaw,
        action: retryAction,
        message: state.message,
      };
    if (retainedRetry && retainedRetry.owner !== observed)
      retainedRetry = undefined;
    if (hide || (account && namespace() !== account)) {
      invalidate();
    }
    const identified = await identify();
    if (pendingReload === request) pendingReload = undefined;
    if (disposed || request !== revision) return;
    if (!identified) {
      retainedRetry = undefined;
      invalidate();
      return;
    }
    try {
      const raw = view.localStorage.getItem(key(identified));
      if (
        retainedRetry &&
        (retainedRetry.owner !== identified || retainedRetry.raw !== raw)
      )
        retainedRetry = undefined;
      if (identified === account && raw === lastRaw && state.ready) return;
      if (account && raw !== lastRaw) {
        epoch++;
        queue = Promise.resolve();
      }
      let loaded: Map<string, RecordEntry>;
      try {
        loaded = decode(raw);
      } catch {
        account = identified;
        block(damaged, true);
        retryAction = () => {
          void reload(true);
        };
        return;
      }
      account = identified;
      lastRaw = raw;
      records = loaded;
      retryAction = retainedRetry?.action;
      state = {
        ready: true,
        message: retainedRetry?.message ?? "",
        retryable: retainedRetry !== undefined,
      };
      retainedRetry = undefined;
      notify();
    } catch {
      retainedRetry = undefined;
      account = identified;
      retryAction = () => {
        void reload(true);
      };
      block(
        "Cannot read saved lists. Your data was preserved. Retry when storage is available.",
        true,
      );
    }
  }
  type Mutation = (
    current: Map<string, RecordEntry>,
  ) => Map<string, RecordEntry> | undefined;
  function enqueue(expected: string, mutate: Mutation, automatic = false) {
    const started = epoch;
    queue = queue.then(async () => {
      if (
        started !== epoch ||
        (automatic && state.retryable) ||
        !accessible() ||
        account !== expected ||
        !mutate(records)
      )
        return;
      const identified = await identify();
      if (disposed || started !== epoch) return;
      if (identified !== expected || account !== expected || !accessible()) {
        if (account === expected || namespace() !== account) void reload(true);
        return;
      }
      try {
        const currentRaw = view.localStorage.getItem(key(expected));
        if (currentRaw !== lastRaw) {
          const recovery = reload(true);
          const recoveryEpoch = epoch;
          await recovery;
          if (
            disposed ||
            epoch !== recoveryEpoch ||
            account !== expected ||
            !accessible()
          )
            return;
          retryAction = () => enqueue(expected, mutate);
          state = {
            ready: true,
            message:
              "Saved lists changed in another window. Review the lists and Retry your change.",
            retryable: true,
          };
          notify();
          return;
        }
        const next = mutate(records);
        if (!next) return;
        const raw = JSON.stringify({
          version: 1,
          entries: [...next.values()],
          matches: { accepted: [], rejected: [] },
        });
        // No asynchronous work between the final account guard, write and memory commit.
        if (!accessible() || account !== expected) return;
        view.localStorage.setItem(key(expected), raw);
        records = next;
        lastRaw = raw;
        state = { ready: true, message: "", retryable: false };
        retryAction = undefined;
        notify();
      } catch {
        if (disposed || account !== expected || !accessible()) return;
        retryAction = () => enqueue(expected, mutate);
        state = {
          ready: true,
          message:
            "Could not save the change. Previous lists were preserved. Retry when storage is available.",
          retryable: true,
        };
        notify();
      }
    });
  }
  const onFocus = () => {
    void reload(true);
  };
  const onVisibility = () => {
    if (view.document.visibilityState === "visible") onFocus();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || (account && event.key === key(account)))
      void reload(true);
  };
  function dispose() {
    disposed = true;
    revision++;
    view.clearInterval(timer);
    view.removeEventListener("focus", onFocus);
    view.removeEventListener("storage", onStorage);
    view.removeEventListener("pagehide", dispose);
    view.document.removeEventListener("visibilitychange", onVisibility);
    listeners.clear();
  }
  const timer = view.setInterval(() => {
    void reload();
  }, 1000);
  view.addEventListener("focus", onFocus);
  view.addEventListener("storage", onStorage);
  view.addEventListener("pagehide", dispose, { once: true });
  view.document.addEventListener("visibilitychange", onVisibility);
  void reload();
  return {
    get(key: string) {
      return accessible() ? records.get(key) : undefined;
    },
    items(list: SavedList) {
      return accessible()
        ? [...records.values()]
            .filter((record) => record.list === list)
            .map((record) => record.card)
        : [];
    },
    status() {
      return namespace() === account
        ? state
        : { ready: false, message: waiting, retryable: false };
    },
    toggle(card: SavedCard, list: SavedList) {
      if (!accessible() || !account) {
        void reload(true);
        return;
      }
      enqueue(account, (current) => {
        const next = new Map(current);
        if (next.get(card.key)?.list === list) next.delete(card.key);
        else next.set(card.key, { card, list });
        return next;
      });
    },
    updateInstallation(cards: SavedCard[]) {
      if (!accessible() || !account || state.retryable) return;
      enqueue(
        account,
        (current) => {
          const next = new Map(current);
          let changed = false;
          for (const card of cards) {
            const record = next.get(card.key);
            if (
              !record ||
              (record.card.installed === card.installed &&
                record.card.installedLabel === card.installedLabel)
            )
              continue;
            next.set(card.key, {
              ...record,
              card: {
                ...record.card,
                installed: card.installed,
                installedLabel: card.installedLabel,
              },
            });
            changed = true;
          }
          return changed ? next : undefined;
        },
        true,
      );
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry() {
      retryAction?.();
    },
    dispose,
  };
}

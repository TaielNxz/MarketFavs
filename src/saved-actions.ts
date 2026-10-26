import { resolveActionItem, validateActionItem } from "./action-catalogue";
import { actionIcon } from "./action-icons";
import {
  abortable,
  NativeMarketplace,
  nativeFibers,
  type NativeObject,
} from "./native-marketplace";
import type { SavedCard, SavedCards } from "./saved-cards";

const EVENT = "marketfavs:native-actions-changed";
const LOCKS = Symbol.for("marketfavs.native-actions.locks");
export type SavedActions = ReturnType<typeof createSavedActions>;

export function createSavedActions(view: Window, saved: SavedCards) {
  const runtime = view as unknown as NativeObject;
  const globals = view as unknown as Record<symbol, Map<string, symbol>>;
  const locks = (globals[LOCKS] ??= new Map<string, symbol>());
  const pending = new Map<string, AbortController>();
  const errors = new Map<string, string>();
  const states = new Map<string, boolean>();
  let generation = 0,
    disposed = false;
  const namespace = () => {
    try {
      const value = runtime.Spicetify?.Platform?.LocalStorageAPI?.namespace;
      return typeof value === "string" && value ? value : undefined;
    } catch {
      return;
    }
  };
  const keyOf = (key: string) => `${namespace()}\0saved\0${key}`;
  const announce = () =>
    view.dispatchEvent(new view.document.defaultView!.Event(EVENT));

  function update(button: HTMLButtonElement, item: SavedCard) {
    const installed = states.get(item.key) ?? item.installed;
    const label =
      item.type === "app"
        ? "Open repository"
        : installed
          ? "Remove"
          : "Install";
    if (button.getAttribute("aria-label") !== label) {
      button.setAttribute("aria-label", label);
      button.title = label;
      button.replaceChildren(
        actionIcon(
          view.document,
          item.type === "app" ? "app" : installed ? "remove" : "install",
        ),
      );
    }
    const busy = locks.has(keyOf(item.key));
    button.disabled = !saved.status().ready || busy;
    button.setAttribute("aria-busy", String(busy));
    const metadata = button.closest(".main-card-cardMetadata");
    const notice = metadata?.querySelector<HTMLElement>(
      ".marketfavs-install-status",
    );
    if (notice) {
      notice.textContent = errors.get(item.key) ?? "";
      notice.hidden = !notice.textContent;
    }
    if (states.has(item.key) && item.type !== "app") {
      button
        .closest(".main-card-card")
        ?.classList.toggle("marketplace-card--installed", installed);
      let marker = metadata?.querySelector<HTMLElement>(
        ".marketplace-card__bottom-meta",
      );
      if (!installed) marker?.remove();
      else if (!marker && metadata) {
        marker = view.document.createElement("div");
        marker.className = "marketplace-card__bottom-meta main-type-mestoBold";
        marker.textContent = item.installedLabel || "✓ Installed";
        metadata.insertBefore(marker, button.parentElement);
      }
    }
  }
  function refresh() {
    if (disposed) return;
    for (const button of view.document.querySelectorAll<HTMLButtonElement>(
      "button[data-marketfavs-install]",
    )) {
      const item = saved.get(button.dataset.marketfavsInstall!)?.card;
      if (item) update(button, item);
    }
  }
  function cancelMetadata() {
    generation++;
    for (const controller of pending.values()) controller.abort();
  }
  let contextHeader = view.document.querySelector(".marketplace-header");
  const contextObserver = new view.document.defaultView!.MutationObserver(
    (records) => {
      const header = view.document.querySelector(".marketplace-header");
      const removed =
        contextHeader &&
        records.some((record) =>
          [...record.removedNodes].some(
            (node) => node === contextHeader || node.contains(contextHeader),
          ),
        );
      if (contextHeader && (removed || header !== contextHeader))
        cancelMetadata();
      contextHeader = header;
    },
  );
  contextObserver.observe(view.document.documentElement, {
    childList: true,
    subtree: true,
  });
  const unsubscribe = saved.subscribe(() => {
    if (!saved.status().ready) {
      cancelMetadata();
      errors.clear();
      states.clear();
    } else {
      for (const [key, installed] of states)
        if (saved.get(key)?.card.installed === installed) states.delete(key);
    }
    refresh();
  });
  view.addEventListener(EVENT, refresh);

  function refreshNative(localStorageKey: string) {
    for (const card of view.document.querySelectorAll(
      ".marketplace-grid:not(.marketfavs-saved-grid) .main-card-card",
    )) {
      for (const fiber of nativeFibers(card)) {
        const native = fiber.stateNode;
        if (
          native?.localStorageKey === localStorageKey &&
          typeof native.isInstalled === "function" &&
          typeof native.setState === "function"
        ) {
          native.setState({ installed: native.isInstalled() });
          break;
        }
      }
    }
  }

  async function run(item: SavedCard) {
    const owner = namespace(),
      epoch = generation,
      record = saved.get(item.key),
      header = view.document.querySelector(".marketplace-header");
    const lock = keyOf(item.key),
      token = Symbol();
    if (disposed || !record || !saved.status().ready || locks.has(lock)) return;
    const valid = () =>
      !disposed &&
      generation === epoch &&
      namespace() === owner &&
      saved.status().ready &&
      saved.get(item.key)?.list === record.list &&
      header !== null &&
      view.document.querySelector(".marketplace-header") === header;
    const controller = new view.document.defaultView!.AbortController();
    locks.set(lock, token);
    pending.set(lock, controller);
    errors.delete(item.key);
    announce();
    const timeout = view.setTimeout(() => controller.abort(), 15000);
    let operation: Awaited<ReturnType<NativeMarketplace["mount"]>> | undefined;
    let nativeLock: string | undefined,
      nativeStarted = false;
    try {
      const host = NativeMarketplace.find(view);
      const installed = await abortable(
        host.installedItems(),
        controller.signal,
      );
      if (!valid()) return;
      const data = await resolveActionItem(
        view,
        item,
        installed,
        host.currentItems(),
        controller.signal,
      );
      if (!valid() || controller.signal.aborted) return;
      operation = await host.mount(data, item.type, controller.signal);
      if (!valid()) return;
      view.clearTimeout(timeout);
      const native = operation.instance;
      if (typeof native.localStorageKey !== "string" || !native.localStorageKey)
        throw new Error("Marketplace could not identify this item. Try again.");
      nativeLock = `${owner}\0native\0${native.localStorageKey}`;
      if (locks.has(nativeLock))
        throw new Error("This item is already being updated. Please wait.");
      locks.set(nativeLock, token);
      const displayed = states.get(item.key) ?? item.installed;
      // The click expresses Install or Remove, never an accidental opposite
      // operation when the saved presentation is stale.
      if (item.type === "app" || native.isInstalled() === displayed) {
        if (item.type !== "app" && !displayed) {
          validateActionItem(data, item.type);
          host.assertInstallationAllowed(data);
        }
        nativeStarted = true;
        await native.performButtonAction();
      }
      if (valid() && item.type !== "app") {
        const actual = native.isInstalled();
        if (typeof actual !== "boolean")
          throw new Error(
            "Marketplace returned an unknown installation state.",
          );
        states.set(item.key, actual);
        refreshNative(native.localStorageKey);
        saved.updateInstallation([
          {
            ...item,
            installed: actual,
            installedLabel: actual ? item.installedLabel || "✓ Installed" : "",
          },
        ]);
      }
    } catch (error) {
      if (valid()) {
        errors.set(
          item.key,
          nativeStarted
            ? "Could not update this item. Please try again."
            : controller.signal.aborted
              ? "Loading item data timed out. Please try again."
              : error instanceof Error
                ? error.message
                : "Could not load this item. Please try again.",
        );
        if (nativeStarted) {
          try {
            operation?.instance.handleOperationError?.(error);
          } catch {
            /* The card still exposes its inline error. */
          }
        }
      }
    } finally {
      view.clearTimeout(timeout);
      operation?.dispose();
      pending.delete(lock);
      if (locks.get(lock) === token) locks.delete(lock);
      if (nativeLock && locks.get(nativeLock) === token)
        locks.delete(nativeLock);
      announce();
    }
  }

  function dispose() {
    disposed = true;
    generation++;
    for (const controller of pending.values()) controller.abort();
    contextObserver.disconnect();
    unsubscribe();
    view.removeEventListener(EVENT, refresh);
    view.removeEventListener("pagehide", dispose);
  }
  view.addEventListener("pagehide", dispose, { once: true });
  return {
    installed: (item: SavedCard) => states.get(item.key) ?? item.installed,
    render(item: SavedCard) {
      const fragment = view.document.createDocumentFragment();
      const notice = view.document.createElement("small");
      notice.className = "marketfavs-install-status";
      notice.setAttribute("role", "status");
      notice.textContent = errors.get(item.key) ?? "";
      notice.hidden = !notice.textContent;
      const wrapper = view.document.createElement("div");
      wrapper.className = "main-card-PlayButtonContainer";
      const button = view.document.createElement("button");
      button.type = "button";
      button.className = "marketplace-installButton";
      button.dataset.marketfavsInstall = item.key;
      update(button, item);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = saved.get(item.key)?.card;
        if (current) void run(current);
      });
      wrapper.append(button);
      fragment.append(notice, wrapper);
      return fragment;
    },
    dispose,
  };
}

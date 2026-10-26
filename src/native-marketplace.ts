// Private Marketplace/React shapes are confined to this compatibility boundary.
// Dynamic third-party component shapes are checked before an operation runs.
export type NativeObject = Record<string, any>;
export type NativeItem = NativeObject;
export type CatalogueItem = { type: string; item: NativeItem };
export const object = (value: unknown): value is NativeObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new Error("The action was cancelled. Please try again."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export function* nativeFibers(element: Element): Generator<NativeObject> {
  try {
    const property = Object.getOwnPropertyNames(element).find(
      (name) =>
        name.startsWith("__reactFiber$") ||
        name.startsWith("__reactInternalInstance$"),
    );
    if (!property) return;
    let fiber: unknown = (element as unknown as NativeObject)[property];
    const seen = new Set<object>();
    while (object(fiber) && seen.size < 50 && !seen.has(fiber)) {
      seen.add(fiber);
      yield fiber;
      fiber = fiber.return;
    }
  } catch {
    /* Unsupported private internals must fail closed. */
  }
}

export function nativeInstallation(element: Element): boolean | undefined {
  try {
    for (const fiber of nativeFibers(element)) {
      const instance = fiber.stateNode;
      if (
        typeof instance?.isInstalled === "function" &&
        typeof instance?.performButtonAction === "function"
      ) {
        const installed = instance.isInstalled();
        if (typeof installed === "boolean") return installed;
      }
    }
  } catch {
    /* Fall back to the native DOM's last observed state. */
  }
  return;
}

const categories: Record<string, string> = {
  extension: "Extensions",
  theme: "Themes",
  snippet: "Snippets",
  app: "Apps",
};
const unavailable = () =>
  new Error("Marketplace is not ready. Open a catalogue tab and try again.");

export class NativeMarketplace {
  private constructor(
    private view: Window,
    private grid: NativeObject,
  ) {}

  static find(view: Window): NativeMarketplace {
    const header = view.document.querySelector(".marketplace-header");
    if (header)
      for (const fiber of nativeFibers(header)) {
        const grid = fiber.stateNode;
        if (
          typeof grid?.appendCard === "function" &&
          typeof grid?.loadPage === "function" &&
          object(grid.CONFIG) &&
          object(grid.props?.CONFIG)
        )
          return new NativeMarketplace(view, grid);
      }
    throw unavailable();
  }

  private receiver(activeTab: string): NativeObject {
    const CONFIG = { ...this.grid.CONFIG, activeTab };
    return {
      CONFIG,
      props: { ...this.grid.props, CONFIG },
      state: this.grid.state,
      cardList: [],
      requestPage: 0,
      requestQueue: [0],
      sortConfig: { ...this.grid.sortConfig },
      setState() {},
      isStaleRequest: () => false,
      appendCard: this.grid.appendCard,
      updateColourSchemes:
        this.grid.updateColourSchemes?.bind(this.grid) ?? (() => {}),
      setActiveTheme: this.grid.setActiveTheme?.bind(this.grid) ?? (() => {}),
    };
  }

  private entries(elements: unknown): CatalogueItem[] {
    return Array.isArray(elements)
      ? elements.flatMap((element) =>
          object(element?.props?.item) && typeof element.props.type === "string"
            ? [{ type: element.props.type, item: element.props.item }]
            : [],
        )
      : [];
  }

  currentItems(): CatalogueItem[] {
    return this.entries(this.grid.cardList);
  }

  assertInstallationAllowed(item: NativeItem) {
    if (!item.user || !item.repo) return;
    if (!Array.isArray(this.grid.BLACKLIST))
      throw new Error("Marketplace is still loading. Please try again.");
    const url = `https://github.com/${item.user}/${item.repo}`.toLowerCase();
    // Match the same exact URLs and single-segment glob patterns as Marketplace.
    const blocked = this.grid.BLACKLIST.some((pattern: unknown) => {
      if (typeof pattern !== "string") return true;
      const normalized = pattern.toLowerCase();
      if (!normalized.includes("*")) return url === normalized;
      const expression = normalized
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]+");
      return new RegExp(`^${expression}$`).test(url);
    });
    if (blocked)
      throw new Error(
        "Marketplace excludes this repository. Installation is unavailable; existing installations can still be removed.",
      );
  }

  async installedItems(): Promise<CatalogueItem[]> {
    // The native Installed branch reads its own validated records. All writes
    // to Grid state/cardList land on this isolated receiver, never the live Grid.
    const receiver = this.receiver("Installed");
    await this.grid.loadPage.call(receiver, 0);
    return this.entries(receiver.cardList);
  }

  async mount(item: NativeItem, type: string, signal: AbortSignal) {
    const platform = (this.view as unknown as NativeObject).Spicetify;
    const react = platform?.React,
      dom = platform?.ReactDOM;
    if (
      typeof react?.createElement !== "function" ||
      (!dom?.createRoot && !dom?.render)
    )
      throw unavailable();
    const category = categories[type];
    if (!category || signal.aborted) throw unavailable();
    const receiver = this.receiver(category);
    // appendCard is a native element factory; its HOC exposes the raw Card.
    this.grid.appendCard.call(
      receiver,
      JSON.parse(JSON.stringify(item)),
      type,
      receiver.CONFIG.activeTab,
    );
    let component = receiver.cardList[0]?.type;
    for (let n = 0; n < 5 && component?.WrappedComponent; n++)
      component = component.WrappedComponent;
    if (
      typeof component?.prototype?.performButtonAction !== "function" ||
      typeof component?.prototype?.isInstalled !== "function"
    )
      throw unavailable();
    const Base = component;
    class Operation extends Base {
      // Never run native catalogue auto-update logic merely to prepare an action.
      componentDidMount() {}
      render() {
        return null;
      }
    }
    const host = this.view.document.createElement("div");
    host.hidden = true;
    host.dataset.marketfavsInstaller = "";
    this.view.document.body.append(host);
    const root = dom.createRoot
      ? dom.createRoot(host)
      : {
          render: (element: unknown) => dom.render(element, host),
          unmount: () => dom.unmountComponentAtNode(host),
        };
    let removed = false;
    const dispose = () => {
      if (removed) return;
      removed = true;
      try {
        root.unmount();
      } finally {
        host.remove();
      }
    };
    let mountTimeout: number | undefined;
    try {
      const instance = await abortable(
        new Promise<NativeObject>((resolve, reject) => {
          mountTimeout = this.view.setTimeout(
            () => reject(unavailable()),
            5000,
          );
          const source = receiver.cardList[0].props;
          try {
            root.render(
              react.createElement(Operation, {
                item: source.item,
                type,
                CONFIG: source.CONFIG,
                visual: source.visual,
                activeThemeKey: source.activeThemeKey,
                updateColourSchemes: source.updateColourSchemes,
                updateActiveTheme: source.updateActiveTheme,
                ref: (value: NativeObject | null) => {
                  if (value) resolve(value);
                },
              }),
            );
          } catch (error) {
            reject(error);
          }
        }),
        signal,
      );
      return { instance, dispose };
    } catch (error) {
      dispose();
      throw error;
    } finally {
      this.view.clearTimeout(mountTimeout);
    }
  }
}

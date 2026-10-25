import { renderSavedCard, type SavedCards } from "./saved-cards";

const NAV = ".marketplace-tabBar-nav";
const HEADER = ".marketplace-header";
const NATIVE_LIST = ".marketplace-tabBar-header";
const ACTIVE = "marketplace-tabBar-active";
const entries = [
  { label: "Favorites", list: "favorites", empty: "No favorites yet." },
  {
    label: "Not Interesed",
    list: "not-interested",
    empty: "No items marked as not interested yet.",
  },
] as const;
const cardTypes = [
  { type: "extension", label: "Extensions" },
  { type: "theme", label: "Themes" },
  { type: "snippet", label: "Snippets" },
  { type: "app", label: "Apps" },
] as const;

const styles = `
.marketfavs-navigation-host {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  min-width: 0;
}
.marketfavs-navigation-host > .marketplace-tabBar-header {
  flex: 1 1 0;
  min-width: 48px;
}
.marketfavs-navigation {
  display: flex;
  flex: 0 1 auto;
  gap: 0;
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: auto;
  list-style: none;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
.marketfavs-navigation button {
  border: 0;
  border-radius: 4px;
  padding: 8px 16px;
  font: inherit;
  white-space: nowrap;
  color: var(--spice-text, #fff);
  background: transparent;
  cursor: pointer;
}
.marketfavs-navigation button.marketplace-tabBar-active {
  color: var(--spice-text, #fff);
  background: var(--spice-tab-active, var(--spice-highlight, #282828));
}
.marketfavs-navigation button:focus-visible,
.marketfavs-saved-view button:focus-visible {
  outline: 2px solid var(--spice-text, #fff);
  outline-offset: -2px;
}
section.contentSpacing[data-marketfavs-saved-view] > :not(.marketfavs-saved-view):not(.marketplace-header) {
  display: none !important;
}
.marketfavs-saved-view { padding-block: 24px; }
.marketfavs-saved-view[hidden] { display: none; }
.marketfavs-saved-view > p { margin-block: 16px; color: var(--spice-subtext, #b3b3b3); }
.marketfavs-saved-view > button {
  border: 1px solid var(--spice-button-disabled, #535353);
  border-radius: 20px;
  padding: 8px 16px;
  color: var(--spice-text, #fff);
  background: transparent;
  cursor: pointer;
}
`;

export function mountNavigation(
  document: Document,
  savedCards: SavedCards,
): () => void {
  const view = document.defaultView;
  if (!view) return () => {};
  let selected: (typeof entries)[number] | undefined;
  let nativeTab: string | undefined;
  let pendingMore = false;
  let root: Element | null = null;
  let nav: Element | null = null;
  let observer: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let measuredList: Element | null = null;
  let measuredLast: Element | null = null;
  const originalCurrent = new WeakMap<Element, string | null>();
  const style = document.createElement("style");
  style.id = "marketfavs-navigation-style";
  style.textContent = styles;
  const links = document.createElement("ul");
  links.className = "marketfavs-navigation";
  links.setAttribute("aria-label", "MarketFavs");
  const panel = document.createElement("section");
  panel.className = "marketfavs-saved-view";
  panel.id = "marketfavs-saved-view";
  panel.setAttribute("aria-labelledby", "marketfavs-section-title");
  panel.hidden = true;
  const heading = document.createElement("h2");
  heading.id = "marketfavs-section-title";
  const empty = document.createElement("p");
  const notice = document.createElement("small");
  notice.textContent =
    "Session preview: lists reset when Spotify or the extension reloads.";
  const groups = document.createElement("div");
  groups.className = "marketfavs-saved-groups";
  let rendered: typeof selected;
  function renderCards() {
    rendered = selected;
    const cards = selected ? savedCards.items(selected.list) : [];
    empty.hidden = cards.length > 0;
    const sections = cardTypes.flatMap(({ type, label }) => {
      const items = cards.filter((card) => card.type === type);
      if (items.length === 0) return [];
      const section = document.createElement("div");
      section.className = "marketplace-content marketfavs-saved-group";
      const title = document.createElement("h2");
      title.className = "marketplace-card-type-heading";
      title.textContent = label;
      const grid = document.createElement("div");
      grid.className =
        "marketfavs-saved-grid marketplace-grid main-gridContainer-gridContainer main-gridContainer-fixedWidth";
      grid.append(...items.map((card) => renderSavedCard(document, card)));
      section.append(title, grid);
      return [section];
    });
    groups.replaceChildren(...sections);
  }
  const unsubscribe = savedCards.subscribe(renderCards);
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back to Marketplace";
  back.addEventListener("click", () => {
    selected = undefined;
    sync(nativeTab);
    links.querySelector<HTMLButtonElement>("button")?.focus();
  });
  panel.append(heading, notice, empty, groups, back);
  const controls = entries.map((entry) => {
    const item = document.createElement("li");
    item.className = "marketplace-tabBar-headerItem";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "marketplace-tabBar-headerItemLink";
    const label = document.createElement("span");
    label.className = "main-type-mestoBold";
    label.textContent = entry.label;
    button.append(label);
    button.setAttribute("aria-controls", panel.id);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selected = entry;
      sync();
    });
    item.append(button);
    links.append(item);
    return button;
  });

  function setActive(element: Element, active: boolean) {
    if (element.classList.contains(ACTIVE) !== active)
      element.classList.toggle(ACTIVE, active);
    if (active) {
      if (element.getAttribute("aria-current") !== "page")
        element.setAttribute("aria-current", "page");
    } else if (element.hasAttribute("aria-current")) {
      element.removeAttribute("aria-current");
    }
  }

  function updateNative(parent: Element, restore = false) {
    const native = [
      ...parent.querySelectorAll(
        `${NATIVE_LIST} [data-tab] .marketplace-tabBar-headerItemLink`,
      ),
    ];
    const visible = native.some(
      (link) =>
        link.closest("[data-tab]")?.getAttribute("data-tab") === nativeTab,
    );
    const more = parent.querySelector(`${NATIVE_LIST} .Dropdown-control`);
    for (const link of [...native, ...(more ? [more] : [])]) {
      if (!originalCurrent.has(link))
        originalCurrent.set(link, link.getAttribute("aria-current"));
      const matches =
        link === more
          ? !restore && (pendingMore || (!visible && nativeTab !== undefined))
          : !pendingMore &&
            link.closest("[data-tab]")?.getAttribute("data-tab") === nativeTab;
      setActive(link, (restore || !selected) && matches);
      if (restore) {
        const previous = originalCurrent.get(link);
        if (previous === null || previous === undefined)
          link.removeAttribute("aria-current");
        else link.setAttribute("aria-current", previous);
      }
    }
  }

  function alignTabs() {
    const list = nav?.querySelector(NATIVE_LIST);
    const last = list?.lastElementChild;
    const gap =
      list && last
        ? Math.max(
            0,
            list.getBoundingClientRect().right -
              last.getBoundingClientRect().right,
          )
        : 0;
    const transform = `translateX(${-gap}px)`;
    if (links.style.transform !== transform) links.style.transform = transform;
  }

  function observeLayout() {
    const list = nav?.querySelector(NATIVE_LIST) ?? null;
    const last = list?.lastElementChild ?? null;
    if (resizeObserver && (list !== measuredList || last !== measuredLast)) {
      resizeObserver.disconnect();
      if (list) resizeObserver.observe(list);
      if (last) resizeObserver.observe(last);
      measuredList = list;
      measuredLast = last;
    }
    alignTabs();
  }

  function detach() {
    resizeObserver?.disconnect();
    measuredList = measuredLast = null;
    root?.removeAttribute("data-marketfavs-saved-view");
    if (nav) updateNative(nav, true);
    nav?.classList.remove("marketfavs-navigation-host");
    links.remove();
    panel.remove();
    root = nav = null;
  }

  function sync(preferredNativeTab?: string) {
    const nextNav = document.querySelector(NAV);
    const nextRoot = document
      .querySelector(HEADER)
      ?.closest("section.contentSpacing");
    if (!nextRoot) {
      detach();
      selected = undefined;
      nativeTab = undefined;
      pendingMore = false;
      return;
    }
    if (root !== nextRoot || nav !== nextNav) {
      detach();
      root = nextRoot;
      nav = nextNav;
    }
    const activeTab = nextNav
      ?.querySelector(`${NATIVE_LIST} [data-tab] .${ACTIVE}`)
      ?.closest("[data-tab]")
      ?.getAttribute("data-tab");
    const category =
      preferredNativeTab ??
      activeTab ??
      nextRoot
        .querySelector(".marketplace-grid[data-tab]")
        ?.getAttribute("data-tab");
    if (category && category !== nativeTab) {
      if (nativeTab !== undefined && !pendingMore) selected = undefined;
      nativeTab = category;
      pendingMore = false;
    }
    if (nav && !nav.classList.contains("marketfavs-navigation-host"))
      nav.classList.add("marketfavs-navigation-host");
    if (nav && links.parentElement !== nav) nav.append(links);
    if (panel.parentElement !== root) root.append(panel);
    root.toggleAttribute("data-marketfavs-saved-view", selected !== undefined);
    panel.hidden = selected === undefined;
    if (heading.textContent !== (selected?.label ?? ""))
      heading.textContent = selected?.label ?? "";
    if (empty.textContent !== (selected?.empty ?? ""))
      empty.textContent = selected?.empty ?? "";
    if (rendered !== selected) renderCards();
    controls.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(selected === entries[index]));
      setActive(button, selected === entries[index]);
    });
    if (nav) updateNative(nav);
    observeLayout();
  }

  function onNativeClick(event: MouseEvent) {
    if (!(event.target instanceof view!.Element)) return;
    const list = event.target.closest(NATIVE_LIST);
    if (!list || list.closest(NAV) !== nav) return;
    const item = event.target.closest("[data-tab]");
    if (event.target.closest('.Dropdown-option, [role="option"]')) {
      selected = undefined;
      pendingMore = true;
      sync(nativeTab);
    } else if (event.type === "click" && item) {
      selected = undefined;
      pendingMore = false;
      sync(item.getAttribute("data-tab") ?? undefined);
    }
  }

  function start() {
    (document.head ?? document.documentElement).append(style);
    document.addEventListener("click", onNativeClick, true);
    document.addEventListener("mousedown", onNativeClick, true);
    view!.addEventListener("resize", alignTabs);
    if (typeof view!.ResizeObserver === "function")
      resizeObserver = new view!.ResizeObserver(alignTabs);
    observer = new view!.MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (links.contains(record.target) || panel.contains(record.target))
          return false;
        if (
          record.target instanceof view!.Element &&
          (record.target.closest(NAV) || root?.contains(record.target))
        )
          return true;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof view!.Element &&
            (node.matches(`${NAV}, ${HEADER}`) ||
              node.querySelector(`${NAV}, ${HEADER}`)),
        );
      });
      if (relevant) sync();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current", "data-tab"],
    });
    sync();
  }

  function dispose() {
    unsubscribe();
    observer?.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("click", onNativeClick, true);
    document.removeEventListener("mousedown", onNativeClick, true);
    view?.removeEventListener("resize", alignTabs);
    document.removeEventListener("DOMContentLoaded", start);
    view?.removeEventListener("pagehide", dispose);
    detach();
    style.remove();
  }
  view.addEventListener("pagehide", dispose, { once: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
  return dispose;
}

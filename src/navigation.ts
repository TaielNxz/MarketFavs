const NAV = ".marketplace-tabBar-nav";
const HEADER = ".marketplace-header";
const entries = [
  { label: "Favorites", empty: "No favorites yet." },
  { label: "Not Interesed", empty: "No items marked as not interested yet." },
] as const;

const styles = `
.marketfavs-navigation-host {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.marketfavs-navigation-host > .marketplace-tabBar-header {
  flex: 1 1 0;
  min-width: 48px;
}
.marketfavs-navigation {
  display: flex;
  flex: 0 1 auto;
  gap: 4px;
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: auto;
  list-style: none;
}
.marketfavs-navigation button {
  border: 0;
  border-radius: 4px;
  padding: 8px 12px;
  font: inherit;
  white-space: nowrap;
  color: var(--spice-subtext, #b3b3b3);
  background: transparent;
  cursor: pointer;
}
.marketfavs-navigation button[aria-pressed="true"] {
  color: var(--spice-text, #fff);
  background: var(--spice-highlight, #282828);
}
.marketfavs-navigation button:focus-visible,
.marketfavs-saved-view button:focus-visible {
  outline: 2px solid var(--spice-text, #fff);
  outline-offset: -2px;
}
section.contentSpacing[data-marketfavs-saved-view] > :not(.marketfavs-saved-view) {
  display: none !important;
}
.marketfavs-saved-view { padding-block: 24px; }
.marketfavs-saved-view[hidden] { display: none; }
.marketfavs-saved-view p { margin-block: 16px; color: var(--spice-subtext, #b3b3b3); }
.marketfavs-saved-view button {
  border: 1px solid var(--spice-button-disabled, #535353);
  border-radius: 20px;
  padding: 8px 16px;
  color: var(--spice-text, #fff);
  background: transparent;
  cursor: pointer;
}
`;

export function mountNavigation(document: Document): () => void {
  const view = document.defaultView;
  if (!view) return () => {};
  let selected: (typeof entries)[number] | undefined;
  let root: Element | null = null;
  let nav: Element | null = null;
  let observer: MutationObserver | undefined;
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
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back to Marketplace";
  back.addEventListener("click", () => {
    selected = undefined;
    sync();
    links.querySelector<HTMLButtonElement>("button")?.focus();
  });
  panel.append(heading, empty, back);
  const controls = entries.map((entry) => {
    const item = document.createElement("li");
    item.className = "marketplace-tabBar-headerItem";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "marketplace-tabBar-headerItemLink";
    button.textContent = entry.label;
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

  function detach() {
    root?.removeAttribute("data-marketfavs-saved-view");
    nav?.classList.remove("marketfavs-navigation-host");
    links.remove();
    panel.remove();
    root = nav = null;
  }

  function sync() {
    const nextNav = document.querySelector(NAV);
    const nextRoot = document
      .querySelector(HEADER)
      ?.closest("section.contentSpacing");
    if (!nextRoot) {
      detach();
      selected = undefined;
      return;
    }
    if (root !== nextRoot || nav !== nextNav) {
      detach();
      root = nextRoot;
      nav = nextNav;
    }
    nav?.classList.add("marketfavs-navigation-host");
    if (nav && links.parentElement !== nav) nav.append(links);
    if (panel.parentElement !== root) root.append(panel);
    root.toggleAttribute("data-marketfavs-saved-view", selected !== undefined);
    panel.hidden = selected === undefined;
    if (heading.textContent !== (selected?.label ?? ""))
      heading.textContent = selected?.label ?? "";
    if (empty.textContent !== (selected?.empty ?? ""))
      empty.textContent = selected?.empty ?? "";
    controls.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(selected === entries[index]));
    });
  }

  function start() {
    (document.head ?? document.documentElement).append(style);
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
    });
    sync();
  }

  function dispose() {
    observer?.disconnect();
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

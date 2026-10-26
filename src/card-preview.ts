import { readCard, type SavedCards, type SavedList } from "./saved-cards";

const GRID = ":is(.marketplace-grid, .marketfavs-saved-grid)";
const CARD = ".main-card-card";
const ROW = ".marketfavs-preview-actions";
const STYLE_ID = "marketfavs-preview-style";
const FILTERED = "data-marketfavs-filtered";
const TYPES = ["extension", "theme", "snippet", "app"];

const styles = `
.marketplace-grid ${CARD}[${FILTERED}] { display: none !important; }
${GRID} ${CARD}:has(${ROW}) .main-card-cardMetadata {
  position: relative;
}
${GRID} ${ROW} {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  justify-items: center;
  box-sizing: border-box;
  min-height: 52px;
  margin-top: auto;
  padding-top: 12px;
  padding-inline: 0;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  -webkit-transition: none;
  transition: none;
}
${GRID} ${CARD}:has(.marketplace-installButton) ${ROW} {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
${GRID} ${CARD}:has(${ROW}) .main-card-PlayButtonContainer {
  position: absolute;
  inset: auto 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% / 3);
  height: 40px;
  margin: 0;
  -webkit-box-shadow: none;
  box-shadow: none;
  transform: none;
  opacity: 0;
  pointer-events: none;
  -webkit-transition: none;
  transition: none;
}
${GRID} ${CARD}:hover ${ROW},
${GRID} ${CARD}:focus-within ${ROW},
${GRID} ${CARD}:has(${ROW}):hover .main-card-PlayButtonContainer,
${GRID} ${CARD}:has(${ROW}):focus-within .main-card-PlayButtonContainer {
  opacity: 1;
  pointer-events: auto;
}
${GRID} ${ROW} button,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton {
  --size: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 0;
  min-width: 40px;
  width: 40px;
  height: 40px;
  padding: 6px;
  border: 1px solid var(--spice-button-disabled, #535353);
  border-radius: 50%;
  color: var(--spice-subtext, #b3b3b3);
  background: transparent;
  -webkit-box-shadow: none;
  box-shadow: none;
  transform: none;
  opacity: 1;
  cursor: pointer;
  -webkit-transition: none;
  transition: none;
}
${GRID} ${ROW} button[aria-pressed="true"] {
  color: var(--spice-button, #1db954);
  border-color: currentColor;
}
${GRID} ${ROW} button:hover,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton:hover {
  color: var(--spice-text, #fff);
}
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton:hover {
  color: var(--spice-card, #282828);
  background: #fff;
  border-color: #fff;
}
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton:hover:not(:disabled) {
  background: #dedede;
  border-color: #dedede;
}
${GRID} ${ROW} button:focus-visible,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton:focus-visible {
  outline: 2px solid var(--spice-text, #fff);
  outline-offset: 2px;
}
${GRID} ${ROW} button:disabled,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton:disabled {
  opacity: .45;
  cursor: not-allowed;
}
${GRID} ${ROW} svg,
${GRID} ${CARD}:has(${ROW}) .marketplace-installButton svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
@media (prefers-reduced-motion: no-preference) {
  ${GRID} ${ROW},
  ${GRID} ${CARD}:has(${ROW}) .main-card-PlayButtonContainer {
    -webkit-transition: opacity .2s ease-out;
    transition: opacity .2s ease-out;
  }
  ${GRID} ${ROW} button,
  ${GRID} ${CARD}:has(${ROW}) .marketplace-installButton {
    -webkit-transition: color .2s ease-out, border-color .2s ease-out, background-color .2s ease-out;
    transition: color .2s ease-out, border-color .2s ease-out, background-color .2s ease-out;
  }
}
`;

function isEligible(card: Element): boolean {
  /* 
  Determine if a card is eligible for the MarketFavs preview actions. 
  A card is considered eligible if... 
    - the card is within a Marketplace grid (GRID).
    - the card has a class corresponding to one of the accepted types (TYPES).
    - if the card is a snippet, its grid must have data-tab="Snippets".
  */
  const grid = card.closest(GRID);
  return (
    grid !== null &&
    TYPES.some((type) =>
      card.classList.contains(`marketplace-card--${type}`),
    ) &&
    (!card.classList.contains("marketplace-card--snippet") ||
      grid.getAttribute("data-tab") === "Snippets" ||
      grid.classList.contains("marketfavs-saved-grid"))
  );
}

function createButton(document: Document, label: string, path: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linejoin", "round");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  icon.append(shape);
  button.append(icon);
  return button;
}

export function mountCardPreview(
  document: Document,
  savedCards: SavedCards,
): () => void {
  // Obtains the window associated with the document. If it does not exist, returns an empty function
  const view = document.defaultView;
  if (!view) return () => {};

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  let observer: MutationObserver | undefined;
  const unsubscribe = savedCards.subscribe(scan);

  function cardData(card: Element) {
    const key = card.getAttribute("data-marketfavs-key");
    return key ? savedCards.get(key)?.card : readCard(card);
  }

  function refresh() {
    const cards = [
      ...document.querySelectorAll(
        `.marketplace-grid:not(.marketfavs-saved-grid) ${CARD}`,
      ),
    ]
      .filter(isEligible)
      .flatMap((card) => {
        const item = readCard(card);
        return item ? [item] : [];
      });
    savedCards.updateInstallation(cards);
    scan();
  }

  function scan() {
    /* 
      Scans the document for eligible cards and adds preview actions to them. 
    */

    const ready = savedCards.status().ready;
    // Remove any existing preview action rows that are no longer eligible
    // (e.g., if the card has been removed or is no longer eligible)
    for (const row of document.querySelectorAll(ROW)) {
      const card = row.closest(CARD);
      if (!card || !isEligible(card)) row.remove();
    }
    for (const card of document.querySelectorAll(`[${FILTERED}]`)) {
      if (!card.closest(GRID)) card.removeAttribute(FILTERED);
    }

    // Add preview action rows to eligible cards that do not already have one
    for (const card of document.querySelectorAll(`${GRID} ${CARD}`)) {
      // Ignore certaint cards: that are Not eligible. Already has 'Favorites' and 'Not Intered' buttons. Does not have a metadata section.
      if (!isEligible(card)) {
        card.removeAttribute(FILTERED);
        continue;
      }
      const item = cardData(card);
      const grid = card.closest(GRID)!;
      const filtered =
        !grid.classList.contains("marketfavs-saved-grid") &&
        grid.getAttribute("data-tab") !== "Installed" &&
        item !== undefined &&
        savedCards.get(item.key) !== undefined;
      card.toggleAttribute(FILTERED, filtered);
      const existing = card.querySelector(ROW);
      if (existing) {
        for (const button of existing.querySelectorAll<HTMLButtonElement>(
          "button[data-list]",
        )) {
          button.disabled = !ready;
          if (ready) button.removeAttribute("aria-disabled");
          else button.setAttribute("aria-disabled", "true");
          button.setAttribute(
            "aria-pressed",
            String(
              item !== undefined &&
                savedCards.get(item.key)?.list === button.dataset.list,
            ),
          );
        }
        continue;
      }
      const metadata = card.querySelector(".main-card-cardMetadata");
      if (!metadata) continue;

      // Create a new row for the 'Favorites' and 'Not Intered' buttons and append it to the card's metadata section
      const row = document.createElement("div");
      row.className = "marketfavs-preview-actions";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "MarketFavs");
      row.append(
        createButton(
          document,
          "Favoritos",
          "m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z",
        ),
        createButton(
          document,
          "No me interesa",
          "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM5.6 5.6l12.8 12.8",
        ),
      );
      const lists: SavedList[] = ["favorites", "not-interested"];
      row.querySelectorAll("button").forEach((button, index) => {
        const list = lists[index]!;
        button.dataset.list = list;
        button.disabled = !ready;
        if (!ready) button.setAttribute("aria-disabled", "true");
        const item = cardData(card);
        button.setAttribute(
          "aria-pressed",
          String(item !== undefined && savedCards.get(item.key)?.list === list),
        );
      });
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const button =
          event.target instanceof view!.Element
            ? event.target.closest<HTMLButtonElement>("button[data-list]")
            : null;
        const item = cardData(card);
        if (button && item)
          savedCards.toggle(item, button.dataset.list as SavedList);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          if (event.target instanceof view!.HTMLButtonElement)
            event.target.click();
        }
      });
      metadata.append(row);
    }
  }

  function start() {
    /*
      Starts the card preview functionality 
      Observe the document for changes in the marketplace grid.
      If any changes are detected, re-scan the document for eligible cards and update them accordingly.
    */

    // Insert the styles and scan for eligible cards
    (document.head ?? document.documentElement).append(style);
    refresh();

    // Define a MutationObserver to watch for changes in the document that may affect the marketplace grid.
    observer = new view!.MutationObserver((records) => {
      const touchesMarketplace = records.some((record) => {
        // Check if the target of the mutation is an element within a marketplace grid.
        if (
          record.target instanceof view!.Element &&
          record.target.closest(GRID)
        )
          return true;
        // Check if any of the added or removed nodes are elements within a marketplace grid.
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof view!.Element &&
            (node.matches(GRID) || node.querySelector(GRID)),
        );
      });
      if (touchesMarketplace) refresh();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tab", "class"],
    });
  }

  function dispose() {
    /* 
      Cleans up the card preview functionality 
    */
    observer?.disconnect();
    unsubscribe();
    document.removeEventListener("DOMContentLoaded", start);
    view?.removeEventListener("pagehide", dispose);
    document.querySelectorAll(ROW).forEach((row) => row.remove());
    document
      .querySelectorAll(`[${FILTERED}]`)
      .forEach((card) => card.removeAttribute(FILTERED));
    style.remove();
  }

  view.addEventListener("pagehide", dispose, { once: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
  return dispose;
}

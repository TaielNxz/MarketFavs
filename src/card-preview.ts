const GRID = ".marketplace-grid";
const CARD = ".main-card-card";
const ROW = ".marketfavs-preview-actions";
const STYLE_ID = "marketfavs-preview-style";
const TYPES = ["extension", "theme", "snippet", "app"];

const styles = `
${GRID} ${ROW} {
  display: flex;
  gap: 8px;
  box-sizing: border-box;
  min-height: 44px;
  margin-top: auto;
  padding-top: 12px;
  padding-inline-end: 44px;
  opacity: 0;
  pointer-events: none;
}
${GRID} ${CARD}:hover ${ROW},
${GRID} ${CARD}:focus-within ${ROW} {
  opacity: 1;
  pointer-events: auto;
}
${GRID} ${ROW} button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: auto;
  width: 40px;
  height: 40px;
  padding: 6px;
  border: 1px solid var(--spice-button-disabled, #535353);
  border-radius: 50%;
  color: var(--spice-subtext, #b3b3b3);
  background: transparent;
  cursor: default;
}
${GRID} ${ROW} button:hover { color: var(--spice-text, #fff); }
${GRID} ${ROW} button:focus-visible {
  outline: 2px solid var(--spice-text, #fff);
  outline-offset: 2px;
}
${GRID} ${ROW} svg { width: 18px; height: 18px; flex-shrink: 0; }
`;

function isEligible(card: Element): boolean {
  const grid = card.closest(GRID);
  return (
    grid !== null &&
    TYPES.some((type) =>
      card.classList.contains(`marketplace-card--${type}`),
    ) &&
    (!card.classList.contains("marketplace-card--snippet") ||
      grid.getAttribute("data-tab") === "Snippets")
  );
}

function createButton(document: Document, label: string, path: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-disabled", "true");
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

export function mountCardPreview(document: Document): () => void {
  const view = document.defaultView;
  if (!view) return () => {};
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  let observer: MutationObserver | undefined;

  function scan() {
    for (const row of document.querySelectorAll(ROW)) {
      const card = row.closest(CARD);
      if (!card || !isEligible(card)) row.remove();
    }
    for (const card of document.querySelectorAll(`${GRID} ${CARD}`)) {
      if (!isEligible(card) || card.querySelector(ROW)) continue;
      const metadata = card.querySelector(".main-card-cardMetadata");
      if (!metadata) continue;
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
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
        }
      });
      metadata.append(row);
    }
  }

  function start() {
    (document.head ?? document.documentElement).append(style);
    scan();
    observer = new view!.MutationObserver((records) => {
      const touchesMarketplace = records.some((record) => {
        if (
          record.target instanceof view!.Element &&
          record.target.closest(GRID)
        )
          return true;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof view!.Element &&
            (node.matches(GRID) || node.querySelector(GRID)),
        );
      });
      if (touchesMarketplace) scan();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tab"],
    });
  }

  function dispose() {
    observer?.disconnect();
    document.removeEventListener("DOMContentLoaded", start);
    view?.removeEventListener("pagehide", dispose);
    document.querySelectorAll(ROW).forEach((row) => row.remove());
    style.remove();
  }

  view.addEventListener("pagehide", dispose, { once: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
  return dispose;
}

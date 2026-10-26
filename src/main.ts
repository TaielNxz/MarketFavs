import { mountCardPreview } from "./card-preview"; // Component that adds buttons to each card in the marketplace grid
import { mountNavigation } from "./navigation"; // Component that adds a navigation bar to the marketplace page
import { createSavedCards } from "./saved-cards";
import { createSavedActions } from "./saved-actions";

console.info("[MarketFavs] Development scaffold loaded.");

if (typeof document !== "undefined") {
  const key = Symbol.for("marketfavs.card-preview.dispose");
  const runtime = globalThis as typeof globalThis & {
    [key: symbol]: (() => void) | undefined;
  };
  runtime[key]?.();
  const savedCards = createSavedCards(window);
  const actions = createSavedActions(window, savedCards);
  const disposeCards = mountCardPreview(document, savedCards);
  const disposeNavigation = mountNavigation(document, savedCards, actions);
  runtime[key] = () => {
    actions.dispose();
    savedCards.dispose();
    disposeCards();
    disposeNavigation();
  };
}

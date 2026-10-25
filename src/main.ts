import { mountCardPreview } from "./card-preview"; // Component that adds buttons to each card in the marketplace grid
import { mountNavigation } from "./navigation"; // Component that adds a navigation bar to the marketplace page

console.info("[MarketFavs] Development scaffold loaded.");

if (typeof document !== "undefined") {
  const key = Symbol.for("marketfavs.card-preview.dispose");
  const runtime = globalThis as typeof globalThis & {
    [key: symbol]: (() => void) | undefined;
  };
  runtime[key]?.();
  const disposeCards = mountCardPreview(document);
  const disposeNavigation = mountNavigation(document);
  runtime[key] = () => {
    disposeCards();
    disposeNavigation();
  };
}

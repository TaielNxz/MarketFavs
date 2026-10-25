import { mountCardPreview } from "./card-preview";

console.info("[MarketFavs] Development scaffold loaded.");

if (typeof document !== "undefined") {
  const key = Symbol.for("marketfavs.card-preview.dispose");
  const runtime = globalThis as typeof globalThis & {
    [key: symbol]: (() => void) | undefined;
  };
  runtime[key]?.();
  runtime[key] = mountCardPreview(document);
}

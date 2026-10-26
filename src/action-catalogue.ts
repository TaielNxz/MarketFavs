import type { SavedCard } from "./saved-cards";
import {
  abortable,
  object,
  type CatalogueItem,
  type NativeItem,
} from "./native-marketplace";

const SNIPPETS =
  "https://raw.githubusercontent.com/spicetify/marketplace/main/resources/snippets.json";
const address = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
function repoOf(card: SavedCard) {
  const url = new URL(card.href);
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    parts.length !== 2 ||
    parts.some((part) => !/^[\w.-]+$/.test(part))
  )
    throw new Error(
      "This saved item has no supported repository. Find it in Marketplace and save it again.",
    );
  return { user: parts[0]!, repo: parts[1]! };
}
function matches(card: SavedCard, candidate: CatalogueItem) {
  const item = candidate.item;
  if (candidate.type !== card.type || item.title !== card.title) return false;
  if (card.type === "snippet") return typeof item.code === "string";
  const repo = repoOf(card);
  return (
    typeof item.user === "string" &&
    typeof item.repo === "string" &&
    item.user.toLowerCase() === repo.user.toLowerCase() &&
    item.repo.toLowerCase() === repo.repo.toLowerCase()
  );
}
export function validateActionItem(
  item: NativeItem,
  type: string,
  assets = true,
): NativeItem {
  if (
    typeof item.title !== "string" ||
    !item.title ||
    (type === "snippet"
      ? typeof item.code !== "string"
      : !object(item.manifest))
  )
    throw new Error(
      "Marketplace returned incomplete item data. Try again later.",
    );
  if (
    type === "extension" &&
    (typeof item.manifest.main !== "string" ||
      !item.manifest.main ||
      (assets && !address(item.extensionURL)))
  )
    throw new Error("This extension has no valid installation URL.");
  if (
    type === "theme" &&
    (typeof item.manifest.usercss !== "string" ||
      !item.manifest.usercss ||
      (assets && !address(item.cssURL)) ||
      (assets && item.schemesURL != null && !address(item.schemesURL)) ||
      (item.include !== undefined &&
        (!Array.isArray(item.include) ||
          !item.include.every((v: unknown) => typeof v === "string"))))
  )
    throw new Error("This theme has incomplete installation data.");
  if (
    item.tags !== undefined &&
    (!Array.isArray(item.tags) ||
      !item.tags.every((tag: unknown) => typeof tag === "string"))
  )
    throw new Error(
      "Marketplace returned invalid item tags. Please try again.",
    );
  return JSON.parse(JSON.stringify(item));
}
function select(
  card: SavedCard,
  candidates: CatalogueItem[],
  assets = true,
): NativeItem | undefined {
  const found = candidates.filter((candidate) => matches(card, candidate));
  const distinct = new Map(
    found.map(({ item }) => [
      JSON.stringify([
        item.user,
        item.repo,
        item.manifest?.main,
        item.manifest?.usercss,
        item.title,
        item.branch,
        item.extensionURL,
        item.cssURL,
        item.schemesURL,
        item.include,
        item.code,
      ]),
      item,
    ]),
  );
  if (distinct.size > 1)
    throw new Error(
      "Several Marketplace items match this saved card. Find the intended item in Marketplace and save it again.",
    );
  const item = distinct.values().next().value;
  return item ? validateActionItem(item, card.type, assets) : undefined;
}

export async function resolveActionItem(
  view: Window,
  card: SavedCard,
  installed: CatalogueItem[],
  current: CatalogueItem[],
  signal: AbortSignal,
): Promise<NativeItem> {
  const known = select(card, installed, false) ?? select(card, current);
  if (known) return known;
  const json = async (url: string) => {
    const response = await abortable(view.fetch(url, { signal }), signal);
    if (!response.ok)
      throw new Error(
        "Could not load Marketplace item data. Check your connection and try again.",
      );
    return abortable(response.json() as Promise<unknown>, signal);
  };
  if (card.type === "snippet") {
    const snippets = await json(SNIPPETS);
    if (!Array.isArray(snippets))
      throw new Error("The snippet catalogue is unavailable. Try again later.");
    const result = select(
      card,
      snippets.filter(object).map((item) => ({
        type: "snippet",
        item: {
          ...item,
          imageURL:
            typeof item.preview === "string"
              ? address(item.preview)
                ? item.preview
                : `https://raw.githubusercontent.com/spicetify/spicetify-marketplace/main/${item.preview}`
              : item.imageURL,
        },
      })),
    );
    if (result) return result;
  } else {
    const { user, repo } = repoOf(card);
    if (card.type === "app")
      return {
        user,
        repo,
        title: card.title,
        manifest: { name: card.title },
        tags: [],
        authors: [],
      };
    const metadata = await json(`https://api.github.com/repos/${user}/${repo}`);
    if (
      !object(metadata) ||
      typeof metadata.default_branch !== "string" ||
      !metadata.default_branch
    )
      throw new Error(
        "The repository metadata is unavailable. Try again later.",
      );
    const branch = metadata.default_branch;
    const response = await json(
      `https://raw.githubusercontent.com/${user}/${repo}/${branch}/manifest.json`,
    );
    const manifests = (Array.isArray(response) ? response : [response]).filter(
      object,
    );
    const candidates = manifests
      .filter(
        (manifest) =>
          manifest.name === card.title &&
          typeof manifest.description === "string" &&
          (card.type === "extension"
            ? typeof manifest.main === "string"
            : typeof manifest.usercss === "string"),
      )
      .map((manifest) => {
        const selected =
          typeof manifest.branch === "string" && manifest.branch
            ? manifest.branch
            : branch;
        const raw = (path: unknown) =>
          typeof path === "string"
            ? address(path)
              ? path
              : `https://raw.githubusercontent.com/${user}/${repo}/${selected}/${path}`
            : undefined;
        const authors = (
          Array.isArray(manifest.authors) ? manifest.authors : []
        ).flatMap((author) =>
          object(author) &&
          typeof author.name === "string" &&
          author.name.trim()
            ? [
                {
                  name: author.name.trim(),
                  url: address(author.url)
                    ? author.url
                    : `https://github.com/${author.name.trim()}`,
                },
              ]
            : [],
        );
        const item: NativeItem = {
          manifest,
          title: manifest.name,
          subtitle: manifest.description,
          user,
          repo,
          branch: selected,
          authors: authors.length
            ? authors
            : [{ name: user, url: `https://github.com/${user}` }],
          imageURL: raw(manifest.preview) ?? card.image,
          readmeURL: raw(manifest.readme),
          stars: metadata.stargazers_count,
          created: metadata.created_at,
          lastUpdated: metadata.pushed_at,
          tags: Array.isArray(manifest.tags)
            ? manifest.tags.filter((tag) => typeof tag === "string")
            : typeof manifest.tags === "string"
              ? [manifest.tags]
              : [],
          ...(card.type === "extension"
            ? { extensionURL: raw(manifest.main) }
            : {
                cssURL: raw(manifest.usercss),
                schemesURL: raw(manifest.schemes) ?? null,
                ...(manifest.include === undefined
                  ? {}
                  : { include: manifest.include }),
              }),
        };
        return { type: card.type, item };
      });
    const result = select(card, candidates);
    if (result) return result;
  }
  throw new Error(
    "This saved item is no longer available in Marketplace. Find it in the catalogue and save it again.",
  );
}

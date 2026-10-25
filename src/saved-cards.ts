export type SavedList = "favorites" | "not-interested";
export type SavedCard = {
  key: string;
  type: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  href: string;
};

// Session-only presentation identity. This is not a persistent catalogue identifier.
export function readCard(card: Element): SavedCard | undefined {
  const type = ["extension", "theme", "snippet", "app"].find((value) =>
    card.classList.contains(`marketplace-card--${value}`),
  );
  const link = card.querySelector<HTMLAnchorElement>(
    ".main-cardHeader-link, .main-card-cardMetadata a",
  );
  const title = (
    card.querySelector(".main-cardHeader-text") ?? link
  )?.textContent?.trim();
  if (!type || !title || !link) return;
  const href = webUrl(link.href);
  const subtitle =
    card.querySelector(".main-cardSubHeader-root")?.textContent?.trim() ?? "";
  const description =
    card.querySelector(".marketplace-card-desc")?.textContent ?? "";
  const image = webUrl(card.querySelector<HTMLImageElement>("img")?.src ?? "");
  return {
    key: JSON.stringify([type, href, title, subtitle]),
    type,
    title,
    subtitle,
    description,
    image,
    href,
  };
}

function webUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function createSavedCards() {
  const records = new Map<string, { card: SavedCard; list: SavedList }>();
  const listeners = new Set<() => void>();
  return {
    get(key: string) {
      return records.get(key);
    },
    items(list: SavedList) {
      return [...records.values()]
        .filter((record) => record.list === list)
        .map((record) => record.card);
    },
    toggle(card: SavedCard, list: SavedList) {
      if (records.get(card.key)?.list === list) records.delete(card.key);
      else records.set(card.key, { card, list });
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SavedCards = ReturnType<typeof createSavedCards>;

// Render a presentation snapshot; never duplicate native install controls or handlers.
export function renderSavedCard(
  document: Document,
  item: SavedCard,
): HTMLElement {
  const card = document.createElement("div");
  card.className = `main-card-card marketplace-card--${item.type}`;
  card.dataset.marketfavsKey = item.key;
  const content = document.createElement("div");
  content.className = "main-card-draggable";
  const imageContainer = document.createElement("div");
  imageContainer.className = "main-card-imageContainer";
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "main-cardImage-imageWrapper";
  const imageContent = document.createElement("div");
  if (item.image) {
    const image = document.createElement("img");
    image.className = "main-image-image main-cardImage-image";
    image.src = item.image;
    image.alt = "";
    image.loading = "lazy";
    image.draggable = false;
    imageContent.append(image);
  }
  imageWrapper.append(imageContent);
  imageContainer.append(imageWrapper);
  const metadata = document.createElement("div");
  metadata.className = "main-card-cardMetadata";
  const title = document.createElement("div");
  title.className = "main-cardHeader-text main-type-balladBold";
  title.textContent = item.title;
  if (item.href) {
    const link = document.createElement("a");
    link.className = "main-cardHeader-link";
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.draggable = false;
    link.dir = "auto";
    link.title = item.title;
    link.append(title);
    metadata.append(link);
  } else metadata.append(title);
  const subtitle = document.createElement("div");
  subtitle.className =
    "main-cardSubHeader-root main-type-mestoBold marketplace-cardSubHeader";
  subtitle.textContent = item.subtitle;
  const description = document.createElement("p");
  description.className = "marketplace-card-desc";
  description.textContent = item.description;
  metadata.append(subtitle, description);
  content.append(imageContainer, metadata);
  card.append(content);
  return card;
}

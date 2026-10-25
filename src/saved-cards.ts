import { createPersistentLists } from "./persistence";

export type SavedList = "favorites" | "not-interested";
export type SavedCard = {
  key: string;
  type: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  href: string;
  installed: boolean;
  installedLabel: string;
};

// Presentation-based identity; this is not an authoritative catalogue identifier.
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
  const installed = card.classList.contains("marketplace-card--installed");
  const installedLabel = installed
    ? ([...card.querySelectorAll(".marketplace-card__bottom-meta")]
        .map((element) => element.textContent?.trim() ?? "")
        .find((text) => text.startsWith("✓")) ?? "✓ Installed")
    : "";
  return {
    key: JSON.stringify([type, href, title, subtitle]),
    type,
    title,
    subtitle,
    description,
    image,
    href,
    installed,
    installedLabel,
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

export const createSavedCards = createPersistentLists;

export type SavedCards = ReturnType<typeof createSavedCards>;

// Render a presentation snapshot; never duplicate native install controls or handlers.
export function renderSavedCard(
  document: Document,
  item: SavedCard,
): HTMLElement {
  const card = document.createElement("div");
  card.className = `main-card-card marketplace-card--${item.type}`;
  if (item.installed) card.classList.add("marketplace-card--installed");
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
  if (item.installed) {
    const installed = document.createElement("div");
    installed.className = "marketplace-card__bottom-meta main-type-mestoBold";
    installed.textContent = item.installedLabel;
    metadata.append(installed);
  }
  content.append(imageContainer, metadata);
  card.append(content);
  return card;
}

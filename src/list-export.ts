import type { SavedCard, SavedCards, SavedList } from "./saved-cards";

function portableCard(card: SavedCard) {
  // Explicit fields keep local installation state out of the portable file.
  return {
    key: card.key,
    type: card.type,
    title: card.title,
    subtitle: card.subtitle,
    description: card.description,
    image: card.image,
    href: card.href,
    ...(card.sort ? { sort: { ...card.sort } } : {}),
  };
}

export function downloadLists(document: Document, saved: SavedCards) {
  const view = document.defaultView;
  if (!view || !saved.status().ready)
    throw new Error("Saved lists are not available for export.");
  const items = (list: SavedList) => saved.items(list).map(portableCard);
  const data = {
    format: "marketfavs",
    version: 1,
    lists: {
      favorites: items("favorites"),
      "not-interested": items("not-interested"),
    },
    // The current store accepts only empty match-decision arrays. When match
    // decisions are implemented, their export must evolve with that store.
    matches: { accepted: [], rejected: [] },
  };
  if (!saved.status().ready)
    throw new Error("The active account changed. Please try again.");
  const blob = new view.Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json;charset=utf-8",
  });
  const url = view.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "marketfavs-lists.json";
  link.hidden = true;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Let the browser start consuming the URL before releasing it.
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  }
}

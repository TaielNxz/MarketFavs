import type { SavedCard } from "./saved-cards";

export const sortModes = [
  "stars",
  "newest",
  "oldest",
  "lastUpdated",
  "mostStale",
  "a-z",
  "z-a",
] as const;
export type SortMode = (typeof sortModes)[number];
export type SortMetadata = {
  stars?: number;
  created?: string;
  lastUpdated?: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const stars = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export function validSortMetadata(value: unknown): value is SortMetadata {
  return (
    object(value) &&
    Object.keys(value).every((key) =>
      key === "stars"
        ? stars(value[key])
        : ["created", "lastUpdated"].includes(key) && date(value[key]),
    )
  );
}

// Marketplace exposes no public card/sort hook. Read its component data without
// invoking callbacks or modifying React objects; fail safely if internals change.
function* nativeProps(element: Element): Generator<Record<string, unknown>> {
  try {
    const property = Object.getOwnPropertyNames(element).find(
      (name) =>
        name.startsWith("__reactFiber$") ||
        name.startsWith("__reactInternalInstance$"),
    );
    if (!property) return;
    let fiber: unknown = (element as unknown as Record<string, unknown>)[
      property
    ];
    const seen = new Set<object>();
    while (object(fiber) && seen.size < 50 && !seen.has(fiber)) {
      seen.add(fiber);
      const current =
        object(fiber.stateNode) && object(fiber.stateNode.props)
          ? fiber.stateNode.props
          : fiber.memoizedProps;
      if (object(current)) yield current;
      fiber = fiber.return;
    }
  } catch {
    /* An unavailable private adapter must not break native controls. */
  }
}

export function readCardSort(
  element: Element,
  type: string,
  title: string,
): SortMetadata | undefined {
  for (const props of nativeProps(element)) {
    const item = props.item;
    if (
      props.type !== type ||
      !object(item) ||
      typeof item.title !== "string" ||
      item.title.trim() !== title
    )
      continue;
    const result: SortMetadata = {};
    if (stars(item.stars)) result.stars = item.stars;
    if (date(item.created)) result.created = item.created;
    if (date(item.lastUpdated)) result.lastUpdated = item.lastUpdated;
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return;
}

export function readNativeSort(document: Document): SortMode | undefined {
  const dropdown = document.querySelector(
    ".marketplace-header .marketplace-header__left .marketplace-sortBox .Dropdown-root",
  );
  if (!dropdown) return;
  const label = dropdown
    .querySelector(".Dropdown-placeholder")
    ?.textContent?.trim();
  for (const props of nativeProps(dropdown)) {
    // react-dropdown updates its displayed selection even when the host retains
    // the initial value prop. Resolve the live label through its native options.
    const displayed = Array.isArray(props.options)
      ? props.options.filter(
          (option) =>
            object(option) &&
            typeof option.label === "string" &&
            option.label.trim() === label,
        )
      : [];
    const value =
      displayed.length === 1
        ? displayed[0].value
        : object(props.value)
          ? props.value.value
          : props.value;
    if (
      typeof value === "string" &&
      sortModes.includes(value as SortMode) &&
      Array.isArray(props.options) &&
      props.options.some((option) => object(option) && option.value === value)
    )
      return value as SortMode;
  }
  return;
}

export function sortSavedCards(
  cards: SavedCard[],
  mode: SortMode,
): SavedCard[] {
  return [...cards].sort((a, b) => {
    if (mode === "a-z") return a.title.localeCompare(b.title);
    if (mode === "z-a") return b.title.localeCompare(a.title);
    if (mode === "stars")
      return a.sort?.stars === undefined || b.sort?.stars === undefined
        ? 0
        : b.sort.stars - a.sort.stars;
    const field =
      mode === "newest" || mode === "oldest" ? "created" : "lastUpdated";
    const left = a.sort?.[field];
    const right = b.sort?.[field];
    if (left === undefined || right === undefined) return 0;
    const descending = Date.parse(right) - Date.parse(left);
    return mode === "oldest" || mode === "mostStale" ? -descending : descending;
  });
}

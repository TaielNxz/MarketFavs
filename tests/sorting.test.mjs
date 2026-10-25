import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, settle } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const modes = [
  "stars",
  "newest",
  "oldest",
  "lastUpdated",
  "mostStale",
  "a-z",
  "z-a",
];
const key = "marketfavs:state:test-user";
const values = [
  {
    title: "Charlie",
    stars: 5,
    created: "2020-01-01",
    lastUpdated: "2024-01-01",
  },
  {
    title: "Alpha",
    stars: 10,
    created: "2022-01-01",
    lastUpdated: "2023-01-01",
  },
  {
    title: "Bravo",
    stars: 1,
    created: "2021-01-01",
    lastUpdated: "2025-01-01",
  },
];
const expected = {
  stars: ["Alpha", "Charlie", "Bravo"],
  newest: ["Alpha", "Bravo", "Charlie"],
  oldest: ["Charlie", "Bravo", "Alpha"],
  lastUpdated: ["Bravo", "Charlie", "Alpha"],
  mostStale: ["Alpha", "Charlie", "Bravo"],
  "a-z": ["Alpha", "Bravo", "Charlie"],
  "z-a": ["Charlie", "Bravo", "Alpha"],
};
function props(element, value) {
  element.__reactFiber$fixture = { return: { stateNode: { props: value } } };
}
function fixture(t, withCards = true, updateSelectedProp = true) {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
    <section class="contentSpacing"><div class="marketplace-header"><div class="marketplace-header__left">
    <h2 class="marketplace-header__label">Sort by:</h2><div class="marketplace-sortBox"><div class="Dropdown-root"><span class="Dropdown-placeholder">Traducido</span></div></div>
    </div><div class="marketplace-header__right"><div class="marketplace-sortBox"><div class="Dropdown-root"><span>Scheme</span></div></div></div></div></section>`,
    {
      url: "https://xpui.app.spotify.com",
      runScripts: "outside-only",
    },
  );
  const { window } = dom;
  const { document } = window;
  window.console.info = () => {};
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  const dropdown = document.querySelector(
    ".marketplace-header__left .Dropdown-root",
  );
  const selected = {
    value: "stars",
    options: modes.map((value, index) => ({
      value,
      label: `Traducido ${index}`,
    })),
  };
  props(dropdown, selected);
  let callbacks = 0;
  for (const [index, mode] of modes.entries()) {
    const option = document.createElement("div");
    option.className = "Dropdown-option";
    option.textContent = `Traducido ${index}`;
    for (const event of ["click", "mousedown"])
      option.addEventListener(event, () => {
        callbacks++;
        if (updateSelectedProp) selected.value = mode;
        dropdown.querySelector(".Dropdown-placeholder").firstChild.data =
          option.textContent;
      });
    dropdown.append(option);
  }
  const originals = [];
  if (withCards)
    for (const type of ["app", "snippet", "theme", "extension"]) {
      const grid = document.createElement("div");
      grid.className = "marketplace-grid";
      grid.dataset.tab = type === "snippet" ? "Snippets" : "Extensions";
      for (const list of ["favorite", "ignored"])
        for (const value of values) {
          const title = `${value.title} ${type} ${list}`;
          const card = document.createElement("div");
          card.className = `main-card-card marketplace-card--${type}`;
          card.innerHTML = `<div class="main-card-cardMetadata"><a class="main-cardHeader-link" href="https://github.com/example/${type}"><div class="main-cardHeader-text">${title}</div></a><div class="main-cardSubHeader-root">Author</div></div>`;
          props(card, {
            type,
            item: type === "snippet" ? { title } : { ...value, title },
          });
          grid.append(card);
          originals.push({ card, list });
        }
      document.querySelector("section.contentSpacing").append(grid);
    }
  const open = (index) =>
    document.querySelectorAll(".marketfavs-navigation button")[index].click();
  const choose = async (mode, event = "click") => {
    dropdown
      .querySelectorAll(".Dropdown-option")
      [modes.indexOf(mode)].dispatchEvent(
        new window.MouseEvent(event, { bubbles: true }),
      );
    await settle(window);
  };
  const groups = () => [
    ...document.querySelectorAll(".marketfavs-saved-group"),
  ];
  return {
    window,
    document,
    originals,
    open,
    choose,
    groups,
    selected,
    callbacks: () => callbacks,
  };
}

test("native Sort by orders both saved lists within each group for all seven modes", async (t) => {
  const f = fixture(t);
  await boot(f.window, bundle);
  for (const { card, list } of f.originals)
    card
      .querySelector(
        `button[aria-label="${list === "favorite" ? "Favoritos" : "No me interesa"}"]`,
      )
      .click();
  await settle(f.window);
  const before = f.window.localStorage.getItem(key);
  for (const list of [0, 1]) {
    f.open(list);
    for (const [index, mode] of modes.entries()) {
      await f.choose(mode, index % 2 ? "mousedown" : "click");
      assert.equal(
        f.document.querySelector(".marketfavs-saved-view").hidden,
        false,
      );
      assert.deepEqual(
        f.groups().map((group) => group.querySelector("h2").textContent),
        ["Extensions", "Themes", "Snippets", "Apps"],
      );
      for (const group of f.groups()) {
        const snippetWithoutData =
          group.querySelector("h2").textContent === "Snippets" &&
          !["a-z", "z-a"].includes(mode);
        assert.deepEqual(
          [...group.querySelectorAll(".main-cardHeader-text")].map(
            (card) => card.textContent.split(" ")[0],
          ),
          snippetWithoutData ? ["Charlie", "Alpha", "Bravo"] : expected[mode],
        );
      }
    }
  }
  assert.equal(f.callbacks(), 14);
  assert.equal(f.window.localStorage.getItem(key), before);
  const scheme = f.document.querySelector(
    ".marketplace-header__right .Dropdown-root",
  );
  props(scheme, { value: "a-z", options: [{ value: "a-z" }] });
  scheme.firstElementChild.textContent = "Different scheme";
  await settle(f.window);
  assert.deepEqual(
    [...f.groups()[0].querySelectorAll(".main-cardHeader-text")].map(
      (card) => card.textContent.split(" ")[0],
    ),
    expected["z-a"],
  );
  const dropdown = f.document.querySelector(
    ".marketplace-header__left .Dropdown-root",
  );
  const replacement = dropdown.cloneNode(true);
  props(replacement, { ...f.selected, value: "a-z" });
  replacement.querySelector(".Dropdown-placeholder").textContent =
    "Traducido 5";
  replacement.__reactFiber$fixture.return.memoizedProps = {
    ...f.selected,
    value: "oldest",
  };
  dropdown.replaceWith(replacement);
  await settle(f.window);
  assert.deepEqual(
    [...f.groups()[0].querySelectorAll(".main-cardHeader-text")].map(
      (card) => card.textContent.split(" ")[0],
    ),
    expected["a-z"],
  );
});

test("live native selection orders both lists when Dropdown props retain the initial value", async (t) => {
  const f = fixture(t, true, false);
  await boot(f.window, bundle);
  for (const { card, list } of f.originals)
    card
      .querySelector(
        `button[aria-label="${list === "favorite" ? "Favoritos" : "No me interesa"}"]`,
      )
      .click();
  await settle(f.window);
  const before = f.window.localStorage.getItem(key);
  for (const list of [0, 1]) {
    f.open(list);
    for (const mode of modes) {
      await f.choose(mode, "mousedown");
      assert.equal(f.selected.value, "stars");
      for (const group of f.groups()) {
        const missingMetadata =
          group.querySelector("h2").textContent === "Snippets" &&
          !["a-z", "z-a"].includes(mode);
        assert.deepEqual(
          [...group.querySelectorAll(".main-cardHeader-text")].map(
            (card) => card.textContent.split(" ")[0],
          ),
          missingMetadata ? ["Charlie", "Alpha", "Bravo"] : expected[mode],
        );
      }
      assert.equal(
        f.document.querySelector(".marketfavs-saved-view").hidden,
        false,
      );
    }
  }
  assert.equal(f.callbacks(), 14);
  assert.equal(f.window.localStorage.getItem(key), before);
});

test("encountered metadata enriches legacy records without dropping saved classifications", async (t) => {
  const first = fixture(t);
  await boot(first.window, bundle);
  for (const { card, list } of first.originals.filter(
    (item) => item.list === "favorite",
  ))
    card.querySelector('button[aria-label="Favoritos"]').click();
  await settle(first.window);
  const legacy = JSON.parse(first.window.localStorage.getItem(key));
  legacy.version = 1;
  legacy.entries.forEach((entry) => {
    delete entry.card.sort;
  });
  const current = fixture(t);
  current.window.localStorage.setItem(key, JSON.stringify(legacy));
  await boot(current.window, bundle);
  current.open(0);
  await settle(current.window);
  const enriched = JSON.parse(current.window.localStorage.getItem(key));
  assert.equal(enriched.version, 2);
  assert.equal(enriched.entries.length, legacy.entries.length);
  assert.deepEqual(
    enriched.entries.map((entry) => [entry.card.key, entry.list]),
    legacy.entries.map((entry) => [entry.card.key, entry.list]),
  );
  const source = current.originals.find(
    (item) =>
      item.list === "favorite" &&
      item.card.classList.contains("marketplace-card--extension"),
  );
  source.card.__reactFiber$fixture.return.stateNode.props.item.stars = 99;
  source.card.classList.add("native-metadata-update");
  await settle(current.window);
  assert.equal(
    current
      .groups()[0]
      .querySelector(".main-cardHeader-text")
      .textContent.split(" ")[0],
    "Charlie",
  );
  assert.equal(
    JSON.parse(current.window.localStorage.getItem(key)).entries.find(
      (entry) => entry.card.title === "Charlie extension favorite",
    ).card.sort.stars,
    99,
  );
});

test("invalid persisted sorting metadata blocks editing and preserves the original bytes", async (t) => {
  const first = fixture(t);
  await boot(first.window, bundle);
  first.originals[0].card
    .querySelector('button[aria-label="Favoritos"]')
    .click();
  await settle(first.window);
  const invalid = JSON.parse(first.window.localStorage.getItem(key));
  invalid.entries[0].card.sort = { created: "not-a-date" };
  const raw = JSON.stringify(invalid);
  const current = fixture(t);
  current.window.localStorage.setItem(key, raw);
  await boot(current.window, bundle);
  assert.equal(
    current.originals[0].card.querySelector('button[aria-label="Favoritos"]')
      .disabled,
    true,
  );
  assert.equal(current.window.localStorage.getItem(key), raw);
});

test("sorting metadata survives reload without source cards and version 1 remains readable", async (t) => {
  const source = fixture(t);
  await boot(source.window, bundle);
  for (const { card, list } of source.originals.filter(
    (item) => item.list === "favorite",
  ))
    card.querySelector('button[aria-label="Favoritos"]').click();
  await settle(source.window);
  const raw = source.window.localStorage.getItem(key);
  const restored = fixture(t, false);
  restored.window.localStorage.setItem(key, raw);
  restored.selected.value = "oldest";
  await boot(restored.window, bundle);
  restored.open(0);
  assert.deepEqual(
    [...restored.groups()[0].querySelectorAll(".main-cardHeader-text")].map(
      (card) => card.textContent.split(" ")[0],
    ),
    expected.oldest,
  );
  const legacy = JSON.parse(raw);
  legacy.version = 1;
  legacy.entries.forEach((entry) => {
    delete entry.card.sort;
  });
  const previous = fixture(t, false);
  const legacyRaw = JSON.stringify(legacy);
  previous.window.localStorage.setItem(key, legacyRaw);
  await boot(previous.window, bundle);
  previous.open(0);
  await previous.choose("a-z");
  assert.deepEqual(
    [...previous.groups()[0].querySelectorAll(".main-cardHeader-text")].map(
      (card) => card.textContent.split(" ")[0],
    ),
    expected["a-z"],
  );
  assert.equal(previous.window.localStorage.getItem(key), legacyRaw);
});

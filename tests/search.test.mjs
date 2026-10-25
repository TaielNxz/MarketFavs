import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, settle } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const storageKey = "marketfavs:state:test-user";

async function fixture(t) {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
    <section class="contentSpacing"><div class="marketplace-header">
    <div class="marketplace-header__left"><div class="marketplace-sortBox"><div class="Dropdown-root"><span class="Dropdown-placeholder">Z-A</span></div></div></div>
    <div class="marketplace-header__right"><div class="searchbar--bar__wrapper"><input class="searchbar-bar" placeholder="Search Installed..." /></div></div>
    </div><div class="marketplace-grid" data-tab="Extensions"></div></section>`,
    { url: "https://xpui.app.spotify.com", runScripts: "outside-only" },
  );
  const { window } = dom;
  const { document } = window;
  window.console.info = () => {};
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  document.querySelector(".Dropdown-root").__reactFiber$fixture = {
    return: {
      stateNode: {
        props: { value: "z-a", options: [{ value: "z-a", label: "Z-A" }] },
      },
    },
  };
  const originals = [];
  for (const type of ["extension", "theme", "snippet", "app"]) {
    const grid = document.createElement("div");
    grid.className = "marketplace-grid";
    grid.dataset.tab = type === "snippet" ? "Snippets" : "Extensions";
    document.querySelector("section.contentSpacing").append(grid);
    for (const list of ["favorites", "not-interested"])
      for (const title of ["Alpha", "Bravo", "Charlie"]) {
        const card = document.createElement("div");
        card.className = `main-card-card marketplace-card--${type}`;
        card.innerHTML = `<div class="main-card-cardMetadata"><a class="main-cardHeader-link" href="https://github.com/example/${type}"><div class="main-cardHeader-text">${title} ${type} ${list}</div></a><div class="main-cardSubHeader-root">${title === "Bravo" ? "Other Writer" : "Author"}</div><p class="marketplace-card-desc">${title === "Charlie" ? "Special details" : "Description"}</p></div>`;
        grid.append(card);
        originals.push({ card, list });
      }
  }
  let nativeEvents = 0;
  document.addEventListener("input", (event) => {
    if (event.target.matches(".marketplace-header input.searchbar-bar")) {
      nativeEvents++;
      assert.equal(event.defaultPrevented, false);
    }
  });
  await boot(window, bundle);
  for (const { card, list } of originals)
    card.querySelector(`button[data-list="${list}"]`).click();
  await settle(window);
  const open = (index) =>
    document.querySelectorAll(".marketfavs-navigation button")[index].click();
  const input = () =>
    document.querySelector(".marketplace-header input.searchbar-bar");
  const search = async (value, event = "input") => {
    input().value = value;
    input().dispatchEvent(new window.Event(event, { bubbles: true }));
    await settle(window);
  };
  const groups = () => [
    ...document.querySelectorAll(".marketfavs-saved-group"),
  ];
  const names = (group) =>
    [...group.querySelectorAll(".main-cardHeader-text")].map(
      (card) => card.textContent.split(" ")[0],
    );
  return {
    window,
    document,
    open,
    input,
    search,
    groups,
    names,
    nativeEvents: () => nativeEvents,
  };
}

test("native search filters both saved lists by title, author and description while retaining sort and groups", async (t) => {
  const f = await fixture(t);
  const before = f.window.localStorage.getItem(storageKey);
  const originalInput = f.input();
  for (const list of [0, 1]) {
    f.open(list);
    originalInput.focus();
    for (const [query, expected] of [
      ["  aLpHa  ", ["Alpha"]],
      ["OTHER WRITER", ["Bravo"]],
      ["special details", ["Charlie"]],
      ["", ["Charlie", "Bravo", "Alpha"]],
    ]) {
      await f.search(query);
      assert.deepEqual(
        f.groups().map((g) => g.querySelector("h2").textContent),
        ["Extensions", "Themes", "Snippets", "Apps"],
      );
      for (const group of f.groups())
        assert.deepEqual(f.names(group), expected);
      assert.equal(f.input(), originalInput);
      assert.equal(f.document.activeElement, originalInput);
      assert.equal(originalInput.value, query);
      assert.equal(
        f.document.querySelector(".marketfavs-saved-view").hidden,
        false,
      );
    }
    await f.search("Alpha extension");
    assert.deepEqual(
      f.groups().map((g) => g.querySelector("h2").textContent),
      ["Extensions"],
    );
    await f.search("no matching card");
    assert.equal(f.groups().length, 0);
    const empty = f.document.querySelector(".marketfavs-saved-view > p");
    assert.equal(empty.hidden, false);
    assert.equal(empty.textContent, "No matching items.");
    await f.search("   ", "change");
    assert.equal(f.groups().length, 4);
    assert.equal(empty.hidden, true);
  }
  assert.equal(f.nativeEvents(), 12);
  assert.equal(f.window.localStorage.getItem(storageKey), before);
});

test("search reads the current header on entry and replacement and stays scoped to saved views", async (t) => {
  const f = await fixture(t);
  const before = f.window.localStorage.getItem(storageKey);
  f.input().value = "Alpha";
  f.open(0);
  for (const group of f.groups()) assert.deepEqual(f.names(group), ["Alpha"]);
  f.open(1);
  for (const group of f.groups()) assert.deepEqual(f.names(group), ["Alpha"]);
  const header = f.document.querySelector(".marketplace-header");
  const replacement = header.cloneNode(true);
  replacement.querySelector("input").value = "special details";
  header.replaceWith(replacement);
  await settle(f.window);
  for (const group of f.groups()) assert.deepEqual(f.names(group), ["Charlie"]);
  const unrelated = f.document.createElement("input");
  unrelated.className = "searchbar-bar";
  f.document.body.append(unrelated);
  unrelated.value = "Bravo";
  unrelated.dispatchEvent(new f.window.Event("input", { bubbles: true }));
  await settle(f.window);
  for (const group of f.groups()) assert.deepEqual(f.names(group), ["Charlie"]);
  f.document
    .querySelector('.marketfavs-saved-view button[data-list="not-interested"]')
    .click();
  await settle(f.window);
  assert.equal(f.groups().length, 3);
  await f.search("");
  assert.equal(f.groups().length, 4);
  assert.equal(
    f.groups()[0].querySelectorAll(".main-cardHeader-text").length,
    2,
  );
  f.document.querySelector(".marketfavs-saved-view > button").click();
  await f.search("Alpha");
  assert.equal(f.document.querySelector(".marketfavs-saved-view").hidden, true);
  assert.equal(f.input().value, "Alpha");
  assert.notEqual(f.window.localStorage.getItem(storageKey), before);
  f.window.dispatchEvent(new f.window.Event("pagehide"));
  await f.search("Bravo");
  assert.equal(f.document.querySelector(".marketfavs-saved-view"), null);
});

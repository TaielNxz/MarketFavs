import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, settle as waitForChanges } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const card = (
  type,
  title,
) => `<div class="main-card-card marketplace-card--${type}">
  <img src="https://example.com/preview.png" />
  <div class="main-card-cardMetadata">
    <a class="main-cardHeader-link" href="https://github.com/example/${type}"><div class="main-cardHeader-text">${title}</div></a>
    <div class="main-cardSubHeader-root">Example author</div>
    <p class="marketplace-card-desc">Example description</p>
    <button class="marketplace-installButton">Install</button>
  </div></div>`;

test("classifies all four card types exclusively, toggles membership and preserves native DOM and actions", async (t) => {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header">
    <li data-tab="Extensions"><a class="marketplace-tabBar-headerItemLink marketplace-tabBar-active">Extensions</a></li>
    </ul></nav><section class="contentSpacing"><header class="marketplace-header"></header>
    <div class="marketplace-content">${["extension", "theme", "snippet", "app"]
      .map(
        (type) =>
          `<div class="marketplace-grid" data-tab="${type === "snippet" ? "Snippets" : "Extensions"}">${card(type, type)}</div>`,
      )
      .join("")}</div></section>`,
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
  const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
  window.localStorage.setItem("unrelated", "preserved");
  const nativeCards = [...document.querySelectorAll(".main-card-card")];
  let installs = 0;
  let opened = 0;
  document.addEventListener("click", () => opened++);
  const nativeInstall = document.querySelector(".marketplace-installButton");
  nativeInstall.addEventListener("click", () => installs++);
  await boot(window, bundle);
  const tabs = [...document.querySelectorAll(".marketfavs-navigation button")];
  const panel = document.querySelector(".marketfavs-saved-view");
  const saved = () => [...panel.querySelectorAll(".main-card-card")];
  for (const original of nativeCards)
    original.querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  for (const original of nativeCards)
    assert.equal(window.getComputedStyle(original).display, "none");
  tabs[0].click();
  await waitForChanges(window);
  assert.equal(saved().length, 4);
  const savedGrid = panel.querySelector(".marketfavs-saved-grid");
  assert.ok(savedGrid.classList.contains("marketplace-grid"));
  assert.ok(savedGrid.classList.contains("main-gridContainer-gridContainer"));
  assert.ok(savedGrid.classList.contains("main-gridContainer-fixedWidth"));
  for (const snapshot of saved()) {
    assert.notEqual(window.getComputedStyle(snapshot).display, "none");
    assert.ok(
      snapshot.querySelector(
        ":scope > .main-card-draggable > .main-card-imageContainer > .main-cardImage-imageWrapper > div > img.main-cardImage-image",
      ),
    );
    assert.ok(
      snapshot.querySelector(
        ":scope > .main-card-draggable > .main-card-cardMetadata > .marketplace-cardSubHeader",
      ),
    );
  }
  assert.equal(panel.querySelector("p").hidden, true);
  assert.deepEqual(
    saved().map(
      (item) => item.querySelector(".main-cardHeader-text").textContent,
    ),
    ["extension", "theme", "snippet", "app"],
  );
  assert.equal(
    saved()[0].querySelector(".marketplace-card-desc").textContent,
    "Example description",
  );
  assert.equal(
    saved()[0].querySelector("img").src,
    "https://example.com/preview.png",
  );
  assert.equal(
    saved()[0].querySelector("a").href,
    "https://github.com/example/extension",
  );
  assert.equal(saved()[0].querySelector(".marketplace-installButton"), null);
  assert.equal(
    nativeCards[0]
      .querySelector('button[aria-label="Favoritos"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  const nativeGrids = nativeCards.map((original) =>
    original.closest(".marketplace-grid"),
  );
  nativeGrids.forEach((grid) => {
    grid.dataset.tab = "Installed";
  });
  await settle();
  for (const original of nativeCards)
    assert.notEqual(window.getComputedStyle(original).display, "none");
  nativeGrids.forEach((grid, index) => {
    grid.dataset.tab = index === 2 ? "Snippets" : "Extensions";
  });
  await settle();
  for (const original of nativeCards)
    assert.equal(window.getComputedStyle(original).display, "none");
  await settle();
  tabs[0].click();
  await waitForChanges(window);
  await settle();
  saved()[0].querySelector('button[aria-label="No me interesa"]').click();
  await waitForChanges(window);
  assert.equal(saved().length, 3);
  tabs[1].click();
  await waitForChanges(window);
  assert.equal(saved().length, 1);
  assert.equal(
    saved()[0].querySelector(".main-cardHeader-text").textContent,
    "extension",
  );
  await settle();
  saved()[0].querySelector('button[aria-label="No me interesa"]').click();
  await waitForChanges(window);
  assert.equal(saved().length, 0);
  assert.equal(panel.querySelector("p").hidden, false);
  assert.notEqual(window.getComputedStyle(nativeCards[0]).display, "none");
  assert.equal(
    nativeCards[0]
      .querySelector('button[aria-label="Favoritos"]')
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    nativeCards[0]
      .querySelector('button[aria-label="No me interesa"]')
      .getAttribute("aria-pressed"),
    "false",
  );
  // Keyboard activation must classify once, without also opening the native card.
  nativeCards[0].querySelector('button[aria-label="Favoritos"]').dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  await waitForChanges(window);
  tabs[0].click();
  await waitForChanges(window);
  assert.equal(saved().length, 4);
  // React can replace a card when changing catalogue categories.
  const originalGrid = nativeCards[0].closest(".marketplace-grid");
  originalGrid.innerHTML = card("extension", "extension");
  await settle();
  const replacement = originalGrid.querySelector(
    'button[aria-label="Favoritos"]',
  );
  assert.equal(replacement.getAttribute("aria-pressed"), "true");
  assert.equal(
    window.getComputedStyle(replacement.closest(".main-card-card")).display,
    "none",
  );
  replacement.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    }),
  );
  await waitForChanges(window);
  assert.equal(saved().length, 3);
  assert.notEqual(
    window.getComputedStyle(replacement.closest(".main-card-card")).display,
    "none",
  );
  replacement.click();
  await waitForChanges(window);
  assert.equal(saved().length, 4);
  assert.equal(
    window.getComputedStyle(replacement.closest(".main-card-card")).display,
    "none",
  );
  assert.equal(
    saved().filter(
      (item) =>
        item.querySelector(".main-cardHeader-text").textContent === "extension",
    ).length,
    1,
  );
  // Saved snapshots survive removal of the source DOM while browsing other categories.
  originalGrid.remove();
  await settle();
  assert.equal(saved().length, 4);
  assert.equal(installs, 0);
  assert.equal(opened, 0);
  for (const original of nativeCards.slice(1)) assert.ok(original.isConnected);
  assert.equal(
    document.querySelectorAll(
      ".marketplace-grid:not(.marketfavs-saved-grid) .main-card-card",
    ).length,
    3,
  );
  nativeInstall.click();
  await waitForChanges(window);
  assert.equal(installs, 1);
  assert.equal(window.localStorage.length, 2);
  assert.equal(window.localStorage.getItem("unrelated"), "preserved");
  await boot(window, bundle);
  await settle();
  for (const original of document.querySelectorAll(
    ".marketplace-grid:not(.marketfavs-saved-grid) .main-card-card",
  )) {
    assert.equal(window.getComputedStyle(original).display, "none");
    assert.equal(original.hasAttribute("data-marketfavs-filtered"), true);
  }
  document.querySelector(".marketfavs-navigation button").click();
  await waitForChanges(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-saved-grid .main-card-card").length,
    4,
  );
  assert.equal(document.querySelectorAll(".marketfavs-navigation").length, 1);
});

test("saved snapshots render catalogue text safely and reject executable links", async (t) => {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
    <section class="contentSpacing"><header class="marketplace-header"></header>
    <div class="marketplace-grid" data-tab="Extensions">${card("extension", "&lt;script&gt;bad()&lt;/script&gt;")}</div></section>`,
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
  document.querySelector(".main-cardHeader-link").href = "javascript:bad()";
  document.querySelector(".marketplace-card-desc").textContent =
    '<img src=x onerror="bad()">';
  await boot(window, bundle);
  document.querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  document.querySelector(".marketfavs-navigation button").click();
  await waitForChanges(window);
  const snapshot = document.querySelector(
    ".marketfavs-saved-grid .main-card-card",
  );
  assert.equal(snapshot.querySelector("script, [onerror], a"), null);
  assert.equal(
    snapshot.querySelector(".main-cardHeader-text").textContent,
    "<script>bad()</script>",
  );
  assert.equal(
    snapshot.querySelector(".marketplace-card-desc").textContent,
    '<img src=x onerror="bad()">',
  );
});

test("both saved lists group cards by type in Marketplace order and update groups when reclassified", async (t) => {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
    <section class="contentSpacing"><header class="marketplace-header"></header>
    ${["app", "snippet", "theme", "extension"]
      .map(
        (type) =>
          `<div class="marketplace-grid" data-tab="${type === "snippet" ? "Snippets" : "Extensions"}">
        ${card(type, `${type} favorite`)}${card(type, `${type} ignored`)}
      </div>`,
      )
      .join("")}</section>`,
    { url: "https://xpui.app.spotify.com", runScripts: "outside-only" },
  );
  const { window } = dom;
  const { document } = window;
  window.console.info = () => {};
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
  const originals = [...document.querySelectorAll(".main-card-card")];
  await boot(window, bundle);
  for (let index = 0; index < originals.length; index++)
    originals[index]
      .querySelector(
        `button[aria-label="${index % 2 === 0 ? "Favoritos" : "No me interesa"}"]`,
      )
      .click();
  await waitForChanges(window);
  const tabs = [...document.querySelectorAll(".marketfavs-navigation button")];
  const panel = document.querySelector(".marketfavs-saved-view");
  const labels = ["Extensions", "Themes", "Snippets", "Apps"];
  const types = ["extension", "theme", "snippet", "app"];
  const groups = () => [...panel.querySelectorAll(".marketfavs-saved-group")];
  for (const [index, tab] of tabs.entries()) {
    tab.click();
    await waitForChanges(window);
    assert.deepEqual(
      groups().map((group) => group.querySelector("h2").textContent),
      labels,
    );
    groups().forEach((group, position) => {
      const heading = group.firstElementChild;
      assert.equal(heading.tagName, "H2");
      assert.equal(heading.className, "marketplace-card-type-heading");
      const grid = heading.nextElementSibling;
      assert.ok(grid.classList.contains("marketplace-grid"));
      assert.equal(grid.querySelectorAll(".main-card-card").length, 1);
      assert.equal(
        grid.querySelector(".main-cardHeader-text").textContent,
        `${types[position]} ${index === 0 ? "favorite" : "ignored"}`,
      );
    });
  }
  await settle();
  groups()[0].querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  assert.deepEqual(
    groups().map((group) => group.querySelector("h2").textContent),
    labels.slice(1),
  );
  tabs[0].click();
  await waitForChanges(window);
  assert.equal(groups()[0].querySelectorAll(".main-card-card").length, 2);
  assert.equal(groups()[0].querySelector("h2").textContent, "Extensions");
  await settle();
  groups()[0].querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  assert.equal(groups()[0].querySelectorAll(".main-card-card").length, 1);
  for (const original of originals) assert.ok(original.isConnected);
});

test("favorites preserve and refresh native installed styling without changing classification", async (t) => {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
    <section class="contentSpacing"><header class="marketplace-header"></header>
    <div class="marketplace-grid" data-tab="Extensions">${card("extension", "Installed favorite")}${card("extension", "Other favorite")}</div></section>`,
    { url: "https://xpui.app.spotify.com", runScripts: "outside-only" },
  );
  const { window } = dom;
  const { document } = window;
  window.console.info = () => {};
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));
  const [original, other] = [...document.querySelectorAll(".main-card-card")];
  original.classList.add("marketplace-card--installed");
  original
    .querySelector(".main-card-cardMetadata")
    .insertAdjacentHTML(
      "beforeend",
      '<div class="marketplace-card__bottom-meta main-type-mestoBold">✓ Installed</div>',
    );
  await boot(window, bundle);
  original.querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  other.querySelector('button[aria-label="Favoritos"]').click();
  await waitForChanges(window);
  const favorites = document.querySelector(".marketfavs-navigation button");
  favorites.click();
  await waitForChanges(window);
  const saved = () => [
    ...document.querySelectorAll(".marketfavs-saved-grid .main-card-card"),
  ];
  assert.equal(
    saved()[0].classList.contains("marketplace-card--installed"),
    true,
  );
  assert.equal(
    saved()[0].querySelector(".marketplace-card__bottom-meta").textContent,
    "✓ Installed",
  );
  assert.equal(
    saved()[1].classList.contains("marketplace-card--installed"),
    false,
  );
  assert.equal(
    saved()[1].querySelector(".marketplace-card__bottom-meta"),
    null,
  );
  original.querySelector(".marketplace-card__bottom-meta").remove();
  original.classList.remove("marketplace-card--installed");
  await settle();
  assert.equal(saved().length, 2);
  assert.equal(
    saved()[0].classList.contains("marketplace-card--installed"),
    false,
  );
  assert.equal(
    saved()[0].querySelector(".marketplace-card__bottom-meta"),
    null,
  );
  // A class-only native update must also refresh Favorites without a DOM replacement.
  original.classList.add("marketplace-card--installed");
  await settle();
  assert.equal(
    saved()[0].classList.contains("marketplace-card--installed"),
    true,
  );
  assert.equal(
    saved()[0].querySelector(".marketplace-card__bottom-meta").textContent,
    "✓ Installed",
  );
  assert.equal(
    saved()[0]
      .querySelector('button[aria-label="Favoritos"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  original.remove();
  await settle();
  assert.equal(
    saved()[0].classList.contains("marketplace-card--installed"),
    true,
  );
  assert.equal(saved().length, 2);
});

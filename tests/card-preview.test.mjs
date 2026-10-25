import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const card = (type) => `<div class="main-card-card marketplace-card--${type}">
  <div class="main-card-draggable"><div class="main-card-cardMetadata">
    <a href="https://example.com">Example</a>
    <div class="main-card-PlayButtonContainer"><button class="marketplace-installButton">Install</button></div>
  </div></div></div>`;
const grid = (type, tab) =>
  `<div class="marketplace-grid" data-tab="${tab}">${card(type)}</div>`;
const settle = (window) =>
  new Promise((resolve) => window.setTimeout(resolve, 0));

function fixture(t, html) {
  const dom = new JSDOM(html, {
    url: "https://xpui.app.spotify.com",
    runScripts: "outside-only",
  });
  dom.window.console.info = () => {};
  t.after(() => {
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
  });
  return dom.window;
}

test("adds two inert footer buttons to all four catalogue card types and preserves native actions", (t) => {
  const window = fixture(
    t,
    [
      grid("extension", "Extensions"),
      grid("theme", "Themes"),
      grid("snippet", "Snippets"),
      grid("app", "Apps"),
    ].join(""),
  );
  const { document } = window;
  window.localStorage.setItem("unrelated", "preserved");
  let nativeClicks = 0;
  let cardClicks = 0;
  const native = document.querySelector(".marketplace-installButton");
  native.addEventListener("click", () => nativeClicks++);
  document.addEventListener("click", () => cardClicks++);
  window.eval(bundle);

  const cards = document.querySelectorAll(".main-card-card");
  for (const element of cards) {
    const row = element.querySelector(".marketfavs-preview-actions");
    assert.ok(row, element.className);
    assert.equal(row.parentElement.className, "main-card-cardMetadata");
    assert.equal(row, row.parentElement.lastElementChild);
    const buttons = [...row.querySelectorAll("button")];
    assert.deepEqual(
      buttons.map((button) => button.getAttribute("aria-label")),
      ["Favoritos", "No me interesa"],
    );
    for (const button of buttons) {
      assert.equal(button.type, "button");
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.tabIndex, 0);
      button.click();
    }
  }
  assert.equal(nativeClicks, 0);
  assert.equal(cardClicks, 0);
  assert.equal(window.localStorage.length, 1);
  assert.equal(window.localStorage.getItem("unrelated"), "preserved");
  assert.equal(document.querySelector(".marketplace-installButton"), native);
  native.click();
  assert.equal(nativeClicks, 1);
  assert.equal(cardClicks, 1);
});

test("handles added cards, React replacement, reinjection and navigation without duplicate controls", async (t) => {
  const window = fixture(t, grid("extension", "Extensions"));
  const { document } = window;
  window.eval(bundle);
  const currentGrid = document.querySelector(".marketplace-grid");
  currentGrid.insertAdjacentHTML("beforeend", card("extension"));
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-preview-actions").length,
    2,
  );
  currentGrid.querySelector(".marketfavs-preview-actions").remove();
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-preview-actions").length,
    2,
  );
  window.eval(bundle);
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-preview-actions").length,
    2,
  );
  assert.equal(
    document.querySelectorAll("#marketfavs-preview-style").length,
    1,
  );
  currentGrid.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    card("extension") + grid("theme", "Themes"),
  );
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-preview-actions").length,
    1,
  );
  assert.equal(
    document.body.firstElementChild.querySelector(
      ".marketfavs-preview-actions",
    ),
    null,
  );
  window.dispatchEvent(new window.Event("pagehide"));
  document.body.insertAdjacentHTML("beforeend", grid("app", "Apps"));
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-preview-actions").length,
    0,
  );
  assert.equal(document.querySelector("#marketfavs-preview-style"), null);
});

test("excludes Installed snippets whose catalogue provenance cannot be established from DOM", async (t) => {
  const window = fixture(
    t,
    grid("snippet", "Installed") + grid("extension", "Installed"),
  );
  const { document } = window;
  window.eval(bundle);
  assert.equal(
    document.querySelector(
      ".marketplace-card--snippet .marketfavs-preview-actions",
    ),
    null,
  );
  assert.ok(
    document.querySelector(
      ".marketplace-card--extension .marketfavs-preview-actions",
    ),
  );
  const snippetGrid = document.querySelector(".marketplace-grid");
  snippetGrid.dataset.tab = "Snippets";
  await settle(window);
  assert.ok(snippetGrid.querySelector(".marketfavs-preview-actions"));
  snippetGrid.dataset.tab = "Installed";
  await settle(window);
  assert.equal(snippetGrid.querySelector(".marketfavs-preview-actions"), null);
});

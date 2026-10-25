import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const nativeNav = `<nav class="marketplace-tabBar marketplace-tabBar-nav"><ul class="marketplace-tabBar-header">
  <li class="marketplace-tabBar-headerItem" data-tab="Extensions"><a class="marketplace-tabBar-headerItemLink marketplace-tabBar-active" href="##">Extensions</a></li>
  <li class="marketplace-tabBar-headerItem" data-tab="Themes"><a class="marketplace-tabBar-headerItemLink" href="##">Themes</a></li>
</ul></nav>`;
const nativeSection = `<section class="contentSpacing">
  <div class="marketplace-header"><input placeholder="Search" /></div>
  <div class="marketplace-content"><div class="marketplace-grid" data-tab="Extensions">Native cards</div></div>
  <div class="marketplace-footer"><button>Load more</button></div>
</section>`;
const settle = (window) =>
  new Promise((resolve) => window.setTimeout(resolve, 0));

function fixture(t, html = nativeNav + nativeSection) {
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

test("opens Favorites and Not Interesed empty sections and returns to the untouched catalogue", (t) => {
  const window = fixture(t);
  const { document } = window;
  const nativeList = document.querySelector(".marketplace-tabBar-header");
  const header = document.querySelector(".marketplace-header");
  const footer = document.querySelector(".marketplace-footer");
  window.localStorage.setItem("unrelated", "preserved");
  window.eval(bundle);

  const controls = [
    ...document.querySelectorAll(".marketfavs-navigation button"),
  ];
  assert.deepEqual(
    controls.map((button) => button.textContent),
    ["Favorites", "Not Interesed"],
  );
  assert.equal(
    document.querySelector(".marketplace-tabBar-header"),
    nativeList,
  );
  assert.equal(nativeList.children.length, 2);
  const panel = document.querySelector(".marketfavs-saved-view");
  assert.equal(panel.hidden, true);
  for (const button of controls) {
    assert.equal(button.type, "button");
    button.click();
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelector("h2").textContent, button.textContent);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(window.getComputedStyle(header).display, "none");
    assert.equal(window.getComputedStyle(footer).display, "none");
    assert.ok(panel.querySelector("p").textContent.length > 0);
  }
  panel.querySelector("button").click();
  assert.equal(panel.hidden, true);
  assert.notEqual(window.getComputedStyle(header).display, "none");
  assert.notEqual(window.getComputedStyle(footer).display, "none");
  assert.equal(document.querySelector(".marketplace-header"), header);
  assert.equal(document.querySelector(".marketplace-footer"), footer);
  assert.equal(window.localStorage.length, 1);
  assert.equal(window.localStorage.getItem("unrelated"), "preserved");
});

test("preserves the selected view across native category changes and follows navigation replacement", async (t) => {
  const window = fixture(t);
  const { document } = window;
  let nativeClicks = 0;
  const nativeLink = document.querySelector('[data-tab="Themes"] a');
  nativeLink.addEventListener("click", (event) => {
    event.preventDefault();
    nativeClicks++;
    document
      .querySelector(".marketplace-grid")
      .setAttribute("data-tab", "Themes");
    document.querySelector(".marketplace-content").textContent = "Theme cards";
  });
  window.eval(bundle);
  document.querySelector(".marketfavs-navigation button").click();
  nativeLink.click();
  await settle(window);
  assert.equal(nativeClicks, 1);
  assert.equal(
    document.querySelector(".marketfavs-saved-view h2").textContent,
    "Favorites",
  );
  assert.equal(document.querySelector(".marketfavs-saved-view").hidden, false);
  const movingNav = document.querySelector(".marketplace-tabBar-nav");
  movingNav.remove();
  await settle(window);
  assert.equal(
    document.querySelector(".marketfavs-saved-view h2").textContent,
    "Favorites",
  );
  document.body.prepend(movingNav);
  await settle(window);
  assert.equal(
    document.querySelector('.marketfavs-navigation [aria-pressed="true"]')
      .textContent,
    "Favorites",
  );
  document.querySelector(".marketplace-tabBar-nav").outerHTML = nativeNav;
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-navigation button").length,
    2,
  );
  assert.equal(
    document.querySelector('.marketfavs-navigation [aria-pressed="true"]')
      .textContent,
    "Favorites",
  );
  window.eval(bundle);
  await settle(window);
  assert.equal(document.querySelectorAll(".marketfavs-navigation").length, 1);
  assert.equal(
    document.querySelectorAll("#marketfavs-navigation-style").length,
    1,
  );
  window.dispatchEvent(new window.Event("pagehide"));
  assert.equal(document.querySelector(".marketfavs-navigation"), null);
  assert.equal(document.querySelector(".marketfavs-saved-view"), null);
  assert.equal(document.querySelector("[data-marketfavs-saved-view]"), null);
  assert.equal(document.querySelector(".marketfavs-navigation-host"), null);
  assert.equal(
    document.querySelectorAll(".marketplace-tabBar-headerItem").length,
    2,
  );
});

test("mounts only with Marketplace navigation and content, then cleans up when leaving", async (t) => {
  const window = fixture(
    t,
    '<section class="contentSpacing"><h2>Other Spotify page</h2></section>',
  );
  const { document } = window;
  const otherPage = document.querySelector("section");
  window.eval(bundle);
  assert.equal(document.querySelector(".marketfavs-navigation"), null);
  document.body.insertAdjacentHTML("beforeend", nativeNav + nativeSection);
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-navigation button").length,
    2,
  );
  document.querySelector(".marketfavs-navigation button").click();
  assert.notEqual(window.getComputedStyle(otherPage).display, "none");
  document.querySelector(".marketplace-header").closest("section").remove();
  document.querySelector(".marketplace-tabBar-nav").remove();
  await settle(window);
  assert.equal(document.querySelector(".marketfavs-navigation"), null);
  assert.equal(document.querySelector(".marketfavs-saved-view"), null);
  document.body.insertAdjacentHTML("beforeend", nativeNav + nativeSection);
  await settle(window);
  assert.equal(
    document.querySelectorAll(".marketfavs-navigation button").length,
    2,
  );
  assert.equal(document.querySelector(".marketfavs-saved-view").hidden, true);
});

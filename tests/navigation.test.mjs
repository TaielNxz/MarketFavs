import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const nativeNav = `<nav class="marketplace-tabBar marketplace-tabBar-nav"><ul class="marketplace-tabBar-header">
  <li class="marketplace-tabBar-headerItem" data-tab="Extensions"><a aria-current="page" class="marketplace-tabBar-headerItemLink marketplace-tabBar-active" href="##">Extensions</a></li>
  <li class="marketplace-tabBar-headerItem" data-tab="Themes"><a aria-current="page" class="marketplace-tabBar-headerItemLink" href="##">Themes</a></li>
  <li class="marketplace-tabBar-headerItem" data-tab="Snippets"><a aria-current="page" class="marketplace-tabBar-headerItemLink" href="##">Snippets</a></li>
  <li class="marketplace-tabBar-headerItem" data-tab="Apps"><a aria-current="page" class="marketplace-tabBar-headerItemLink" href="##">Apps</a></li>
  <li class="marketplace-tabBar-headerItem" data-tab="Installed"><a aria-current="page" class="marketplace-tabBar-headerItemLink" href="##">Installed</a></li>
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
  assert.equal(nativeList.children.length, 5);
  assert.equal(nativeList.lastElementChild.dataset.tab, "Installed");
  assert.equal(
    nativeList.nextElementSibling,
    document.querySelector(".marketfavs-navigation"),
  );
  const panel = document.querySelector(".marketfavs-saved-view");
  assert.equal(panel.hidden, true);
  for (const button of controls) {
    assert.equal(button.type, "button");
    button.click();
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelector("h2").textContent, button.textContent);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(button.getAttribute("aria-current"), "page");
    assert.equal(
      document.querySelectorAll(".marketplace-tabBar-active").length,
      1,
    );
    assert.equal(
      document.querySelectorAll('.marketplace-tabBar-nav [aria-current="page"]')
        .length,
      1,
    );
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

test("native tabs leave either saved section with exactly one active tab and preserve native callbacks", async (t) => {
  const window = fixture(t);
  const { document } = window;
  let nativeClicks = 0;
  for (const link of document.querySelectorAll(
    ".marketplace-tabBar-header a",
  )) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      nativeClicks++;
      document
        .querySelectorAll(".marketplace-tabBar-header a")
        .forEach((native) =>
          native.classList.remove("marketplace-tabBar-active"),
        );
      link.classList.add("marketplace-tabBar-active");
      document.querySelector(".marketplace-grid").dataset.tab =
        link.parentElement.dataset.tab;
    });
  }
  window.eval(bundle);
  const controls = [
    ...document.querySelectorAll(".marketfavs-navigation button"),
  ];
  for (const own of controls) {
    for (const category of [
      "Extensions",
      "Themes",
      "Snippets",
      "Apps",
      "Installed",
    ]) {
      own.click();
      const native = document.querySelector(`[data-tab="${category}"] a`);
      native.click();
      await settle(window);
      assert.equal(
        document.querySelector(".marketfavs-saved-view").hidden,
        true,
      );
      assert.notEqual(
        window.getComputedStyle(document.querySelector(".marketplace-header"))
          .display,
        "none",
      );
      assert.ok(native.classList.contains("marketplace-tabBar-active"));
      assert.equal(
        document.querySelectorAll(".marketplace-tabBar-active").length,
        1,
      );
      assert.equal(
        document.querySelectorAll(
          '.marketplace-tabBar-nav [aria-current="page"]',
        ).length,
        1,
      );
      assert.equal(
        document.querySelector('.marketfavs-navigation [aria-pressed="true"]'),
        null,
      );
    }
  }
  assert.equal(nativeClicks, 10);
});

test("native More selection leaves saved sections without intercepting its callback", async (t) => {
  const window = fixture(t);
  const { document } = window;
  const nativeList = document.querySelector(".marketplace-tabBar-header");
  nativeList.querySelector('[data-tab="Installed"]').remove();
  nativeList.insertAdjacentHTML(
    "beforeend",
    '<li class="marketplace-tabBar-headerItem"><div class="Dropdown-root"><div class="Dropdown-control">More</div><div class="Dropdown-menu"><div class="Dropdown-option">Installed</div></div></div></li>',
  );
  let changes = 0;
  document.querySelector(".Dropdown-option").addEventListener("click", () => {
    changes++;
    nativeList
      .querySelectorAll(".marketplace-tabBar-headerItemLink")
      .forEach((link) => link.classList.remove("marketplace-tabBar-active"));
    document.querySelector(".marketplace-grid").dataset.tab = "Installed";
  });
  window.eval(bundle);
  document.querySelector(".marketfavs-navigation button").click();
  document.querySelector(".Dropdown-control").click();
  assert.equal(document.querySelector(".marketfavs-saved-view").hidden, false);
  document.querySelector(".Dropdown-option").click();
  await settle(window);
  assert.equal(changes, 1);
  assert.equal(document.querySelector(".marketfavs-saved-view").hidden, true);
  assert.equal(
    document.querySelectorAll(".marketplace-tabBar-active").length,
    1,
  );
  assert.ok(
    document
      .querySelector(".Dropdown-control")
      .classList.contains("marketplace-tabBar-active"),
  );
});

test("tabs preserve native measured width while aligning after Installed on resize", (t) => {
  const window = fixture(t);
  const { document } = window;
  const nativeList = document.querySelector(".marketplace-tabBar-header");
  let measuredRight = 900;
  nativeList.getBoundingClientRect = () => ({ right: measuredRight });
  nativeList.lastElementChild.getBoundingClientRect = () => ({ right: 450 });
  window.eval(bundle);
  const links = document.querySelector(".marketfavs-navigation");
  const positionedLeft = () =>
    measuredRight +
    Number(links.style.transform.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
  assert.equal(window.getComputedStyle(nativeList).flexGrow, "1");
  assert.equal(positionedLeft(), 450);
  measuredRight = 1200;
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(positionedLeft(), 450);
});

test("More mouse-down selection exits saved sections even before catalogue results arrive", async (t) => {
  const window = fixture(t);
  const { document } = window;
  const nativeList = document.querySelector(".marketplace-tabBar-header");
  nativeList.querySelector('[data-tab="Installed"]').remove();
  nativeList.insertAdjacentHTML(
    "beforeend",
    '<li class="marketplace-tabBar-headerItem"><div class="Dropdown-control">More</div><div class="Dropdown-menu"><div class="Dropdown-option" role="option">Installed</div></div></li>',
  );
  let changes = 0;
  const option = document.querySelector(".Dropdown-option");
  option.addEventListener("mousedown", () => {
    changes++;
    nativeList
      .querySelectorAll(".marketplace-tabBar-headerItemLink")
      .forEach((link) => link.classList.remove("marketplace-tabBar-active"));
    document.querySelector(".marketplace-grid").remove();
    document.querySelector(".Dropdown-menu").remove();
  });
  window.eval(bundle);
  document.querySelector(".marketfavs-navigation button").click();
  option.dispatchEvent(
    new window.MouseEvent("mousedown", { bubbles: true, button: 0 }),
  );
  await settle(window);
  assert.equal(changes, 1);
  assert.equal(document.querySelector(".marketfavs-saved-view").hidden, true);
  assert.equal(
    document.querySelectorAll(".marketplace-tabBar-active").length,
    1,
  );
  assert.ok(
    document
      .querySelector(".Dropdown-control")
      .classList.contains("marketplace-tabBar-active"),
  );
});

test("preserves saved selection through navigation replacement and disposes cleanly", async (t) => {
  const window = fixture(t);
  const { document } = window;
  window.eval(bundle);
  document.querySelector(".marketfavs-navigation button").click();
  await settle(window);
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
    5,
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, mockAccount, settle } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const key = (name) => `marketfavs:state:${encodeURIComponent(name)}`;
const lists = ["favorites", "not-interested"];
const entries = lists.flatMap((list) =>
  ["extension", "theme", "snippet", "app"].map((type) => ({
    list,
    card: {
      key: `${list}-${type}`,
      type,
      title: `Café ${list} ${type}`,
      subtitle: "Author",
      description: "Saved description",
      image: "https://example.com/image.png",
      href: `https://github.com/author/${type}`,
      installed: true,
      installedLabel: "✓ Installed",
      sort: { stars: 12, created: "2026-01-01T00:00:00Z" },
    },
  })),
);
const state = (items = entries, version = 2) =>
  JSON.stringify({
    version,
    entries: items,
    matches: { accepted: [], rejected: [] },
  });

async function fixture(t, raw = state()) {
  const dom = new JSDOM(
    `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"><li data-tab="Extensions"><a class="marketplace-tabBar-headerItemLink marketplace-tabBar-active">Extensions</a></li></ul></nav><section class="contentSpacing"><div class="marketplace-header"><input class="searchbar-bar"></div><div class="marketplace-grid" data-tab="Extensions"></div></section>`,
    {
      url: "https://xpui.app.spotify.com",
      runScripts: "outside-only",
    },
  );
  const window = dom.window;
  window.console.info = () => {};
  const account = mockAccount(window, "private-source-account");
  window.localStorage.setItem(key(account.namespace), raw);
  window.localStorage.setItem(
    key("another-account"),
    state([
      {
        ...entries[0],
        card: { ...entries[0].card, title: "OTHER ACCOUNT SECRET" },
      },
    ]),
  );
  window.localStorage.setItem("native-installations", "unchanged");
  const before = { ...window.localStorage };
  const blobs = [],
    clicks = [],
    revoked = [];
  window.URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return `blob:export-${blobs.length}`;
  };
  window.URL.revokeObjectURL = (url) => revoked.push(url);
  window.HTMLAnchorElement.prototype.click = function () {
    clicks.push({
      filename: this.download,
      href: this.href,
      attached: this.isConnected,
    });
  };
  await boot(window, bundle);
  const tabs = window.document.querySelectorAll(
    ".marketfavs-navigation button",
  );
  tabs[0].click();
  await settle(window);
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  const text = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  return {
    window,
    account,
    before,
    blobs,
    clicks,
    revoked,
    tabs,
    text,
    button: () => window.document.querySelector(".marketfavs-export"),
  };
}

test("exports complete portable JSON from either list despite search filtering, without account or installation state", async (t) => {
  const f = await fixture(t);
  const input = f.window.document.querySelector(".searchbar-bar");
  input.value = "no cards match";
  input.dispatchEvent(new f.window.Event("input", { bubbles: true }));
  for (const tab of f.tabs) {
    tab.click();
    assert.ok(f.button(), "saved views expose Export lists");
    f.button().click();
    const blob = f.blobs.at(-1);
    assert.equal(blob.type, "application/json;charset=utf-8");
    const content = await f.text(blob);
    const data = JSON.parse(content);
    assert.deepEqual(Object.keys(data), [
      "format",
      "version",
      "lists",
      "matches",
    ]);
    assert.equal(data.format, "marketfavs");
    assert.equal(data.version, 1);
    for (const list of lists) {
      assert.deepEqual(
        data.lists[list],
        entries
          .filter((entry) => entry.list === list)
          .map(({ card: { installed, installedLabel, ...card } }) => card),
      );
    }
    assert.deepEqual(data.matches, { accepted: [], rejected: [] });
    assert.ok(!content.includes("private-source-account"));
    assert.ok(!content.includes("OTHER ACCOUNT SECRET"));
    assert.ok(!content.includes("installed"));
    assert.deepEqual({ ...f.window.localStorage }, f.before);
    assert.equal(f.clicks.at(-1).filename, "marketfavs-lists.json");
    assert.equal(f.clicks.at(-1).attached, true);
    await settle(f.window);
  }
  assert.equal(f.revoked.length, 2);
  assert.equal(f.window.document.querySelectorAll("a[download]").length, 0);
});

test("exports empty and legacy lists without rewriting stored bytes", async (t) => {
  for (const items of [
    [],
    [
      {
        ...entries[0],
        card: Object.fromEntries(
          Object.entries(entries[0].card).filter(([field]) => field !== "sort"),
        ),
      },
    ],
  ]) {
    const f = await fixture(t, state(items, 1));
    assert.ok(f.button());
    f.button().click();
    const data = JSON.parse(await f.text(f.blobs[0]));
    assert.equal(data.lists.favorites.length, items.length);
    assert.deepEqual(data.lists["not-interested"], []);
    assert.deepEqual({ ...f.window.localStorage }, f.before);
  }
});

test("blocks exports for invalid data, account invalidation, detached views and disposed controls", async (t) => {
  const damaged = await fixture(t, "{broken");
  assert.ok(damaged.button());
  assert.equal(damaged.button().disabled, true);
  damaged.button().dispatchEvent(new damaged.window.Event("click"));
  assert.equal(damaged.blobs.length, 0);
  const f = await fixture(t);
  const button = f.button();
  f.account.namespace = "another-account";
  button.click();
  assert.equal(f.blobs.length, 0);
  f.window.dispatchEvent(new f.window.Event("focus"));
  await settle(f.window);
  assert.equal(f.button().disabled, true);
  assert.deepEqual({ ...f.window.localStorage }, f.before);
  f.window.dispatchEvent(new f.window.Event("pagehide"));
  button.dispatchEvent(new f.window.Event("click"));
  assert.equal(f.blobs.length, 0);
});

test("download failure preserves all data, cleans resources and permits retry", async (t) => {
  const f = await fixture(t);
  assert.ok(f.button());
  const click = f.window.HTMLAnchorElement.prototype.click;
  f.window.HTMLAnchorElement.prototype.click = () => {
    throw new Error("download failed");
  };
  f.button().click();
  assert.match(
    f.window.document.querySelector(".marketfavs-export-status").textContent,
    /could not export/i,
  );
  await settle(f.window);
  assert.equal(f.revoked.length, 1);
  assert.equal(f.window.document.querySelectorAll("a[download]").length, 0);
  assert.deepEqual({ ...f.window.localStorage }, f.before);
  f.window.HTMLAnchorElement.prototype.click = click;
  f.button().click();
  assert.equal(f.clicks.length, 1);
  assert.equal(
    f.window.document.querySelector(".marketfavs-export-status").textContent,
    "Download started.",
  );
});

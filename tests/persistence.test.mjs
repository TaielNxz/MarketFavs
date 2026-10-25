import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, mockAccount, settle } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const key = (account = "test-user") =>
  `marketfavs:state:${encodeURIComponent(account)}`;
const html = `<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav>
<section class="contentSpacing"><header class="marketplace-header"></header>
<div class="marketplace-grid" data-tab="Extensions"><div class="main-card-card marketplace-card--extension">
<div class="main-card-cardMetadata"><a class="main-cardHeader-link" href="https://github.com/example/card"><div class="main-cardHeader-text">Saved example</div></a><p class="marketplace-card-desc">Description</p></div>
</div></div></section>`;

function fixture(t, markup = html) {
  const dom = new JSDOM(markup, {
    url: "https://xpui.app.spotify.com",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.console.info = () => {};
  const account = mockAccount(window);
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  return { window, document: window.document, account };
}
const button = (document, label) =>
  document.querySelector(
    `.marketplace-grid:not(.marketfavs-saved-grid) button[aria-label="${label}"]`,
  );
const open = (document, index = 0) =>
  document.querySelectorAll(".marketfavs-navigation button")[index].click();
const saved = (document) =>
  document.querySelectorAll(".marketfavs-saved-grid .main-card-card");

test("persists classifications and metadata across reinjection and a fresh document without catalogue cards", async (t) => {
  const { window, document } = fixture(t);
  window.localStorage.setItem("unrelated", "untouched");
  await boot(window, bundle);
  assert.equal(window.localStorage.getItem(key()), null);
  button(document, "Favoritos").click();
  await settle(window);
  const raw = window.localStorage.getItem(key());
  assert.ok(raw);
  assert.equal(JSON.parse(raw).version, 1);
  await boot(window, bundle);
  open(document);
  assert.equal(saved(document).length, 1);
  assert.equal(window.localStorage.getItem("unrelated"), "untouched");
  const fresh = fixture(
    t,
    html.replace(
      /<div class="marketplace-grid"[\s\S]*<\/section>/,
      "</section>",
    ),
  );
  fresh.window.localStorage.setItem(key(), raw);
  await boot(fresh.window, bundle);
  open(fresh.document);
  assert.equal(saved(fresh.document).length, 1);
  assert.equal(
    saved(fresh.document)[0].querySelector(".main-cardHeader-text").textContent,
    "Saved example",
  );
  assert.equal(
    saved(fresh.document)[0].querySelector(".marketplace-card-desc")
      .textContent,
    "Description",
  );
});

test("failed writes preserve stored and visible classification and Retry repeats the intended change", async (t) => {
  const { window, document } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  const before = window.localStorage.getItem(key());
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = prototype.setItem;
  prototype.setItem = function (name, value) {
    if (name.startsWith("marketfavs:")) throw new Error("quota");
    return original.call(this, name, value);
  };
  open(document);
  await settle(window);
  document
    .querySelector('.marketfavs-saved-grid button[aria-label="No me interesa"]')
    .click();
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), before);
  assert.equal(saved(document).length, 1);
  assert.equal(
    saved(document)[0]
      .querySelector('button[aria-label="Favoritos"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  const retry = document.querySelector(".marketfavs-retry");
  assert.ok(retry && !retry.hidden);
  prototype.setItem = original;
  retry.click();
  await settle(window);
  assert.equal(saved(document).length, 0);
  open(document, 1);
  assert.equal(saved(document).length, 1);
  assert.notEqual(window.localStorage.getItem(key()), before);
});

test("corrupt and unsupported stored data remain byte-for-byte intact with editing blocked", async (t) => {
  for (const raw of ["{broken", '{"version":99,"entries":[]}']) {
    const { window, document } = fixture(t);
    window.localStorage.setItem(key(), raw);
    await boot(window, bundle);
    assert.equal(button(document, "Favoritos").disabled, true);
    button(document, "Favoritos").click();
    await settle(window);
    assert.equal(window.localStorage.getItem(key()), raw);
    open(document);
    assert.equal(saved(document).length, 0);
    assert.match(
      document.querySelector(".marketfavs-status").textContent,
      /incompatible|damaged/i,
    );
  }
});

test("unknown or mismatched accounts cannot read or modify saved data and can recover after identity matches", async (t) => {
  const { window, document, account } = fixture(t);
  account.username = "other-user";
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = prototype.getItem;
  let reads = 0;
  prototype.getItem = function (name) {
    if (name.startsWith("marketfavs:")) reads++;
    return original.call(this, name);
  };
  await boot(window, bundle);
  assert.equal(reads, 0);
  assert.equal(button(document, "Favoritos").disabled, true);
  account.username = "test-user";
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  assert.equal(button(document, "Favoritos").disabled, false);
  button(document, "Favoritos").click();
  await settle(window);
  assert.ok(window.localStorage.getItem(key()));
  prototype.getItem = original;
});

test("account changes reject stale pending writes and keep both accounts separate", async (t) => {
  const { window, document, account } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  const original = window.localStorage.getItem(key());
  let release;
  window.Spicetify.Platform.UserAPI.getUser = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  button(document, "No me interesa").click();
  await Promise.resolve();
  account.username = account.namespace = "second-user";
  window.Spicetify.Platform.UserAPI.getUser = async () => ({
    username: account.username,
  });
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  open(document);
  assert.equal(saved(document).length, 0);
  release({ username: "test-user" });
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), original);
  assert.equal(window.localStorage.getItem(key("second-user")), null);
  button(document, "No me interesa").click();
  await settle(window);
  assert.ok(window.localStorage.getItem(key("second-user")));
  account.username = account.namespace = "test-user";
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  open(document);
  assert.equal(saved(document).length, 1);
});

test("disposed instances never complete a pending storage write", async (t) => {
  const { window, document } = fixture(t);
  await boot(window, bundle);
  let release;
  window.Spicetify.Platform.UserAPI.getUser = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  button(document, "Favoritos").click();
  await Promise.resolve();
  window.dispatchEvent(new window.Event("pagehide"));
  release({ username: "test-user" });
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), null);
});

test("returning to the original account cannot revive an obsolete pending operation", async (t) => {
  const { window, document, account } = fixture(t);
  await boot(window, bundle);
  let release;
  window.Spicetify.Platform.UserAPI.getUser = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  button(document, "Favoritos").click();
  await Promise.resolve();
  account.username = account.namespace = "second-user";
  window.Spicetify.Platform.UserAPI.getUser = async () => ({
    username: account.username,
  });
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  // The new account must remain usable even if the old identity request never completes.
  button(document, "No me interesa").click();
  await settle(window);
  assert.ok(window.localStorage.getItem(key("second-user")));
  account.username = account.namespace = "test-user";
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  release({ username: "test-user" });
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), null);
});

test("external edits are reloaded before a queued change can overwrite them", async (t) => {
  const { window, document } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  const external = JSON.parse(window.localStorage.getItem(key()));
  external.entries[0].list = "not-interested";
  const raw = JSON.stringify(external);
  window.localStorage.setItem(key(), raw);
  button(document, "Favoritos").click();
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), raw);
  open(document, 1);
  assert.equal(saved(document).length, 1);
  assert.match(
    document.querySelector(".marketfavs-status").textContent,
    /another window/i,
  );
});

test("malformed entries and duplicate identities reject the entire document", async (t) => {
  const source = fixture(t);
  await boot(source.window, bundle);
  button(source.document, "Favoritos").click();
  await settle(source.window);
  const valid = JSON.parse(source.window.localStorage.getItem(key()));
  for (const mutate of [
    (value) => {
      const invalid = structuredClone(value.entries[0]);
      invalid.card.key = "invalid-sibling";
      invalid.list = ["favorites"];
      value.entries.push(invalid);
    },
    (value) => value.entries.push(value.entries[0]),
    (value) => {
      value.entries[0].card.href = "javascript:alert(1)";
    },
    (value) => {
      value.entries[0].card.installed = "true";
    },
    (value) => {
      value.matches.accepted.push({ unknown: true });
    },
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    const raw = JSON.stringify(value);
    const { window, document } = fixture(t);
    window.localStorage.setItem(key(), raw);
    await boot(window, bundle);
    assert.equal(button(document, "Favoritos").disabled, true);
    assert.equal(window.localStorage.getItem(key()), raw);
  }
});

test("an obsolete conflict reload cannot recreate Retry after an account roundtrip", async (t) => {
  const { window, document, account } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  open(document);
  await settle(window);
  const external = JSON.parse(window.localStorage.getItem(key()));
  external.entries[0].card.description = "External update";
  const raw = JSON.stringify(external);
  window.localStorage.setItem(key(), raw);
  let calls = 0;
  let release;
  window.Spicetify.Platform.UserAPI.getUser = () =>
    ++calls === 1
      ? Promise.resolve({ username: "test-user" })
      : new Promise((resolve) => {
          release = resolve;
        });
  document
    .querySelector('.marketfavs-saved-grid button[aria-label="No me interesa"]')
    .click();
  await settle(window);
  assert.equal(typeof release, "function");
  window.Spicetify.Platform.UserAPI.getUser = async () => ({
    username: account.username,
  });
  account.username = account.namespace = "second-user";
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  account.username = account.namespace = "test-user";
  window.dispatchEvent(new window.Event("focus"));
  await settle(window);
  release({ username: "test-user" });
  await settle(window);
  assert.equal(document.querySelector(".marketfavs-retry").hidden, true);
  assert.equal(window.localStorage.getItem(key()), raw);
});

test("failed installed-state refresh waits for explicit Retry instead of feeding the observer", async (t) => {
  const { window, document } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  open(document);
  await settle(window);
  const raw = window.localStorage.getItem(key());
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = prototype.setItem;
  let writes = 0;
  let identities = 0;
  prototype.setItem = function (name, value) {
    if (name.startsWith("marketfavs:")) {
      writes++;
      throw new Error("quota");
    }
    return original.call(this, name, value);
  };
  // Bound regressions so an observer loop cannot starve the test process.
  window.Spicetify.Platform.UserAPI.getUser = () =>
    ++identities < 5
      ? Promise.resolve({ username: "test-user" })
      : new Promise(() => {});
  document
    .querySelector(
      ".marketplace-grid:not(.marketfavs-saved-grid) .main-card-card",
    )
    .classList.add("marketplace-card--installed");
  await settle(window);
  assert.equal(writes, 1);
  assert.equal(window.localStorage.getItem(key()), raw);
  assert.equal(
    saved(document)[0].classList.contains("marketplace-card--installed"),
    false,
  );
  prototype.setItem = original;
  window.Spicetify.Platform.UserAPI.getUser = async () => ({
    username: "test-user",
  });
  document.querySelector(".marketfavs-retry").click();
  await settle(window);
  assert.equal(
    saved(document)[0].classList.contains("marketplace-card--installed"),
    true,
  );
  assert.equal(
    JSON.parse(window.localStorage.getItem(key())).entries[0].list,
    "favorites",
  );
});

test("slow matching identity is allowed to finish despite repeated polling", async (t) => {
  const { window, document } = fixture(t);
  let poll;
  window.setInterval = (callback) => {
    poll = callback;
    return 0;
  };
  const pending = [];
  window.Spicetify.Platform.UserAPI.getUser = () =>
    new Promise((resolve) => pending.push(resolve));
  await boot(window, bundle);
  poll();
  poll();
  pending[0]({ username: "test-user" });
  await settle(window);
  assert.equal(button(document, "Favoritos").disabled, false);
});

test("focus and visibility revalidation preserve a failed change for the same account", async (t) => {
  const { window, document } = fixture(t);
  await boot(window, bundle);
  button(document, "Favoritos").click();
  await settle(window);
  const before = window.localStorage.getItem(key());
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = prototype.setItem;
  prototype.setItem = function (name, value) {
    if (name.startsWith("marketfavs:")) throw new Error("quota");
    return original.call(this, name, value);
  };
  button(document, "No me interesa").click();
  await settle(window);
  window.dispatchEvent(new window.Event("focus"));
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new window.Event("visibilitychange"));
  await settle(window);
  assert.equal(window.localStorage.getItem(key()), before);
  assert.equal(document.querySelector(".marketfavs-retry").hidden, false);
  prototype.setItem = original;
  document.querySelector(".marketfavs-retry").click();
  await settle(window);
  open(document, 1);
  assert.equal(saved(document).length, 1);
});

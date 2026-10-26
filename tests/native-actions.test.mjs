import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { boot, mockAccount, settle } from "./account-fixture.mjs";

const bundle = await readFile(
  new URL("../dist/marketfavs.js", import.meta.url),
  "utf8",
);
const storageKey = "marketfavs:state:test-user";
const types = ["extension", "theme", "snippet", "app"];
const nativeKey = (type, item) => `${type}:${item.title}`;
const payload = (type) =>
  type === "snippet"
    ? {
        title: "Example snippet",
        code: "body { color: red; }",
        description: "Example",
        imageURL: "https://example.com/image.png",
      }
    : {
        title: `Example ${type}`,
        user: "example",
        repo: type,
        branch: "main",
        manifest: {
          name: `Example ${type}`,
          description: "Example",
          ...(type === "extension"
            ? { main: "extension.js" }
            : type === "theme"
              ? { usercss: "theme.css" }
              : {}),
        },
        imageURL: "https://example.com/image.png",
        extensionURL: `https://raw.githubusercontent.com/example/${type}/main/extension.js`,
        cssURL: `https://raw.githubusercontent.com/example/${type}/main/theme.css`,
        authors: [],
      };
function snapshot(type, installed = false) {
  const title = `Example ${type}`;
  const href =
    type === "snippet"
      ? "https://github.com/spicetify/marketplace/blob/main/resources/snippets.json"
      : `https://github.com/example/${type}`;
  const subtitle = "Example author";
  return {
    key: JSON.stringify([type, href, title, subtitle]),
    type,
    title,
    href,
    subtitle,
    description: "Example",
    image: "https://example.com/image.png",
    installed,
    installedLabel: installed ? "✓ Installed" : "",
  };
}

async function fixture(t, list = "favorites", installed = false) {
  const dom = new JSDOM(
    '<nav class="marketplace-tabBar-nav"><ul class="marketplace-tabBar-header"></ul></nav><section class="contentSpacing"><div class="marketplace-header"></div><div class="marketplace-grid" data-tab="Installed"></div></section>',
    { url: "https://xpui.app.spotify.com", runScripts: "outside-only" },
  );
  const { window } = dom,
    { document } = window;
  window.console.info = () => {};
  const account = mockAccount(window);
  const installedItems = new Map(),
    calls = [],
    fetches = [];
  let mounts = 0,
    roots = 0,
    fail = false,
    operation;
  class Component {
    constructor(props) {
      this.props = props;
    }
    setState(update) {
      this.state = {
        ...this.state,
        ...(typeof update === "function" ? update(this.state) : update),
      };
    }
  }
  class NativeCard extends Component {
    constructor(props) {
      super(props);
      Object.assign(this, props);
      this.state = {};
      this.localStorageKey = nativeKey(props.type, props.item);
    }
    componentDidMount() {
      mounts++;
      throw Error("Automatic refresh must be suppressed");
    }
    isInstalled() {
      return installedItems.has(this.localStorageKey);
    }
    async performButtonAction() {
      calls.push({
        type: this.props.type,
        title: this.props.item.title,
        installed: this.isInstalled(),
        props: this.props,
      });
      if (operation) await operation;
      if (fail) throw Error("Native installation failed");
      if (this.props.type === "app") return;
      if (this.isInstalled()) installedItems.delete(this.localStorageKey);
      else
        installedItems.set(this.localStorageKey, {
          type: this.props.type,
          item: this.props.item,
        });
      this.setState({ installed: this.isInstalled() });
    }
    handleOperationError() {}
    render() {
      return null;
    }
  }
  const NativeWrapper = { WrappedComponent: NativeCard };
  const react = {
    Component,
    createElement: (type, props) => ({ type, props }),
  };
  window.Spicetify.React = react;
  window.Spicetify.ReactComponent = { Menu: () => null };
  window.Spicetify.ReactDOM = {
    createRoot() {
      roots++;
      let instance;
      return {
        render(element) {
          instance = new element.type(element.props);
          element.props.ref?.(instance);
          instance.componentDidMount?.();
        },
        unmount() {
          roots--;
          instance?.componentWillUnmount?.();
        },
      };
    },
  };
  const config = { activeTab: "Installed", visual: {} };
  const grid = {
    BLACKLIST: [],
    CONFIG: config,
    props: { CONFIG: config },
    state: {},
    cardList: [],
    updateColourSchemes() {},
    setActiveTheme() {},
    appendCard(item, type, activeTab) {
      if (activeTab !== this.props.CONFIG.activeTab) return;
      this.cardList.push(
        react.createElement(NativeWrapper, {
          item,
          type,
          CONFIG: this.CONFIG,
          visual: this.props.CONFIG.visual,
          updateColourSchemes: this.updateColourSchemes.bind(this),
          updateActiveTheme: this.setActiveTheme.bind(this),
        }),
      );
    },
    async loadPage(requestId) {
      assert.equal(this.CONFIG.activeTab, "Installed");
      if (this.requestQueue.length > 1 && requestId !== this.requestQueue[0])
        return -1;
      for (const { item, type } of installedItems.values())
        this.appendCard(item, type, "Installed");
      this.setState({ cards: this.cardList });
    },
  };
  document.querySelector(".marketplace-header").__reactFiber$fixture = {
    return: { stateNode: grid },
  };
  const entries = types.map((type) => {
    if (installed && type !== "app")
      installedItems.set(nativeKey(type, payload(type)), {
        type,
        item: payload(type),
      });
    return { card: snapshot(type, installed && type !== "app"), list };
  });
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 2,
      entries,
      matches: { accepted: [], rejected: [] },
    }),
  );
  window.fetch = async (url) => {
    fetches.push(String(url));
    if (String(url).endsWith("/resources/snippets.json"))
      return {
        ok: true,
        json: async () => [
          { ...payload("snippet"), preview: "https://example.com/image.png" },
        ],
      };
    const type = types.find((type) => String(url).includes(`/example/${type}`));
    if (!type) throw Error(`Unexpected fetch ${url}`);
    return {
      ok: true,
      json: async () =>
        String(url).endsWith("/manifest.json")
          ? payload(type).manifest
          : {
              default_branch: "main",
              stargazers_count: 1,
              full_name: `example/${type}`,
            },
    };
  };
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    window.close();
  });
  await boot(window, bundle);
  document
    .querySelectorAll(".marketfavs-navigation button")
    [list === "favorites" ? 0 : 1].click();
  await settle(window);
  const saved = (type) =>
    document.querySelector(`.marketfavs-saved-view .marketplace-card--${type}`);
  const button = (type) =>
    saved(type)?.querySelector(".marketplace-installButton");
  const flush = async () => {
    for (let n = 0; n < 5; n++) await settle(window);
  };
  return {
    window,
    document,
    account,
    grid,
    calls,
    fetches,
    installedItems,
    saved,
    button,
    flush,
    mounts: () => mounts,
    roots: () => roots,
    fail: (value) => (fail = value),
    operation: (value) => (operation = value),
  };
}

test("saved actions install and remove all native types in both lists after source-free reload", async (t) => {
  for (const list of ["favorites", "not-interested"]) {
    const f = await fixture(t, list);
    for (const type of types) {
      assert.ok(f.button(type), `missing saved action for ${type}`);
      f.button(type).click();
      await f.flush();
      assert.equal(f.calls.at(-1)?.type, type);
      if (type === "app") continue;
      assert.equal(f.button(type).getAttribute("aria-label"), "Remove");
      assert.ok(
        f.saved(type).classList.contains("marketplace-card--installed"),
      );
      f.button(type).click();
      await f.flush();
      assert.equal(f.button(type).getAttribute("aria-label"), "Install");
      assert.equal(f.installedItems.has(nativeKey(type, payload(type))), false);
    }
    assert.equal(f.mounts(), 0);
    assert.equal(f.roots(), 0);
    assert.equal(f.grid.cardList.length, 0);
    assert.equal(f.grid.CONFIG.activeTab, "Installed");
    const stored = JSON.parse(f.window.localStorage.getItem(storageKey));
    assert.equal(stored.version, 2);
    assert.equal(stored.entries.length, 4);
    assert.ok(stored.entries.every((entry) => entry.list === list));
  }
});

test("installed metadata allows offline removal and native failures preserve membership for retry", async (t) => {
  const f = await fixture(t, "favorites", true);
  f.window.fetch = async () => {
    throw Error("Offline");
  };
  f.fail(true);
  f.button("extension").click();
  await f.flush();
  assert.equal(f.installedItems.size, 3);
  assert.equal(f.button("extension").disabled, false);
  assert.match(f.saved("extension").textContent, /failed|try again/i);
  f.fail(false);
  f.button("extension").click();
  await f.flush();
  assert.equal(f.button("extension").getAttribute("aria-label"), "Install");
  assert.equal(
    JSON.parse(f.window.localStorage.getItem(storageKey)).entries.length,
    4,
  );
});

test("pending metadata is cancelled on account invalidation and repeated clicks do not duplicate native operations", async (t) => {
  const f = await fixture(t);
  let finish;
  f.operation(new Promise((resolve) => (finish = resolve)));
  f.button("extension").click();
  await f.flush();
  assert.equal(f.button("extension").disabled, true);
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 1);
  finish();
  await f.flush();
  assert.equal(f.calls.length, 1);
  let resolveFetch;
  f.window.fetch = () => new Promise((resolve) => (resolveFetch = resolve));
  f.button("theme").click();
  await settle(f.window);
  f.account.namespace = "another-user";
  f.account.username = "another-user";
  f.window.dispatchEvent(new f.window.Event("focus"));
  await f.flush();
  resolveFetch({ ok: true, json: async () => ({ default_branch: "main" }) });
  await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.window.localStorage.getItem("marketfavs:state:another-user"),
    null,
  );
});

test("network errors and ambiguous snippets preserve legacy bytes and allow retry", async (t) => {
  const f = await fixture(t, "not-interested");
  const legacy = JSON.parse(f.window.localStorage.getItem(storageKey));
  legacy.version = 1;
  const raw = JSON.stringify(legacy);
  f.window.localStorage.setItem(storageKey, raw);
  f.window.dispatchEvent(new f.window.Event("focus"));
  await f.flush();
  const fetch = f.window.fetch;
  f.window.fetch = async () => {
    throw Error("Offline");
  };
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.window.localStorage.getItem(storageKey), raw);
  assert.equal(f.button("extension").disabled, false);
  f.window.fetch = async () => ({
    ok: true,
    json: async () => [
      payload("snippet"),
      { ...payload("snippet"), code: "different code" },
    ],
  });
  f.button("snippet").click();
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.match(f.saved("snippet").textContent, /several|match/i);
  assert.equal(f.window.localStorage.getItem(storageKey), raw);
  f.window.fetch = fetch;
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 1);
  const stored = JSON.parse(f.window.localStorage.getItem(storageKey));
  assert.equal(stored.entries.length, 4);
  assert.ok(stored.entries.every((entry) => entry.list === "not-interested"));
});

test("a stale Install label never removes an item that is already installed", async (t) => {
  const f = await fixture(t);
  f.installedItems.set(nativeKey("extension", payload("extension")), {
    type: "extension",
    item: payload("extension"),
  });
  f.window.fetch = async () => {
    throw Error("Installed lookup must not fetch");
  };
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.button("extension").getAttribute("aria-label"), "Remove");
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].installed, true);
});

test("currently loaded native metadata installs offline without changing the live Grid", async (t) => {
  const f = await fixture(t);
  const item = payload("theme");
  item.tags = ["original"];
  item.include = [];
  const source = { type: f.grid.cardList.type, props: { type: "theme", item } };
  f.grid.cardList.push(source);
  f.window.fetch = async () => {
    throw Error("No network expected");
  };
  f.button("theme").click();
  await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.grid.cardList.length, 1);
  assert.equal(f.grid.cardList[0], source);
  assert.deepEqual(item.tags, ["original"]);
  assert.equal(f.grid.props.CONFIG.activeTab, "Installed");
});

test("disposal cancels ignored-abort metadata promises without late operations or leaked roots", async (t) => {
  const f = await fixture(t);
  let finish;
  f.window.fetch = () => new Promise((resolve) => (finish = resolve));
  f.button("extension").click();
  await settle(f.window);
  f.window.dispatchEvent(new f.window.Event("pagehide"));
  finish({ ok: true, json: async () => ({ default_branch: "main" }) });
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.roots(), 0);
  assert.equal(f.document.querySelector("[data-marketfavs-installer]"), null);
});

test("leaving and returning to Marketplace cannot revive pending metadata in either DOM context", async (t) => {
  for (const context of ["same", "replacement", "immediate"]) {
    const f = await fixture(t);
    const fetch = f.window.fetch;
    let finish;
    f.window.fetch = () => new Promise((resolve) => (finish = resolve));
    f.button("extension").click();
    await settle(f.window);
    const nav = f.document.querySelector("nav"),
      section = f.document.querySelector("section.contentSpacing");
    nav.remove();
    section.remove();
    if (context !== "immediate") await f.flush();
    if (context === "replacement") {
      const nextNav = f.document.createElement("nav");
      nextNav.className = "marketplace-tabBar-nav";
      nextNav.innerHTML = '<ul class="marketplace-tabBar-header"></ul>';
      const nextSection = f.document.createElement("section");
      nextSection.className = "contentSpacing";
      nextSection.innerHTML =
        '<div class="marketplace-header"></div><div class="marketplace-grid" data-tab="Installed"></div>';
      nextSection.querySelector(".marketplace-header").__reactFiber$fixture = {
        return: { stateNode: { ...f.grid, cardList: [] } },
      };
      f.document.body.append(nextNav, nextSection);
    } else f.document.body.append(nav, section);
    await f.flush();
    finish({ ok: true, json: async () => ({ default_branch: "main" }) });
    await f.flush();
    assert.equal(f.calls.length, 0);
    f.window.fetch = fetch;
    f.document.querySelector(".marketfavs-navigation button").click();
    await f.flush();
    f.button("extension").click();
    await f.flush();
    assert.equal(f.calls.length, 1);
    assert.equal(f.roots(), 0);
  }
});

test("Marketplace exclusions prevent new installs without preventing removal", async (t) => {
  for (const pattern of [
    "HTTPS://GITHUB.COM/EXAMPLE/EXTENSION",
    "https://github.com/example/*",
    "https://github.com/*/extension",
  ]) {
    const f = await fixture(t);
    f.grid.BLACKLIST = [pattern];
    const before = f.window.localStorage.getItem(storageKey);
    f.button("extension").click();
    await f.flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.window.localStorage.getItem(storageKey), before);
    assert.match(f.saved("extension").textContent, /excludes|unavailable/i);
    f.installedItems.set(nativeKey("extension", payload("extension")), {
      type: "extension",
      item: payload("extension"),
    });
    f.button("extension").click();
    await f.flush();
    assert.equal(f.button("extension").getAttribute("aria-label"), "Remove");
    f.button("extension").click();
    await f.flush();
    assert.equal(f.calls.length, 1);
    assert.equal(
      f.installedItems.has(nativeKey("extension", payload("extension"))),
      false,
    );
  }
});

test("new installations wait for Marketplace exclusion data and can retry once ready", async (t) => {
  const f = await fixture(t);
  f.grid.BLACKLIST = undefined;
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.match(f.saved("extension").textContent, /still loading/i);
  f.grid.BLACKLIST = [];
  f.button("extension").click();
  await f.flush();
  assert.equal(f.calls.length, 1);
});

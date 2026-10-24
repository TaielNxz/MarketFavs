import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script } from "node:vm";

test("the bundle runs as a standalone browser script without a module loader", async () => {
  const bundleUrl = new URL("../dist/marketfavs.js", import.meta.url);
  const code = await readFile(bundleUrl, "utf8");
  assert.ok(code.trim().length > 0);
  new Script(code, { filename: "marketfavs.js" }).runInNewContext(
    {},
    { timeout: 1000 },
  );

  const map = JSON.parse(await readFile(new URL(`${bundleUrl}.map`), "utf8"));
  assert.equal(map.version, 3);
  assert.ok(map.sources.some((source) => source.endsWith("src/main.ts")));
});

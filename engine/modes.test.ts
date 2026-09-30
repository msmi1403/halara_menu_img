import { test } from "node:test";
import assert from "node:assert/strict";
import { isResinProduct } from "./modes.js";

test("solventless counts as the resin/rosin line even when the box word 'rosin' isn't read", () => {
  // Sep 30 2026: the analyzer read a "1G Rosin" pouch as "solventless All-In-One",
  // which fell through to standard mode and a 90%+ badge on a 78% box.
  assert.ok(isResinProduct("Sour Diesel Runtz", "solventless All-In-One all-in-one"));
  assert.ok(isResinProduct("Gas Nana", "live rosin"));
  assert.ok(!isResinProduct("Blue Dream", "naturally smooth All-In-One"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { boxPercent, boxRatio, preflight } from "./potency.js";
import type { GenerationSettings, ProductMetadata } from "../types.js";

const base: GenerationSettings = {
  aspectRatio: "1:1", imageSize: "1K", numberOfVariants: 1, additionalInstructions: "",
  nyMode: false, resinRosinMode: false, cbdMode: false, batteryMode: false,
};
const meta = (boxPotency: string): ProductMetadata =>
  ({ strainName: "X", fruitFlavor: "", primaryColor: "", secondaryColors: [], notes: "", boxPotency });

test("reads percent and ratio off box text", () => {
  assert.equal(boxPercent("THC 75%"), 75);
  assert.equal(boxPercent("79.6 % TAC"), 79.6);
  assert.equal(boxPercent(""), null);
  assert.equal(boxPercent("94% TAC"), 94);
  assert.equal(boxPercent("THC 75% CBG 3.7% Terps 7.8%"), 78.7); // terps excluded
  assert.equal(boxPercent("THC 77% CBG 4% Terps 7.1%"), 81);
  assert.equal(boxPercent("78% THC 3% CBG"), 81); // labels after the number
  assert.equal(boxPercent("TAC: 81.2%"), 81.2);
  assert.equal(boxRatio("CBD 3:1"), "3:1");
  assert.equal(boxRatio("CBD 20 : 1"), "20:1");
  assert.equal(boxRatio("94% TAC"), null);
});

test("blocks a badge that claims more than the box", () => {
  // Within the 10% legal tolerance: resin stays 80%+ on a 77-79% box.
  assert.equal(preflight(meta("78% TAC"), { ...base, resinRosinMode: true }).problem, null);
  assert.equal(preflight(meta("THC 75% CBG 3.7% Terps 7.8%"), { ...base, resinRosinMode: true }).problem, null);
  // Beyond it: 90%+ on a 75% box is 20% over.
  assert.match(preflight(meta("THC 75%"), base).problem!, /90%/);
  assert.match(preflight(meta("THC 70%"), { ...base, resinRosinMode: true }).problem!, /80%\+/);
  assert.equal(preflight(meta("94% TAC"), base).problem, null);
  assert.equal(preflight(meta("85% TAC"), { ...base, resinRosinMode: true }).problem, null);
  assert.equal(preflight(meta(""), base).problem, null); // nothing printed: nothing to contradict
  assert.equal(preflight(meta("THC 77% CBG 4% Terps 7.1%"), { ...base, resinRosinMode: true }).problem, null);
});

test("takes the CBD ratio from the box; batteries skip the badge entirely", () => {
  const r = preflight(meta("CBD 3:1"), { ...base, cbdMode: true, cbdRatio: "1:1" });
  assert.equal(r.settings.cbdRatio, "3:1");
  assert.equal(r.problem, null);
  assert.equal(preflight(meta("THC 10%"), { ...base, batteryMode: true }).problem, null);
});

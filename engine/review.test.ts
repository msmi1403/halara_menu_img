import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeMatches, normalizeText, imageSize, verdictFor, expectationFor, modeFor, ANY_CBD_RATIO, CHECKS, badgeRedShare, BADGE_MIN_RED_SHARE } from "./review.js";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { GenerationSettings, ProductMetadata } from "../types.js";

const base: GenerationSettings = {
  aspectRatio: "1:1", imageSize: "1K", numberOfVariants: 1, additionalInstructions: "",
  nyMode: false, resinRosinMode: false, cbdMode: false, batteryMode: false,
};
const meta: ProductMetadata = { strainName: "Blue Dream", fruitFlavor: "blueberry", primaryColor: "#6A7FDB", secondaryColors: [], notes: "", strainType: "sativa" };

test("badge text comparison ignores punctuation and case", () => {
  assert.ok(badgeMatches("90%+\nTAC", "90%+ TAC"));
  assert.ok(!badgeMatches("80%+ TAC", "90%+ TAC"));
  assert.ok(!badgeMatches("90%+ THC", "90%+ TAC"));
  assert.ok(!badgeMatches("90% TAC", "90%+ TAC")); // the + is part of the claim
  assert.ok(badgeMatches("", null));
  assert.ok(!badgeMatches("90%+ TAC", null));
  assert.ok(badgeMatches("1:1 CBD", ANY_CBD_RATIO));
  assert.ok(badgeMatches("20:1\nCBD", ANY_CBD_RATIO));
  assert.ok(!badgeMatches("90%+ TAC", ANY_CBD_RATIO));
});

test("strain names compare loosely on spacing and case only", () => {
  assert.equal(normalizeText("Blue  dream"), normalizeText("Blue Dream"));
  assert.notEqual(normalizeText("Blue Dreem"), normalizeText("Blue Dream"));
});

test("expectations follow the prompt's mode precedence and badge rules", () => {
  assert.equal(expectationFor(meta, base).badge, "90%+ TAC");
  assert.equal(expectationFor(meta, { ...base, resinRosinMode: true }).badge, "80%+ TAC");
  assert.match(expectationFor(meta, { ...base, resinRosinMode: true }).outlineColor, /dark red/);
  assert.equal(expectationFor(meta, { ...base, cbdMode: true, cbdRatio: "2:1" }).badge, "2:1 CBD");
  assert.equal(expectationFor(meta, { ...base, batteryMode: true, cbdMode: true }).badge, null);
  assert.equal(modeFor({ ...base, nyMode: true, resinRosinMode: true }), "ny");
  // NY resin keeps the resin badge, same as getBadgeContent in prompts.ts
  assert.equal(expectationFor(meta, { ...base, nyMode: true, resinRosinMode: true }).badge, "80%+ TAC");
});

test("cart boxes are recognised from the printed product line", () => {
  assert.equal(expectationFor({ ...meta, productLine: "High THC Cartridge" }, base).cartBox, true);
  assert.equal(expectationFor({ ...meta, productLine: "All-In-One" }, base).cartBox, false);
});

test("slim-AIO shape rule applies to High THC/CBD AIOs, not carts or resin", () => {
  assert.equal(expectationFor({ ...meta, productLine: "All-In-One" }, base).slimAio, true);
  assert.equal(expectationFor({ ...meta, productLine: "High THC Cartridge" }, base).slimAio, false);
  assert.equal(expectationFor({ ...meta, productLine: "Resin Sauce All-In-One" }, { ...base, resinRosinMode: true }).slimAio, false);
});

test("verdict: any reject-severity failure rejects, flag-only failures flag", () => {
  const all = CHECKS.map(c => ({ ...c, pass: true, reason: "" }));
  assert.equal(verdictFor(all), "pass");
  assert.equal(verdictFor(all.map(c => (c.id === "layout" ? { ...c, pass: false } : c))), "flag");
  assert.equal(verdictFor(all.map(c => (c.id === "badge" ? { ...c, pass: false } : c))), "reject");
});

test("reads PNG and JPEG dimensions from bytes", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1024);
  new DataView(png.buffer).setUint32(20, 768);
  assert.deepEqual(imageSize(png), { width: 1024, height: 768 });
  // SOI, APP0 (len 4), SOF0 with height 512 width 640
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x02, 0x80, 0x03, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg), { width: 640, height: 512 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});

// A 200x200 image, cream everywhere, with the badge disc (house-style spot) in `disc`.
function badgeImage(disc: [number, number, number]): Buffer {
  const size = 200;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inDisc = Math.hypot(x - 0.848 * size, y - 0.152 * size) < 0.1 * size;
      const [r, g, b] = inDisc ? disc : [245, 240, 232];
      const i = (y * size + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test("badge fill: a red disc passes, an inverted cream disc fails, in PNG and JPEG", () => {
  const red = badgeImage([229, 57, 53]);
  const cream = badgeImage([245, 240, 232]);
  assert.ok(badgeRedShare(new Uint8Array(red))! >= BADGE_MIN_RED_SHARE);
  assert.ok(badgeRedShare(new Uint8Array(cream))! < BADGE_MIN_RED_SHARE);
  const asJpeg = (png: Buffer) => { const d = PNG.sync.read(png); return jpeg.encode({ data: d.data, width: d.width, height: d.height }, 95).data; };
  assert.ok(badgeRedShare(new Uint8Array(asJpeg(red)))! >= BADGE_MIN_RED_SHARE);
  assert.ok(badgeRedShare(new Uint8Array(asJpeg(cream)))! < BADGE_MIN_RED_SHARE);
  assert.equal(badgeRedShare(new Uint8Array([0x47, 0x49, 0x46])), null);
  assert.equal(badgeRedShare(new Uint8Array([0xff, 0xd8, 0x00, 0x01])), null); // truncated JPEG
});

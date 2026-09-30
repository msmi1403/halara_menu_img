import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as check } from "../../api/check.js";
import { POST as generate } from "../../api/generate.js";

const req = (body: unknown, password?: string) =>
  new Request("http://x/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(password ? { "x-imagineer-password": password } : {}) },
    body: JSON.stringify(body),
  });

const settings = { aspectRatio: "1:1", imageSize: "1K", numberOfVariants: 1, additionalInstructions: "", nyMode: false, resinRosinMode: false, cbdMode: false, batteryMode: false };

test("fails closed when no password is configured", async () => {
  delete process.env.APP_PASSWORD;
  assert.equal((await check(req({}, "anything"))).status, 401);
});

test("password must match exactly", async () => {
  process.env.APP_PASSWORD = "halara-team";
  assert.equal((await check(req({}))).status, 401);
  assert.equal((await check(req({}, "halara-tea"))).status, 401);
  assert.equal((await check(req({}, "halara-team"))).status, 200);
});

test("generate rejects bad bodies and wrong passwords before any API call", async () => {
  process.env.APP_PASSWORD = "halara-team";
  assert.equal((await generate(req({ meta: {} }, "nope"))).status, 401);
  assert.equal((await generate(req({ meta: {} }, "halara-team"))).status, 400);
});

test("generate refuses a badge that overstates the box, before rendering", async () => {
  process.env.APP_PASSWORD = "halara-team";
  delete process.env.GEMINI_API_KEY; // proves no Gemini call is attempted
  const res = await generate(req({
    image: { data: "AAAA", mimeType: "image/png" },
    meta: { strainName: "Runtz", fruitFlavor: "", primaryColor: "", secondaryColors: [], notes: "", boxPotency: "THC 70%" },
    settings: { ...settings, resinRosinMode: true },
  }, "halara-team"));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).type, "BADGE_OVERSTATES_BOX");
});

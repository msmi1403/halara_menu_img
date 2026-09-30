#!/usr/bin/env -S npx tsx
// Halara Menu Imagineer — command-line front door (used by the Claude skill).
// Same engine and check list as the web app.
//
//   npx tsx cli/imagineer.ts make <photo> [--state CA|NY|WA] [--variants 3] [--tries 2] [--out DIR]
//                                [--strain-type sativa|hybrid|indica] [--cbd-ratio 1:1] [--mode resin|cbd|battery|ny|standard]
//                                [--name "Strain"] [--potency "78% TAC"] [--form cart|aio] [--instructions "..."] [--allow-badge]
//   Exit 2 = stopped before generating because the badge would claim more than the box.
//   npx tsx cli/imagineer.ts review <candidate> --meta '<json>' [--source <photo>] [--settings '<json>']
//   npx tsx cli/imagineer.ts calibrate [--limit N] [--only high-thc,resin-sauce,...] [--out FILE] [--write-manifest]
//
// Key: GEMINI_API_KEY from the environment, else halara-web/.env.local (same file
// the HalaraMarketing image scripts read). Never printed.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, extname, basename, relative, resolve } from "path";
import { homedir } from "os";
import { GoogleGenAI } from "@google/genai";
import { ProductMetadata, GenerationSettings } from "../types";
import { analyzeProductImage, generateAdImage } from "../engine/gemini";
import { isResinProduct, isCbdProduct, isBatteryProduct } from "../engine/modes";
import { preflight, boxRatio } from "../engine/potency";
import jpeg from "jpeg-js";
import {
  ANY_CBD_RATIO, Expectation, ImageInput, Mode, ReviewResult,
  expectationFor, reviewImage, CHECKS, decodeRgba, Rgba,
} from "../engine/review";

const HALARA_WEB = join(homedir(), "Developer/HalaraMarketing/website/halara-web");
const PRODUCTS_DIR = join(HALARA_WEB, "public/images/products");
const STRAINS_TS = join(HALARA_WEB, "lib/data/strains.ts");
// The answer key: site images confirmed to be in the menu style. Written by
// `calibrate --write-manifest`; the reviewer's style examples come only from here.
const MANIFEST = join(dirname(new URL(import.meta.url).pathname), "../references/approved.json");

// ---------- setup ----------

// The slim AIO's mouthpiece must be exactly as wide as the body. The vision reviewer
// can't judge that (flip-flopped on the same image, Sep 29 and Sep 30 2026), so every
// run writes a side-by-side close-up of the device tops for a human/Claude to check.
// The crop is the house-style device spot: right of centre, upper half.
function writeCapSheet(files: string[], outPath: string): string | null {
  const decoded = files.map(f => decodeRgba(new Uint8Array(readFileSync(f)))).filter((d): d is Rgba => d !== null);
  if (!decoded.length) return null;
  const crops = decoded.filter(d => d.width === decoded[0].width && d.height === decoded[0].height);
  const side = Math.round(0.35 * crops[0].width);
  const sheet = new Uint8Array(side * crops.length * side * 4);
  crops.forEach((img, n) => {
    const x0 = Math.round(0.5 * img.width);
    const y0 = Math.round(0.2 * img.height);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const src = ((y0 + y) * img.width + (x0 + x)) * 4;
        const dst = (y * side * crops.length + n * side + x) * 4;
        sheet.set(img.data.subarray(src, src + 4), dst);
      }
    }
  });
  writeFileSync(outPath, jpeg.encode({ data: sheet, width: side * crops.length, height: side }, 90).data);
  return outPath;
}

function loadKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = join(HALARA_WEB, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^GEMINI_API_KEY=(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  fail("No GEMINI_API_KEY in the environment or halara-web/.env.local");
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const BOOLEAN_FLAGS = new Set(["allow-badge", "write-manifest"]);

function parseArgs(argv: string[]): { pos: string[]; flags: Record<string, string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (BOOLEAN_FLAGS.has(a.slice(2)) || next === undefined || next.startsWith("--")) flags[a.slice(2)] = "true";
      else { flags[a.slice(2)] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) fail(`${name} must be a whole number of 1 or more`);
  return n;
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/png";
}

function readImage(path: string): ImageInput {
  if (!existsSync(path)) fail(`no such file: ${path}`);
  return { data: readFileSync(path).toString("base64"), mimeType: mimeFor(path) };
}

function dataUrlToImage(url: string): ImageInput {
  const m = url.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("generator returned an unexpected image format");
  return { mimeType: m[1], data: m[2] };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// ---------- approved examples (the site's current images) ----------

const MODE_DIRS: Record<Mode, string[]> = {
  standard: ["high-thc"],
  ny: ["high-thc/NY"],
  resin: ["resin-sauce", "solventless"],
  cbd: ["high-cbd"],
  battery: ["batteries"],
};

// Strain images live at {category}/{slug}/{aio|cart}.{png,jpg} or {category}/{STATE}/{slug}/... (same as generate-strain-images.mjs).
function listApproved(dir: string): string[] {
  const root = join(PRODUCTS_DIR, dir);
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root).sort()) {
    const p = join(root, entry);
    if (!statSync(p).isDirectory() || /^[A-Z]{2}$/.test(entry)) continue;
    for (const form of ["aio", "cart"]) {
      const f = ["png", "jpg", "jpeg"].map(ext => join(p, `${form}.${ext}`)).find(existsSync);
      if (f) found.push(f);
    }
  }
  return found;
}

interface ManifestEntry { file: string; mode: Mode }

function loadManifest(): ManifestEntry[] | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")).images as ManifestEntry[]) : null;
}

function examplesFor(mode: Mode, count: number, exclude?: string): ImageInput[] {
  const manifest = loadManifest();
  const candidates = manifest
    ? manifest.filter(e => e.mode === mode).map(e => join(PRODUCTS_DIR, e.file))
    : MODE_DIRS[mode].flatMap(listApproved);
  const pool = candidates.filter(p => p !== exclude && existsSync(p));
  // Spread picks across the list so examples aren't all neighbours.
  const step = Math.max(1, Math.floor(pool.length / Math.max(count, 1)));
  return pool.filter((_, i) => i % step === 0).slice(0, count).map(readImage);
}

interface StrainInfo { name: string; type?: "sativa" | "hybrid" | "indica" }

function loadStrains(): Map<string, StrainInfo> {
  const src = readFileSync(STRAINS_TS, "utf8");
  const out = new Map<string, StrainInfo>();
  const re = /slug:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*type:\s*"([^"]+)"/g;
  for (const m of src.matchAll(re)) {
    const t = m[3].toLowerCase();
    out.set(m[1], { name: m[2], type: ["sativa", "hybrid", "indica"].includes(t) ? (t as StrainInfo["type"]) : undefined });
  }
  return out;
}

// ---------- settings ----------

function baseSettings(): GenerationSettings {
  return {
    aspectRatio: "1:1", imageSize: "1K", numberOfVariants: 1, additionalInstructions: "",
    nyMode: false, resinRosinMode: false, cbdMode: false, batteryMode: false,
  };
}

function settingsFor(meta: ProductMetadata, flags: Record<string, string>): GenerationSettings {
  const s = baseSettings();
  // Same auto-detection the web app runs after analysis, plus what's printed on the box.
  // Box potency only counts toward CBD mode as a ratio: a THC box listing "CBD 0.5%"
  // must not flip into CBD mode (that would also skip the potency preflight).
  const printed = `${meta.notes} ${meta.productLine ?? ""}`;
  s.resinRosinMode = isResinProduct(meta.strainName, printed);
  s.cbdMode = isCbdProduct(meta.strainName, printed) || boxRatio(meta.boxPotency) !== null;
  s.batteryMode = isBatteryProduct(meta.strainName, printed);
  const state = (flags.state || "CA").toUpperCase();
  if (state === "NY") s.nyMode = true;
  if (flags.mode) {
    s.resinRosinMode = flags.mode === "resin";
    s.cbdMode = flags.mode === "cbd";
    s.batteryMode = flags.mode === "battery";
    s.nyMode = flags.mode === "ny" || state === "NY";
  }
  if (flags["cbd-ratio"]) s.cbdRatio = flags["cbd-ratio"];
  if (flags.instructions) s.additionalInstructions = flags.instructions;
  return s;
}

function printReview(label: string, r: ReviewResult) {
  const mark = { pass: "PASS", flag: "FLAG", reject: "REJECT" }[r.verdict];
  console.error(`  ${label}: ${mark}  (badge "${r.read.badge}", name "${r.read.hero}")`);
  for (const c of r.checks.filter(c => !c.pass)) console.error(`    x ${c.label}: ${c.reason}`);
}

// ---------- commands ----------

async function cmdMake(ai: GoogleGenAI, pos: string[], flags: Record<string, string>) {
  const photoPath = pos[0] || fail("make needs a photo path");
  const source = readImage(photoPath);
  const variants = positiveInt(flags.variants, 3, "--variants");
  const tries = positiveInt(flags.tries, 2, "--tries");
  const outDir = flags.out || join(dirname(photoPath), `${basename(photoPath, extname(photoPath))}-imagineer`);
  mkdirSync(outDir, { recursive: true });

  console.error(`Reading ${basename(photoPath)}...`);
  const meta = await analyzeProductImage(ai, source.data, source.mimeType);
  if (flags["strain-type"]) meta.strainType = flags["strain-type"] as ProductMetadata["strainType"];
  if (flags.name) meta.strainName = flags.name;
  if (flags.potency) meta.boxPotency = flags.potency;
  // The analyzer names the product line ("resin sauce") but not always the form; the
  // skill knows it from the target file (cart.png vs aio.png), and cart boxes render head-on.
  if (flags.form) {
    if (!["cart", "aio"].includes(flags.form)) fail("--form must be cart or aio");
    meta.productLine = `${meta.productLine ?? ""} ${flags.form === "cart" ? "cartridge" : "all-in-one"}`.trim();
  }
  const checked = preflight(meta, settingsFor(meta, flags));
  const settings = checked.settings;
  const exp = expectationFor(meta, settings);
  console.error(`  ${meta.strainName} (${meta.strainType ?? "type?"}), ${meta.productLine || "line?"}, box "${meta.boxPotency || "no potency"}", mode ${exp.mode}, badge ${exp.badge ?? "none"}`);
  if (checked.problem && !flags["allow-badge"]) {
    console.error(`Stopped before generating: ${checked.problem}. Fix the mode or pass --allow-badge.`);
    console.log(JSON.stringify({ stopped: "badge_overstates_box", problem: checked.problem, meta }));
    process.exit(2);
  }

  const examples = examplesFor(exp.mode, 2);
  // One failed API call costs one attempt, not the whole batch.
  const attempts = await pool(Array.from({ length: variants }, (_, i) => i), 2, async i => {
    let last: { file: string; review: ReviewResult } | null = null;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const file = join(outDir, `v${i + 1}-try${attempt}.png`);
      try {
        const img = dataUrlToImage(await generateAdImage(ai, source.data, meta, settings, source.mimeType));
        writeFileSync(file, Buffer.from(img.data, "base64"));
        const review = await reviewImage(ai, img, exp, { source, examples });
        printReview(basename(file), review);
        last = { file, review };
        if (review.verdict !== "reject") break;
      } catch (e) {
        console.error(`  ${basename(file)}: ERROR ${(e as Error).message}`);
      }
    }
    return last;
  });
  const results = attempts.filter((r): r is { file: string; review: ReviewResult } => r !== null);

  const summary = {
    photo: photoPath, meta, settings, expectation: exp,
    variants: results.map(r => ({ file: r.file, verdict: r.review.verdict, read: r.review.read, checks: r.review.checks })),
  };
  writeFileSync(join(outDir, "review.json"), JSON.stringify(summary, null, 2));
  const usable = results.filter(r => r.review.verdict !== "reject");
  if (exp.slimAio && usable.length) {
    const sheet = writeCapSheet(usable.map(r => r.file), join(outDir, "caps.jpg"));
    if (sheet) console.error(`Mouthpiece close-ups (${usable.map(r => basename(r.file)).join(", ")}, left to right): ${sheet}. Look before showing Malcolm.`);
  }
  const failed = variants - results.length;
  if (failed) console.error(`${failed} variant(s) failed every attempt (see ERROR lines).`);
  const ok = usable.length;
  console.error(`${ok}/${variants} usable. Review: ${join(outDir, "review.json")}`);
  console.log(JSON.stringify({ outDir, usable: ok, variants: summary.variants.map(v => ({ file: v.file, verdict: v.verdict })) }));
}

async function cmdReview(ai: GoogleGenAI, pos: string[], flags: Record<string, string>) {
  const candidatePath = resolve(pos[0] || fail("review needs a candidate image"));
  const candidate = readImage(candidatePath);
  if (!flags.meta) fail("review needs --meta '<json>' (strainName, strainType, boxPotency, ...)");
  const meta = { primaryColor: "", secondaryColors: [], fruitFlavor: "", notes: "", ...JSON.parse(flags.meta) } as ProductMetadata;
  if (!meta.strainName) fail("--meta needs a strainName");
  // Same preflight as make, so a CBD ratio comes from the box, not a 1:1 default.
  const checked = preflight(meta, { ...baseSettings(), ...(flags.settings ? JSON.parse(flags.settings) : {}) } as GenerationSettings);
  if (checked.problem) console.error(`  note: ${checked.problem}`);
  const exp = expectationFor(meta, checked.settings);
  const review = await reviewImage(ai, candidate, exp, {
    source: flags.source ? readImage(flags.source) : undefined,
    examples: examplesFor(exp.mode, 2, candidatePath),
  });
  printReview(basename(candidatePath), review);
  console.log(JSON.stringify(review, null, 2));
}

// Score the site's already-approved images. A check list that fails good images
// isn't fit to judge new ones.
async function cmdCalibrate(ai: GoogleGenAI, flags: Record<string, string>) {
  const strains = loadStrains();
  const only = flags.only ? flags.only.split(",") : null;
  const cases: { path: string; mode: Mode; exp: Expectation }[] = [];

  for (const [mode, dirs] of Object.entries(MODE_DIRS) as [Mode, string[]][]) {
    if (mode === "battery") continue; // battery shots aren't strain images; no hero text to check
    for (const dir of dirs) {
      if (only && !only.includes(dir)) continue;
      for (const path of listApproved(dir)) {
        const slug = basename(dirname(path));
        const info = strains.get(slug);
        if (!info) { console.error(`  skip ${relative(PRODUCTS_DIR, path)}: slug not in strains.ts`); continue; }
        const settings = baseSettings();
        settings.nyMode = mode === "ny";
        settings.resinRosinMode = mode === "resin";
        settings.cbdMode = mode === "cbd";
        const meta: ProductMetadata = {
          // Site names carry an " RS" suffix (resin sauce) that the artwork never shows.
          strainName: info.name.replace(/\s+RS$/, ""), strainType: info.type, fruitFlavor: "", primaryColor: "the product color", secondaryColors: [], notes: "",
        };
        const exp = expectationFor(meta, settings);
        if (mode === "cbd") exp.badge = ANY_CBD_RATIO;
        cases.push({ path, mode, exp });
      }
    }
  }
  const limit = Number(flags.limit || cases.length);
  const picked = cases.slice(0, limit);
  console.error(`Calibrating on ${picked.length} approved images...`);

  const rows = await pool(picked, 4, async c => {
    try {
      const review = await reviewImage(ai, readImage(c.path), c.exp, { examples: examplesFor(c.mode, 1, c.path) });
      printReview(relative(PRODUCTS_DIR, c.path), review);
      return { file: relative(PRODUCTS_DIR, c.path), mode: c.mode, expectation: c.exp, ...review };
    } catch (e) {
      console.error(`  ${relative(PRODUCTS_DIR, c.path)}: ERROR ${(e as Error).message}`);
      return { file: relative(PRODUCTS_DIR, c.path), mode: c.mode, error: (e as Error).message };
    }
  });

  // A plain product photo (no badge, no hero text) isn't a menu image at all.
  const isMenuImage = (r: ReviewResult) => r.read.badge.trim() !== "" || r.read.hero.trim() !== "";
  const reviewed = rows.filter((r): r is typeof r & ReviewResult => "checks" in r);
  const notMenu = reviewed.filter(r => !isMenuImage(r));
  const scored = reviewed.filter(isMenuImage);
  const perCheck = CHECKS.map(def => ({
    check: def.label,
    passRate: scored.length ? scored.filter(r => r.checks.find(c => c.id === def.id)?.pass).length / scored.length : 0,
  }));
  const report = {
    total: rows.length,
    errors: rows.length - reviewed.length,
    notMenuImages: notMenu.map(r => r.file),
    verdicts: { pass: 0, flag: 0, reject: 0, ...Object.fromEntries(["pass", "flag", "reject"].map(v => [v, scored.filter(r => r.verdict === v).length])) },
    perCheck,
    rows,
  };
  if (flags["write-manifest"]) {
    const images = scored.filter(r => r.verdict !== "reject").map(r => ({ file: r.file, mode: r.mode }));
    mkdirSync(dirname(MANIFEST), { recursive: true });
    writeFileSync(MANIFEST, JSON.stringify({ generated: new Date().toISOString(), note: "Site images that passed or only flagged in calibration. Hand-edit to add or remove.", images }, null, 2));
    console.error(`Manifest: ${images.length} approved examples -> ${MANIFEST}`);
  }
  const out = flags.out || "calibration-report.json";
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.error(`\nMenu images scored: ${scored.length}  (skipped ${notMenu.length} plain product photos)`);
  console.error(`Verdicts: ${JSON.stringify(report.verdicts)}  errors: ${report.errors}`);
  for (const p of perCheck) console.error(`  ${p.check.padEnd(28)} ${(p.passRate * 100).toFixed(0)}%`);
  console.error(`Report: ${out}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const ai = new GoogleGenAI({ apiKey: loadKey() });
  if (cmd === "make") return cmdMake(ai, pos, flags);
  if (cmd === "review") return cmdReview(ai, pos, flags);
  if (cmd === "calibrate") return cmdCalibrate(ai, flags);
  fail("usage: imagineer.ts make|review|calibrate  (see header comment)");
}

main().catch(e => fail((e as Error).message));

import { GoogleGenAI, Type } from "@google/genai";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { ProductMetadata, GenerationSettings } from "../types.js";
import { getBadgeContent, getOutlineColor, isCartPackaging, isSlimAio } from "../prompts.js";
import { ANALYZE_MODEL, categorizeError } from "./gemini.js";

// ============================================
// The check list every generated image is scored against.
// Shared by the web app (via the server) and the Claude skill (via the CLI).
// ============================================

export type Mode = "standard" | "ny" | "resin" | "cbd" | "battery";
export type Severity = "reject" | "flag";
export type Verdict = "pass" | "flag" | "reject";

export interface CheckDef {
  id: string;
  label: string;
  severity: Severity;
}

export const CHECKS: CheckDef[] = [
  { id: "product_fidelity", label: "Product matches the photo", severity: "reject" },
  { id: "fine_print", label: "Fine print legible", severity: "flag" },
  { id: "badge", label: "Badge", severity: "reject" },
  { id: "strain_name", label: "Strain name", severity: "reject" },
  { id: "mode_elements", label: "Mode rules", severity: "reject" },
  { id: "background", label: "Background", severity: "flag" },
  { id: "layout", label: "Layout", severity: "flag" },
  { id: "size", label: "Size (square, 1024+)", severity: "flag" },
];

export interface Expectation {
  strainName: string;
  mode: Mode;
  // Exact badge text ("90%+ TAC"), null when no badge is allowed, or "ANY_CBD_RATIO"
  // when the image must carry a ratio badge but the ratio isn't known (calibration).
  badge: string | null;
  outlineColor: string;
  strainType?: "sativa" | "hybrid" | "indica";
  cartBox?: boolean;
  slimAio?: boolean;
}

export const ANY_CBD_RATIO = "ANY_CBD_RATIO";

// Not checked here: the slim AIO's mouthpiece width. Tested Sep 29 2026 — the vision
// reviewer passed a visibly flared cap and flip-flopped on a straight one, with or
// without asking it to measure. The prompt rule (prompts.ts deviceShape) prevents it;
// a human (or Claude, cropping the device) confirms it at the pick.

// Mirrors ACTIVE_GENERATE_PROMPT's precedence: battery > cbd > ny > resin > standard.
export function modeFor(settings: GenerationSettings): Mode {
  if (settings.batteryMode) return "battery";
  if (settings.cbdMode) return "cbd";
  if (settings.nyMode) return "ny";
  if (settings.resinRosinMode) return "resin";
  return "standard";
}

export function expectationFor(meta: ProductMetadata, settings: GenerationSettings): Expectation {
  const mode = modeFor(settings);
  const badgeContent = getBadgeContent(settings);
  const badge = mode === "battery" ? null : `${badgeContent.percent} ${badgeContent.label}`;
  // Battery renders pass no settings to getOutlineColor in prompts.ts; match that.
  const outlineColor = mode === "battery" ? getOutlineColor(meta) : getOutlineColor(meta, settings);
  return { strainName: meta.strainName, mode, badge, outlineColor, strainType: meta.strainType, cartBox: isCartPackaging(meta), slimAio: isSlimAio(meta, settings) };
}

const MODE_RULES: Record<Mode, string> = {
  standard: "Flavor elements (fruit, botanicals, herbs) and watercolor splashes surround the product.",
  ny: "NO fruit, food, or flavor objects anywhere. Only abstract watercolor paint splashes bursting from behind the product.",
  resin: "Stylized cannabis leaves are clearly visible, and golden/amber oil drips appear. Flavor elements and watercolor splashes are allowed.",
  cbd: "Flavor elements (fruit, botanicals, herbs) and watercolor splashes surround the product.",
  battery: "Plain gradient background only. No fruit, no splashes, no decorative objects, no badge.",
};

function badgeRule(badge: string | null): string {
  if (badge === null) return "There must be NO badge of any kind (no THC/TAC/CBD circle).";
  if (badge === ANY_CBD_RATIO) return 'A solid red circle top-right with a cream inner ring, reading a ratio like "1:1" over "CBD".';
  return `A solid red circle top-right with a cream inner ring, reading exactly "${badge}" (first line the number, second line the label).`;
}

function reviewPrompt(exp: Expectation, hasSource: boolean, exampleCount: number): string {
  const order = [
    "Each image above is preceded by its label.",
    hasSource ? "The SOURCE is the real packaging and device." : null,
    exampleCount > 0
      ? `The ${exampleCount} APPROVED EXAMPLE(s) show the target style only; their strain, colors and flavors differ. Never read text from them.`
      : null,
  ].filter(Boolean).join("\n");

  return `You are a strict brand QA reviewer for Halara cannabis vape menu images.
${order}

First TRANSCRIBE exactly what you see in the CANDIDATE (do not correct spelling):
- badge_text: the text inside the badge circle, or "" if there is no badge.
- hero_text: the large script text at the bottom.
- box_strain_text: the strain name printed on the packaging box.

Then judge each check. Be strict: a check passes only if it is clearly right.
- product_fidelity: ${hasSource
    ? "The box and device in the CANDIDATE match the SOURCE photo on everything a shopper reads: logo, strain name, percentages or CBD ratio on the box, product line (e.g. resin sauce, All-In-One), state symbol, device shape and color. Any of those rewritten, changed, or missing is a FAIL. Also FAIL if the badge overstates the box by more than 10% of the box value (an '80%+' badge on a 75-79% box is FINE; '90%+' on a 75% box FAILS), or if a CBD ratio badge differs from the box ratio at all ('1:1' on a 3:1 box FAILS). Ignore tiny fine print here."
    : "The main box text is right and consistent: logo, strain name on the box matches the hero text, the badge does not overstate the box by more than 10% of the box value (an '80%+' badge on a 75-79% box is FINE), and a CBD ratio badge matches the box ratio exactly (if the box prints no percentage or ratio, that part passes). Ignore tiny fine print here."}
- fine_print: The small print on the box (ingredients, weights, taglines) is legible real words, not garbled or invented characters.
- badge: ${badgeRule(exp.badge)}
- strain_name: The hero text reads exactly "${exp.strainName}" (case-insensitive), with a white or light cream fill and a thick outline in ${exp.outlineColor}.
- mode_elements: ${MODE_RULES[exp.mode]}
- background: A smooth vertical gradient from a light tint of the product color at the top to warm cream at the bottom. No streaks, rays, or burst lines in the gradient itself.
- layout: Packaging on the left, device on the right, both fully in frame and not cropped; no outlines drawn around the products. The package shows only its front panel (a visible side panel or 3/4 turn is a FAIL), leaning slightly left; the device leans slightly right. Both standing perfectly vertical is a FAIL.

Return JSON only.`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    badge_text: { type: Type.STRING },
    hero_text: { type: Type.STRING },
    box_strain_text: { type: Type.STRING },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          pass: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
        },
        required: ["id", "pass", "reason"],
      },
    },
  },
  required: ["badge_text", "hero_text", "box_strain_text", "checks"],
};

export interface ImageInput {
  data: string; // base64, no data: prefix
  mimeType: string;
}

export interface CheckResult {
  id: string;
  label: string;
  severity: Severity;
  pass: boolean;
  reason: string;
}

export interface ReviewResult {
  verdict: Verdict;
  checks: CheckResult[];
  read: { badge: string; hero: string; box: string };
  size: { width: number; height: number } | null;
}

// ---------- deterministic helpers ----------

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Badges keep "%", "+" and ":" — "90%" and "90%+" are different claims.
function normalizeBadge(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%+:]/g, "");
}

export function badgeMatches(read: string, expected: string | null): boolean {
  const got = normalizeBadge(read);
  if (expected === null) return got === "";
  if (expected === ANY_CBD_RATIO) return /^\d+:\d+cbd$/.test(got);
  return got === normalizeBadge(expected);
}

export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: IHDR width/height at bytes 16-23, big-endian
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk segments to the first SOF marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + length;
    }
  }
  return null;
}

// Share of solid-red pixels inside the badge, measured at its house-style spot (top
// right, same place in every approved image). The right badge is a red disc with cream
// text: every approved site image scores 0.58+. An inverted one (cream disc, red text)
// scores ~0.2-0.3. The vision reviewer passed inverted badges and failed correct ones
// when asked (Sep 30 2026), so the fill is measured, not judged. null = unreadable.
export const BADGE_MIN_RED_SHARE = 0.45;

export interface Rgba { width: number; height: number; data: Uint8Array }

// PNG or JPEG bytes to RGBA (4 bytes per pixel). null = not an image we can decode.
export function decodeRgba(bytes: Uint8Array): Rgba | null {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) return null;
  try {
    return isPng ? PNG.sync.read(Buffer.from(bytes)) : jpeg.decode(bytes, { useTArray: true });
  } catch {
    return null; // a corrupt file must not throw away the (already paid for) review
  }
}

export function badgeRedShare(bytes: Uint8Array): number | null {
  const decoded = decodeRgba(bytes);
  if (!decoded) return null;
  const { width, height, data } = decoded;
  const cx = 0.848 * width;
  const cy = 0.152 * height;
  const r = 0.066 * width;
  let inside = 0;
  let red = 0;
  for (let y = Math.floor(cy - r); y < cy + r; y += 2) {
    for (let x = Math.floor(cx - r); x < cx + r; x += 2) {
      if (Math.hypot(x - cx, y - cy) >= r) continue;
      const i = (y * width + x) * 4;
      inside++;
      if (data[i] > 170 && data[i + 1] < 90 && data[i + 2] < 90) red++;
    }
  }
  return inside ? red / inside : null;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function verdictFor(checks: CheckResult[]): Verdict {
  if (checks.some(c => !c.pass && c.severity === "reject")) return "reject";
  if (checks.some(c => !c.pass)) return "flag";
  return "pass";
}

// ---------- the review call ----------

export async function reviewImage(
  ai: GoogleGenAI,
  candidate: ImageInput,
  exp: Expectation,
  opts: { source?: ImageInput; examples?: ImageInput[] } = {}
): Promise<ReviewResult> {
  const examples = opts.examples ?? [];
  const labelled: [string, ImageInput][] = [
    ...(opts.source ? [["SOURCE product photo:", opts.source] as [string, ImageInput]] : []),
    ["CANDIDATE (the image to judge; transcribe and judge ONLY this one):", candidate],
    ...examples.map((img, i) => [`APPROVED EXAMPLE ${i + 1} (style reference only, different product):`, img] as [string, ImageInput]),
  ];

  let raw: { badge_text: string; hero_text: string; box_strain_text: string; checks: { id: string; pass: boolean; reason: string }[] };
  try {
    const response = await ai.models.generateContent({
      model: ANALYZE_MODEL,
      contents: {
        parts: [
          ...labelled.flatMap(([label, img]) => [{ text: label }, { inlineData: { data: img.data, mimeType: img.mimeType } }]),
          { text: reviewPrompt(exp, !!opts.source, examples.length) },
        ],
      },
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    raw = JSON.parse(response.text || "{}");
  } catch (error) {
    throw categorizeError(error);
  }

  const byId = new Map((raw.checks || []).map(c => [c.id, c]));
  const candidateBytes = base64ToBytes(candidate.data);
  const size = imageSize(candidateBytes);

  const checks: CheckResult[] = CHECKS.map(def => {
    if (def.id === "size") {
      const ok = !!size && size.width === size.height && size.width >= 1024;
      return { ...def, pass: ok, reason: size ? `${size.width}×${size.height}` : "could not read image size" };
    }
    const judged = byId.get(def.id);
    let pass = judged?.pass ?? false;
    let reason = judged?.reason ?? "reviewer returned no result for this check";
    // The two checks a vision model is most likely to wave through get a hard,
    // code-side comparison against what the model itself transcribed.
    if (def.id === "badge" && !badgeMatches(raw.badge_text || "", exp.badge)) {
      pass = false;
      reason = `badge reads "${raw.badge_text}", expected ${exp.badge === null ? "no badge" : `"${exp.badge}"`}. ${reason}`;
    }
    if (def.id === "badge" && exp.badge !== null) {
      const share = badgeRedShare(candidateBytes);
      if (share === null) {
        reason = `badge fill not measured (image could not be decoded). ${reason}`;
      } else if (share < BADGE_MIN_RED_SHARE) {
        pass = false;
        reason = `badge is not a solid red disc (${Math.round(share * 100)}% red inside, needs ${BADGE_MIN_RED_SHARE * 100}%+); likely inverted, cream fill with red text. ${reason}`;
      }
    }
    if (def.id === "strain_name" && normalizeText(raw.hero_text || "") !== normalizeText(exp.strainName)) {
      pass = false;
      reason = `hero text reads "${raw.hero_text}", expected "${exp.strainName}". ${reason}`;
    }
    return { ...def, pass, reason };
  });

  return {
    verdict: verdictFor(checks),
    checks,
    read: { badge: raw.badge_text || "", hero: raw.hero_text || "", box: raw.box_strain_text || "" },
    size,
  };
}

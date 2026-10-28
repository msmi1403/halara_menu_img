// New-state menu image from an approved site image (Oct 27 2026, the MN launch).
// Redrawing from scratch drifts the scene; editing the approved image keeps it. Two passes:
//   1. swap: replace only the package with the new state's box (hang tab, plain side edge)
//   2. style: low-poly faceted fruit like the box art, cannabis fan leaves, clean cart glass
// Box source = front panel + lid strip cut from the KSD dieline (see menu-images skill).
// Usage: npx tsx cli/state-version.mts <approved site image> <new box image> <outDir> "<box text to keep exact>" [aio]
// Pass "aio" for an All-In-One: the package is the stand-up pouch, not a carton.
// Writes s{N}.png (swap) and v{N}.png (final), one per variant (VARIANTS env, default 1). Review the v files by eye.
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
const key = process.env.GEMINI_API_KEY || readFileSync(process.env.HOME + "/Developer/HalaraMarketing/website/halara-web/.env.local","utf8").match(/^GEMINI_API_KEY=(.*)$/m)![1].replace(/^"|"$/g,"");
const ai = new GoogleGenAI({ apiKey: key });
const [scene, box, outDir, boxText, form = "cart"] = process.argv.slice(2);
const aio = form === "aio";
mkdirSync(outDir, { recursive: true });

const PACKAGE_SHAPE = aio
  ? "The package is a flat soft-touch stand-up pouch with rounded corners and a round hang hole near the top, like the old pouch in IMAGE 1. Keep any \"Made in\" state mark printed in IMAGE 2; no other state logo."
  : "The top of the package must be a HANG TAB like the old package in IMAGE 1: a flat card tab rising out of the top of the box from behind the front panel, with the round hang hole and the type and potency printed on it; the box top edge must be visible in front of the tab. The thin left side edge of the box is plain with no icons or text. No state logo on the front.";
const SWAP = `Edit IMAGE 1. Replace ONLY the package in IMAGE 1 with the package shown in IMAGE 2. Reproduce IMAGE 2's printed art and text exactly (${boxText}), at the same size, position, angle and lean as the old package. Render it as a clean illustrated package like the old one in IMAGE 1, with soft even lighting: flat printed colors, no plastic sheen, no wrinkles, no strong reflections, not photorealistic. ${PACKAGE_SHAPE} Change NOTHING else: keep the standalone device, the fruit, the leaves, the herbs, the splash, the red badge, the hero title and the background exactly as they are in IMAGE 1.`;
const STYLE = `Edit IMAGE 1. (1) Redraw every loose fruit OUTSIDE the package in the same low-poly geometric style as the fruit printed on the package in IMAGE 2: many crisp triangular facets, straight edges, flat shading per facet, highly detailed like a cut gem. Keep each fruit's place, size and color, and turn the soft watercolor wash directly behind the product into a compact cluster of matching faceted shapes in the same colors. The cluster stays behind the product only; it must NOT fill the background. (2) BACKGROUND: keep IMAGE 1's background exactly: a smooth vertical gradient from the strain color at the top fading to soft cream-white at the bottom, with no facets, shapes or pattern in it. (3) Add a few green cannabis fan leaves (7-point, serrated) tucked behind the fruit on both sides. ${aio ? "(4) Keep the standalone All-In-One device exactly as it is, including its printed halára logo." : "(4) The standalone cartridge outside the box has NO logo, emblem or printing on its glass: clean clear glass with golden oil."} (5) Keep the package as clean flat illustrated print, not glossy or photoreal. Change NOTHING else: keep the package and every word on it, the red badge, the hero title, the device shape and position, and the layout exactly as they are.`;

const part = (p: string | Buffer) => {
  const b = typeof p === "string" ? readFileSync(p) : p;
  return { inlineData: { data: b.toString("base64"), mimeType: b[0] === 0x89 ? "image/png" : "image/jpeg" } };
};
async function edit(img: string | Buffer, prompt: string): Promise<Buffer> {
  const r = await ai.models.generateContent({ model: "gemini-3-pro-image-preview", contents: { parts: [{ text: "IMAGE 1:" }, part(img), { text: "IMAGE 2:" }, part(box), { text: prompt }] }, config: { imageConfig: { aspectRatio: "1:1", imageSize: process.env.IMG_SIZE ?? "2K" } } });
  const data = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error("no image");
  return Buffer.from(data, "base64");
}
// Each variant is a paid image call (~13¢). Default 1; set VARIANTS=3 only when Malcolm OKs the spend.
const variants = Array.from({ length: Number(process.env.VARIANTS ?? 1) }, (_, k) => k + 1);
await Promise.all(variants.map(async i => {
  try {
    // Resumable: rerun the same command after network errors and finished steps are kept.
    if (existsSync(`${outDir}/v${i}.png`)) { console.log(`v${i}: already done`); return; }
    const sPath = `${outDir}/s${i}.png`;
    const swapped = existsSync(sPath) ? readFileSync(sPath) : await edit(scene, SWAP);
    writeFileSync(sPath, swapped);
    writeFileSync(`${outDir}/v${i}.png`, await edit(swapped, STYLE)); console.log(`v${i}: ok`);
  } catch (e) { console.log(`v${i}: ${(e as Error).message.slice(0,120)}`); }
}));

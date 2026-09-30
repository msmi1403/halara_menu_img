// One-off "remove an element" edit: sends a site image to the image model with an
// edit-only prompt (swap candy for fruit, change nothing else). Used Sep 30 2026 to
// strip candy from Sour Gummiez AIO and Sour Diesel Runtz cart. Review the output
// WITHOUT --source: the reviewer reads the removed element off the reference.
// Usage: npx tsx cli/edit-out.mts <image> <outDir> "<fruit to paint in>"
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const key = process.env.GEMINI_API_KEY || readFileSync(process.env.HOME + "/Developer/HalaraMarketing/website/halara-web/.env.local","utf8").match(/^GEMINI_API_KEY=(.*)$/m)![1].replace(/^"|"$/g,"");
const ai = new GoogleGenAI({ apiKey: key });
const [src, outDir, fruit] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const prompt = `Edit this image. Remove every piece of candy: gummy bears, gummy worms, gummies, lollipops, hard candies and sweets. Fill each spot with ${fruit}, painted in the same watercolor style as the fruit already in the image. Change NOTHING else: keep the package, the device, every word of text, the red badge, the hero title, the cannabis leaves, the drips, the background and the layout exactly as they are.`;
const data = readFileSync(src).toString("base64");
const mime = src.endsWith(".png") && readFileSync(src)[0] === 0x89 ? "image/png" : "image/jpeg";
await Promise.all([1,2,3].map(async i => {
  try {
    const r = await ai.models.generateContent({ model: "gemini-3-pro-image-preview", contents: { parts: [{ inlineData: { data, mimeType: mime } }, { text: prompt }] }, config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } } });
    const part = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData?.data) { console.log(`e${i}: no image`); return; }
    writeFileSync(`${outDir}/e${i}.png`, Buffer.from(part.inlineData.data, "base64")); console.log(`e${i}: ok`);
  } catch (e) { console.log(`e${i}: ${(e as Error).message.slice(0,120)}`); }
}));

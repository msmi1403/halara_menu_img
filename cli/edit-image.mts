// One-off free-form edit of a finished menu image, with an optional style reference
// (e.g. the box art). Used Oct 27 2026 to make the MN scene fruit low-poly like the box
// and to remove the old logo from the standalone cart.
// Usage: npx tsx cli/edit-image.mts <image> <outDir> "<edit prompt>" [<reference image>]
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const key = process.env.GEMINI_API_KEY || readFileSync(process.env.HOME + "/Developer/HalaraMarketing/website/halara-web/.env.local","utf8").match(/^GEMINI_API_KEY=(.*)$/m)![1].replace(/^"|"$/g,"");
const ai = new GoogleGenAI({ apiKey: key });
const [src, outDir, prompt, ref] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const part = (p: string) => ({ inlineData: { data: readFileSync(p).toString("base64"), mimeType: readFileSync(p)[0] === 0x89 ? "image/png" : "image/jpeg" } });
const parts = [{ text: "IMAGE 1:" }, part(src), ...(ref ? [{ text: "IMAGE 2 (style reference only):" }, part(ref)] : []), { text: prompt }];
await Promise.all([1,2,3].map(async i => {
  try {
    const r = await ai.models.generateContent({ model: "gemini-3-pro-image-preview", contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: process.env.IMG_SIZE ?? "1K" } } });
    const img = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!img?.inlineData?.data) { console.log(`e${i}: no image`); return; }
    writeFileSync(`${outDir}/e${i}.png`, Buffer.from(img.inlineData.data, "base64")); console.log(`e${i}: ok`);
  } catch (e) { console.log(`e${i}: ${(e as Error).message.slice(0,120)}`); }
}));

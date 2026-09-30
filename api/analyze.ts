import { analyzeProductImage } from "../engine/gemini.js";
import { handler, client, json, isImage } from "./_lib.js";
import type { ImageInput } from "../engine/review.js";

export const POST = handler<{ image: ImageInput }>(async ({ image }) => {
  if (!isImage(image)) return json({ error: "Send { image: { data, mimeType } }." }, 400);
  const meta = await analyzeProductImage(client(), image.data, image.mimeType);
  return json({ meta });
});

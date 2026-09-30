import { generateAdImage } from "../engine/gemini.js";
import { preflight } from "../engine/potency.js";
import { handler, client, json, isImage } from "./_lib.js";
import type { ImageInput } from "../engine/review.js";
import type { ProductMetadata, GenerationSettings } from "../types.js";

// The preflight runs here, server-side, so no front end can skip it: a badge that
// overstates the box beyond the legal tolerance is refused before any render is paid for.
export const POST = handler<{ image: ImageInput; meta: ProductMetadata; settings: GenerationSettings }>(
  async ({ image, meta, settings }) => {
    if (!isImage(image) || !meta?.strainName || !settings) {
      return json({ error: "Send { image, meta, settings }." }, 400);
    }
    const checked = preflight(meta, settings);
    if (checked.problem) return json({ error: `Badge check: ${checked.problem}.`, type: "BADGE_OVERSTATES_BOX" }, 422);
    const dataUrl = await generateAdImage(client(), image.data, meta, checked.settings, image.mimeType);
    return json({ image: dataUrl, settings: checked.settings });
  }
);

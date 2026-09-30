import { expectationFor, reviewImage } from "../engine/review.js";
import { preflight } from "../engine/potency.js";
import { handler, client, json, isImage, examplesFor } from "./_lib.js";
import type { ImageInput } from "../engine/review.js";
import type { ProductMetadata, GenerationSettings } from "../types.js";

export const POST = handler<{ candidate: ImageInput; source?: ImageInput; meta: ProductMetadata; settings: GenerationSettings }>(
  async ({ candidate, source, meta, settings }) => {
    if (!isImage(candidate) || !meta?.strainName || !settings) {
      return json({ error: "Send { candidate, source?, meta, settings }." }, 400);
    }
    const exp = expectationFor(meta, preflight(meta, settings).settings);
    const review = await reviewImage(client(), candidate, exp, {
      source: isImage(source) ? source : undefined,
      examples: examplesFor(exp.mode),
    });
    return json({ review });
  }
);

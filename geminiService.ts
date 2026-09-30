import { ProductMetadata, GenerationSettings } from "./types";
import { GeminiError, GeminiErrorType } from "./engine/gemini";
import type { ReviewResult } from "./engine/review";

export { GeminiError, GeminiErrorType } from "./engine/gemini";

// The browser never holds the Gemini key. Every call goes to this app's own
// server functions (api/*), which hold the key and check the team password.

const PASSWORD_KEY = "imagineer-password";

export function getPassword(): string {
  try { return localStorage.getItem(PASSWORD_KEY) || ""; } catch { return ""; }
}

export function setPassword(password: string): void {
  try { localStorage.setItem(PASSWORD_KEY, password); } catch { /* private window: stays in memory only */ }
}

export function clearPassword(): void {
  try { localStorage.removeItem(PASSWORD_KEY); } catch { /* nothing stored */ }
}

export const PASSWORD_REJECTED = "PASSWORD_REJECTED";

async function post<T>(path: string, body: unknown, password = getPassword()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-imagineer-password": password },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GeminiError(GeminiErrorType.NETWORK, "Network connection failed");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearPassword();
    throw new GeminiError(GeminiErrorType.INVALID_API_KEY, PASSWORD_REJECTED);
  }
  if (res.status === 413) throw new GeminiError(GeminiErrorType.UNKNOWN, "That photo is too large to send. Try a smaller one.");
  if (res.status === 429) throw new GeminiError(GeminiErrorType.QUOTA_EXCEEDED, data.error || "API quota exceeded");
  if (!res.ok) throw new GeminiError(GeminiErrorType.UNKNOWN, data.error || `Server error ${res.status}`);
  return data as T;
}

export async function checkPassword(password: string): Promise<boolean> {
  try {
    await post("check", {}, password);
    return true;
  } catch {
    return false;
  }
}

// Phone photos can be 5+ MB; the server's request cap is 4.5 MB. Shrink to
// 2048px on the long side as JPEG, which is plenty for the model to read the box.
const MAX_SIDE = 2048;

async function prepare(base64: string): Promise<{ data: string; mimeType: string }> {
  const img = new Image();
  img.src = `data:image/*;base64,${base64}`;
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && base64.length < 3_000_000) return { data: base64, mimeType: "image/png" };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/jpeg", 0.9).split(",")[1], mimeType: "image/jpeg" };
}

// The same photo is sent for analysis, each render, and each review; shrink it once.
const prepared = new Map<string, Promise<{ data: string; mimeType: string }>>();
function prepareOnce(base64: string) {
  if (!prepared.has(base64)) { prepared.clear(); prepared.set(base64, prepare(base64)); }
  return prepared.get(base64)!;
}

export async function analyzeProductImage(base64Image: string): Promise<ProductMetadata> {
  const { meta } = await post<{ meta: ProductMetadata }>("analyze", { image: await prepareOnce(base64Image) });
  return meta;
}

export async function generateAdImage(
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<string> {
  const { image } = await post<{ image: string }>("generate", { image: await prepareOnce(base64SourceImage), meta: metadata, settings });
  return image;
}

export async function reviewAdImage(
  candidateDataUrl: string,
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<ReviewResult> {
  const [, mimeType = "image/png", data = ""] = candidateDataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
  const { review } = await post<{ review: ReviewResult }>("review", {
    candidate: { data, mimeType },
    source: await prepareOnce(base64SourceImage),
    meta: metadata,
    settings,
  });
  return review;
}

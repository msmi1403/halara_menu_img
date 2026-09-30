// Shared server helpers. Files starting with "_" are not routed by Vercel.
import { timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { GoogleGenAI } from "@google/genai";
import { GeminiError, GeminiErrorType } from "../engine/gemini.js";
import type { ImageInput, Mode } from "../engine/review.js";

// One shared team password (APP_PASSWORD env var). Fails closed: if the variable
// is missing, nobody gets in, so a misconfigured deploy can't spend the key.
export function authorized(req: Request): boolean {
  const expected = process.env.APP_PASSWORD;
  const given = req.headers.get("x-imagineer-password") ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function client(): GoogleGenAI {
  // HALARA_MENU_IMAGES_2 is the name the key was saved under in the Vercel project.
  const apiKey = process.env.GEMINI_API_KEY || process.env.HALARA_MENU_IMAGES_2;
  if (!apiKey) throw new Error("GEMINI_API_KEY (or HALARA_MENU_IMAGES_2) is not set on the server");
  return new GoogleGenAI({ apiKey });
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

// Wraps a POST handler with the password check, JSON parsing and error mapping.
export function handler<T>(fn: (body: T) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (!authorized(req)) return json({ error: "Wrong or missing password." }, 401);
    let body: T;
    try {
      body = (await req.json()) as T;
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }
    try {
      return await fn(body);
    } catch (e) {
      const err = e as Error;
      const status = err instanceof GeminiError && err.type === GeminiErrorType.QUOTA_EXCEEDED ? 429 : 500;
      return json({ error: err.message, type: err instanceof GeminiError ? err.type : "UNKNOWN" }, status);
    }
  };
}

export function isImage(x: unknown): x is ImageInput {
  const img = x as ImageInput;
  return !!img && typeof img.data === "string" && img.data.length > 0 && typeof img.mimeType === "string";
}

// Style examples bundled with the deploy (references/examples, from the approved set).
export function examplesFor(mode: Mode): ImageInput[] {
  const dir = join(process.cwd(), "references", "examples");
  try {
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as Record<string, { file: string }[]>;
    return (index[mode] ?? []).map(e => ({ data: readFileSync(join(dir, e.file)).toString("base64"), mimeType: "image/jpeg" }));
  } catch {
    return [];
  }
}

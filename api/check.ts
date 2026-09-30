import { authorized, json } from "./_lib.js";

// Lets the login screen confirm the password without spending an API call.
export function POST(req: Request): Response {
  return authorized(req) ? json({ ok: true }) : json({ error: "Wrong password." }, 401);
}

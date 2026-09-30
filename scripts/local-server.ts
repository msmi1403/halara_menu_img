// Local stand-in for Vercel: serves dist/ and routes /api/* to the same handlers.
//   npm run build && APP_PASSWORD=... npx tsx scripts/local-server.ts
// GEMINI_API_KEY comes from the environment, else halara-web/.env.local.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";

if (!process.env.GEMINI_API_KEY) {
  const envPath = join(homedir(), "Developer/HalaraMarketing/website/halara-web/.env.local");
  const line = existsSync(envPath) ? readFileSync(envPath, "utf8").split("\n").find(l => l.startsWith("GEMINI_API_KEY=")) : undefined;
  if (line) process.env.GEMINI_API_KEY = line.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const routes: Record<string, () => Promise<{ POST: (req: Request) => Response | Promise<Response> }>> = {
  check: () => import("../api/check"),
  analyze: () => import("../api/analyze"),
  generate: () => import("../api/generate"),
  review: () => import("../api/review"),
};
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const route = url.pathname.match(/^\/api\/(\w+)$/)?.[1];
  if (route) {
    const load = routes[route];
    if (!load || req.method !== "POST") { res.writeHead(404).end(); return; }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(url, { method: "POST", headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) });
    const response = await (await load()).POST(request);
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") || "application/json" });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  const file = join("dist", url.pathname === "/" ? "index.html" : url.pathname);
  const path = existsSync(file) ? file : join("dist", "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
}).listen(port, () => console.log(`http://localhost:${port}`));

# Halara Menu Imagineer

Turns a product photo into a Halara menu image in the house style, then scores it against a check list before anyone downloads it.

- **Web app:** https://halara-imagineer.vercel.app (team password). Vercel project `halara-imagineer`.
- **Claude skill:** `/menu-images` in HalaraKB (`~/Documents/HalaraKB/.claude/skills/menu-images/SKILL.md`) runs the same engine from the CLI.

## Layout

| Path | What it is |
|---|---|
| `prompts.ts` | The house style. The only place style rules live. |
| `engine/` | Shared by the web app, the server and the CLI: Gemini calls, mode detection, the potency preflight (badge never overstates the box beyond the 10% legal tolerance; resin is always 80%+), and the review check list. |
| `api/` | Vercel functions: `check`, `analyze`, `generate`, `review`. They hold the Gemini key and require the team password. Every file here is a public route, so no tests or scratch files in this folder. |
| `cli/imagineer.ts` | `make` / `review` / `calibrate` for the Claude skill. |
| `references/` | `approved.json` (the answer key of approved site images) and `examples/` (small copies bundled with the server for the reviewer). |

## Settings (Vercel → Project → Environment Variables)

- `GEMINI_API_KEY` (saved in the Vercel project as `HALARA_MENU_IMAGES_2`; either name works): the Google AI key. Lives only on the server.
- `APP_PASSWORD`: the team password. If it's missing, the app refuses everyone.

## Develop

```bash
npm install
npx tsx --test tests/unit/*.test.ts engine/*.test.ts   # no API calls
VERCEL=1 npx vite build && APP_PASSWORD=local-test npx tsx scripts/local-server.ts   # http://localhost:4173
vercel deploy --prod
```

Server files import each other with a `.js` ending (`from "./_lib.js"`). Vercel runs them as plain Node ES modules, which need it; leaving it off deploys fine and then crashes every call.

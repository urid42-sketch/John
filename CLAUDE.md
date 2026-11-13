# חדר הלבשה (Dressing Room)

Private dress-up web app (a gift): the user uploads a full-body photo ("doll"), imports garments,
tries them on with touch gestures, and designs/edits garments in a "sewing studio".
Mobile-first, Hebrew RTL, single user, no login, everything local in IndexedDB.

**The app lives in `dressing-room/`.** `backend/`, `frontend/`, `start.sh` are an unrelated older
project — do not read or modify them.

## Current stage
**Stage 0 (planning) — done, waiting for user approval.** Next: Stage 1 (MVP).
Stages: 0 plan · 1 MVP (doll, import, wardrobe, try-on) · 2 studio from scratch · 3 studio edit imported ·
4 looks/export/backup/PWA/Vercel · 5 AI (only if user approves).

## Stack
React + Vite + TypeScript, Tailwind v4 · Konva/react-konva · Dexie (IndexedDB) · Zustand (editor state only) ·
react-router · @imgly/background-removal in a Web Worker (lazy, AGPL, ~80MB model on first use) ·
fflate (ZIP backup) · vite-plugin-pwa · Vitest. Deploy: Vercel, Root Directory = `dressing-room`.

## Structure (dressing-room/src)
`db/` schema, types, blobs, repos, backup · `imaging/` decode/downscale, bg removal, masks, stage-3 tools ·
`import/` sources + ImportFlow steps · `engine/` PURE parametric pattern engine (body, pieces, necklines,
details, render/) · `canvas/` TryOnStage, multi-touch hook, export · `studio/` · `screens/` · `ui/` · `i18n/he.ts`.
Full design: `dressing-room/docs/ARCHITECTURE.md` (read only the section you need).

## Rules
- All UI strings in Hebrew, in `i18n/he.ts`. Tailwind logical utilities only (ps/pe/ms/me/start/end). Konva container is `dir="ltr"`, no text on canvas.
- Images: downscale on import (doll 2048, garment 1536, fabric 512); store ArrayBuffer+mime in `blobs`; alpha as PNG; revoke object URLs; release canvases (`width = 0`).
- Garment rendering is Canvas 2D (no SVG filters, no `ctx.filter`) — Safari.
- Never change geometry of an existing `engineVersion`; bump it.
- Error handling on every file/network operation, with a friendly Hebrew message. No credentials in client code; API keys only in Vercel env (stage 5).
- Ask the user before adding a heavy dependency.

## Workflow (cost saving)
- Main session writes the code. Subagents in `.claude/agents/`: `architect` (stage 0 + end-of-stage review only),
  `senior` (escalation after 2 failures / hard math), `helper` (search, build/lint, typos, README).
- One stage at a time. End of stage: architect review → commit → update this file → summary table → tell user to `/compact` or `/clear`.
- Don't read node_modules, dist, lock files. Focused diffs, not full rewrites.
- Branch: `claude/gallant-wright-bevvul`. No PR unless asked.

## Commands (from dressing-room/, once scaffolded)
`npm run dev -- --host` · `npm run build` · `npm run test` · `npm run lint`

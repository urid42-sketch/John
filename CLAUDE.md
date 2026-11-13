# חדר הלבשה (Dressing Room)

Private dress-up web app (a gift): the user uploads a full-body photo ("doll"), imports garments,
tries them on with touch gestures, and designs/edits garments in a "sewing studio".
Mobile-first, Hebrew RTL, single user, no login, everything local in IndexedDB.

**The app lives in `dressing-room/`.** `backend/`, `frontend/`, `start.sh` are an unrelated older
project — do not read or modify them.

## Current stage
**Stage 1 (MVP) — done, reviewed, waiting for the user's phone test.** Next: Stage 2 (studio, create from scratch).
Stages: 0 plan ✔ · 1 MVP ✔ · 2 studio from scratch · 3 studio edit imported ·
4 looks/export/backup/PWA/Vercel · 5 AI (only if user approves).

User: Aya (name is `USER_NAME` in `i18n/he.ts`), iPhone / Safari. All architect simplifications approved.

Stage 1 state and deviations from ARCHITECTURE.md:
- No Konva Transformer: custom pointer handling in `canvas/TryOnStage.tsx` (drag, pinch, rotate) + sliders;
  hit testing is ours (alpha maps from thumbs, `canvas/gesture.ts`), Konva nodes are `listening={false}`.
- Bg removal: `imaging/bgRemoval.ts` calls the library on the main thread (it proxies to its own worker),
  runs serialized, asks consent before the first 80MB download, and skips auto-run after a crashed run.
- Repos are one file (`db/repo.ts`). No Zustand yet (add with the studio store). `GarmentBody` is raster-only.
- Not built yet: doll calibration (stage 2), looks/backup/PWA (stage 4). Studio and Looks tabs are placeholders.
- Try-on backdrop: one closet-room illustration, `public/closet.svg`, applied by CSS (`.closet-bg`) behind the
  transparent Konva canvas; the doll stands on its rug (see `L` in TryOnStage). Stage 4 look export must draw it too.
- The user's goal is a REALISTIC result. The overlay try-on is the fast/free mode; realism comes from the
  AI try-on (stage 5), which the user should be asked to approve early rather than treated as optional.
- NOT verified in the sandbox (model CDN blocked): a real @imgly model run. Needs a check on the phone,
  together with a 48MP photo import and long-press paste.

## Stack
React 19 + Vite 8 + TypeScript 7, Tailwind v4 · Konva/react-konva · Dexie (IndexedDB) · Zustand (planned, stage 2) ·
react-router-dom · @imgly/background-removal in a Web Worker (lazy, AGPL, ~80MB model on first use) ·
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

## Commands (from dressing-room/)
`npm run dev` (already binds to the LAN) · `npm run build` · `npm run test` · `npm run lint`
Browser check: build, `npx vite preview --port 4173`, then drive it with the pre-installed Playwright (iPhone 13 device).

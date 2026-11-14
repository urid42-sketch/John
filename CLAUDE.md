# חדר הלבשה (Dressing Room)

Private dress-up web app (a gift): the user uploads a full-body photo ("doll"), imports garments,
tries them on with touch gestures, and designs/edits garments in a "sewing studio".
Mobile-first, Hebrew RTL, single user, no login, everything local in IndexedDB.

**The app lives in `dressing-room/`.** `backend/`, `frontend/`, `start.sh` are an unrelated older
project — do not read or modify them.

## Current stage
**All stages (0-5) are built and LIVE** at https://john-dressing-room.vercel.app (Vercel project `john-dressing-room`,
auto-deploys from this branch; `FAL_KEY` + `APP_PIN` are set there). Waiting for: a test on Aya's iPhone and fal credits.
The user asked for the app to be finished autonomously, without stopping for approvals; keep them updated.

User: Aya (name is `USER_NAME` in `i18n/he.ts`), iPhone / Safari. The user's goal is a REALISTIC result.

What exists (deviations from ARCHITECTURE.md are deliberate):
- Try-on: custom pointer handling in `canvas/TryOnStage.tsx` (drag, pinch, rotate) + sliders, own alpha-map hit
  testing (`canvas/gesture.ts`), no Konva Transformer. Closet backdrop = `public/closet.jpg` via CSS `.closet-bg`;
  `canvas/exportLook.ts` draws it into exported looks.
- Bg removal: `imaging/bgRemoval.ts`, serialized, consent before the first 80MB download, crash guard.
- EASE OF USE (user asked: "not understandable", make it friendlier and more professional): instant start without a
  photo (`db/starter.ts`: shop-mannequin doll + five sample garments made by the studio engine), a "what next" card on
  an empty try-on stage, `/help` screen (`screens/HelpScreen.tsx`, texts in `he.guide`), after saving a design a sheet
  offers "try it on now", after importing a garment you land on its page. Principle: every empty screen points to the
  next action; keep adding guidance in this spirit.
- `engine/mannequin.ts` = glossy ivory shop mannequin, parts lit separately (arms, legs, torso over the joints, egg
  head). Used in the studio preview without a doll, on the template cards and as the starter doll.
- STUDIO RENDERING (v2, per-pixel): `engine/shade.ts` builds a height field per garment piece (row-cylinder roundness,
  bust bumps, fold ridges, radial pleats from the waist = `Piece.drape`) and lights it with a key light (satin sheen,
  velvet rim, lace over a slip); prints are bent along the folds. `engine/render.ts` draws each piece through it, then
  seams / hem stitching / details. Fabric tiles (`fabricTiles.ts`) are flat colour+weave only and are mip-mapped
  (`fabricTileFor`) to avoid moiré. `fabricPresets.ts` = 18 one-tap cloths (names in `he.studio.presets`);
  Pure parts are unit-tested.
  Known gaps: detail shapes (bow, belt, buttons, embroidery) are still flat 2D drawings; pants hip area is boxy.
- Studio: one generator, 7 presets (`engine/templates.ts`); dress/top is ONE `body` piece; details positioned as
  fractions of the garment box; `studio/useHistory.ts` (no Zustand). Designs are rendered once on the canonical
  body and auto-placed on the doll by `newPlacedItem` in `db/repo.ts` (not re-rendered per doll).
  Versions = design JSON + thumb (`garmentVersions`), cap 20. Calibration: `screens/DollCalibrate.tsx`.
- Imported-garment editor: `screens/RasterEditor.tsx` + `imaging/rasterOps.ts` + pure `imaging/recolor.ts`.
  Effects return new canvases; preview on a 720px copy, apply at full size. Warp = per-row scaling sliders.
  Edits bake into `render`; "return to original" rebuilds from source + mask.
- Looks: `screens/LooksScreen.tsx` (favourites, compare two, export/share). AI results are looks with `ai: true`.
- Backup: `db/backup.ts` over our own stored-only ZIP (`db/zip.ts`, no fflate). Restore validates the whole file
  (end record, index, sizes, counts) BEFORE clearing anything, then replaces everything.
- PWA: hand-written `src/sw.template.js`, emitted as `/sw.js` by the plugin in `vite.config.ts` (no vite-plugin-pwa).
- AI: `api/ai.js` (Vercel function → fal.ai `fal-ai/nano-banana/edit`, env `FAL_KEY`, `APP_PIN`, optional
  `AI_MODEL`), client in `src/ai/`. Realistic try-on sends a collage + the person photo; text edit in RasterEditor.
  `APP_PIN` must be ≥ 12 chars or the function answers 501.
- NO EXTRA COSTS (user decision): the paid automatic AI stays optional and off; the ✦ button in try-on appears
  only after activation in Settings. The user rejected a manual "generate it in Higgsfield" route inside the app,
  so there is none. Realism in the free try-on comes from the photo backdrop and soft shadows (garments, doll,
  floor) in `canvas/TryOnStage.tsx`. Looks → "הוספת תמונה" imports any picture as a look.
- FREE AUTO-FIT (`engine/autoFit.ts`, pure + tested; wiring in `canvas/autoPlace.ts`): `autoCalibrate` reads
  shoulders / waist / hips / ankles / wrists from the doll cutout's silhouette (thigh-based fallback when the arms
  rest against the body), saved as the doll's calibration on import. `fitGarment` scales an imported garment so its
  own waist lands on her waist, centres it, and returns a per-row widening profile (`PlacedItem.fit`) drawn by
  `TryOnStage` from a row-warped copy. Runs on every add; "התאמה אוטומטית לגוף" in the tune panel re-runs it.
- Do NOT spend Higgsfield credits without the user's explicit approval (37 left on 2026-11-14).
- The user is willing to load about $5 once on fal.ai for the automatic realistic try-on (see DEPLOY.md part ג׳).
- Backdrop is a photo, `public/closet.jpg` (generated once with the user's Higgsfield account, with permission to
  use it for site assets only). The doll's feet sit on its rug: see `L` in TryOnStage if the image changes.
- Cloud environment `john-dressing-room` allows d8j0ntlcm91z4.cloudfront.net (Higgsfield images) and
  staticimgly.com (bg-removal model), so both can be used in browser checks here.
- Verified in Chromium with real photos: the @imgly model run (about 20s per image, clean cutouts) and the
  whole photo → cutout → try-on path. NOT verified: a real fal.ai call (no key) and anything on real iOS Safari.
- The user asked for a 3D doll and finer garment detail after seeing the SCHEMATIC test figure. With a real photo
  and a real garment photo the result is photographic; a true 3D avatar with fitted 3D clothes is a different
  product (no way to turn imported garment photos into fitted 3D clothing for free) and was not started. Higgsfield plan credits cannot be used from an app (their API bills separately).

## Stack
React 19 + Vite 8 + TypeScript 7, Tailwind v4 · Konva/react-konva · Dexie (IndexedDB) ·
react-router-dom · @imgly/background-removal in a Web Worker (lazy, AGPL, ~80MB model on first use) ·
own ZIP backup · own service worker · Vitest. Deploy: Vercel, Root Directory = `dressing-room`.

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
- After a change: tests + build + Playwright check → commit → push → update this file → short Hebrew summary to the user.
- Don't read node_modules, dist, lock files. Focused diffs, not full rewrites.
- Branch: `claude/gallant-wright-bevvul`. No PR unless asked.

## Commands (from dressing-room/)
`npm run dev` (already binds to the LAN) · `npm run build` · `npm run test` · `npm run lint`
Browser check: build, `npx vite preview --port 4173`, then drive it with the pre-installed Playwright (iPhone 13 device).

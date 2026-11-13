# חדר הלבשה: architecture

Stage 0 output of the architect. Library sizes are approximate; verify in the stage-1 spike.
Vercel project "Root Directory" = `dressing-room`.

## 1. Key decisions

| Topic | Choice | Rationale |
|---|---|---|
| Canvas | **Konva + react-konva** (~55 KB gz) | Declarative nodes map 1:1 to `PlacedItem[]`, so undo and persistence are plain JSON. Built-in `Transformer`, accepts an offscreen canvas as image source. |
| Bg removal | **`@imgly/background-removal`**, `isnet_fp16`, Web Worker, lazy `import()` | **HEAVY**: wasm ~10-25 MB + model ~80 MB, downloaded on first use only. **AGPL-3.0**. Alternative behind the same `removeBackground(blob) → mask` interface: `@huggingface/transformers` + MODNet (Apache). |
| Cheap bg fallback | Own magic-wand colour-key (flood fill from corners) | White-background product shots work instantly with no model; escape hatch on low-RAM phones. |
| IndexedDB | **Dexie** (~29 KB gz) + `dexie-react-hooks` | Versioned migrations, multiEntry tag indexes, `useLiveQuery`. |
| State | **Zustand** for editor/session state only | Persisted lists come from Dexie live queries. |
| Routing | `react-router` + SPA rewrite in `vercel.json` | Deep links for PWA. |
| PWA | `vite-plugin-pwa` (`generateSW`, `registerType: 'prompt'`) | Precache shell; runtime `CacheFirst` for model/wasm. |
| Gestures | Custom `useMultiTouchTransform` hook on Konva stage touch events | Two-pointer centroid/distance/angle → pan, pinch, rotate of the *selected* item, fingers anywhere on the stage. `Konva.hitOnDragEnabled = true`. |
| Backup | **ZIP, stored (no compression)**, `fflate` streaming | `manifest.json` + `data/*.json` + `blobs/<id>.<ext>`. |
| Undo/redo | Snapshot stacks of immutable JSON, committed on pointer-up | Raster tools keep up to 8 pixel/mask snapshots. |
| Fabric/shading | **Canvas 2D** (`Path2D`, patterns, blend modes), not SVG filters | Avoids Safari SVG-to-image problems (section 4.4). |
| Tests | Vitest for the pure engine; manual device checklist per stage | |

Do **not** enable COOP/COEP for wasm threads (breaks cross-origin images). Single-thread wasm (~10-30 s per image on a phone) with progress UI; WebGPU when present.

## 2. Folder structure

```
dressing-room/
  index.html                  # <html lang="he" dir="rtl">
  package.json  vite.config.ts  tsconfig.json  vercel.json
  public/  icons/  manifest (name "חדר הלבשה", standalone, share_target for Android)
  api/                        # stage 4-5 Vercel functions
    fetch-image.ts            # optional CORS proxy (stage 4)
    tryon.ts  edit.ts         # stage 5, keys from env only
  src/
    main.tsx  App.tsx  routes.tsx  index.css
    i18n/he.ts                # all UI strings
    db/
      schema.ts               # Dexie class, stores, migrations
      types.ts                # persisted interfaces (section 3)
      blobs.ts                # putBlob/getBlob/useBlobUrl (object-URL cache + revoke), GC
      repo/{dolls,garments,looks,fabrics,versions}.ts
      backup.ts  storage.ts   # exportZip/importZip; persist(), estimate(), backup reminder
    imaging/
      load.ts                 # decode (EXIF), downscale, encode
      bgRemoval.worker.ts  bgRemoval.ts
      mask.ts                 # alpha ops, feather, magic wand, compose cutout
      recolor.worker.ts  warp.ts  resizeBand.ts   # stage 3
      thumbs.ts
    import/
      sources.ts              # file, drop, paste, clipboard.read(), URL fetch + error taxonomy
      ImportFlow.tsx  CropStep.tsx  CutoutStep.tsx  MetaStep.tsx
    engine/                   # PURE, no DOM except render/
      types.ts  body.ts  templates.ts (7 presets)
      geometry/{spline,path,range}.ts
      pieces/{bodice,skirt,sleeves,legs,straps}.ts  necklines.ts  profiles.ts
      generate.ts  constraints.ts  migrate.ts
      details/{belt,ruffle,buttons,zipper,bow,sequins,embroidery}.ts
      render/{renderGarment,shading,folds,fabricTiles,renderDetails}.ts
      __tests__/
    canvas/   TryOnStage.tsx  PlacedItemNode.tsx  useMultiTouchTransform.ts  exportLook.ts
    studio/   StudioScreen  studioStore (history)  ParamPanel  FabricPanel
              DetailsPanel  DetailOverlay  VersionsSheet  RasterEditTools (stage 3)
    screens/  TryOnScreen  WardrobeScreen  GarmentScreen  DollsScreen  DollCalibrate
              LooksScreen  CompareScreen  SettingsScreen  Onboarding
    ui/       BottomNav  Sheet  Chip  BigSlider  ColorSwatches  Toast  ConfirmDialog  ProgressRing
```

## 3. Data model

```ts
type ID = string;                       // crypto.randomUUID()
type BlobRef = ID;                      // key into `blobs`

interface StoredBlob { id: ID; ownerId: ID; role: 'source'|'mask'|'cutout'|'thumb'|'render'|'fabric';
  mime: string; bytes: ArrayBuffer; w: number; h: number; size: number }

interface Doll { id: ID; name: string; createdAt: number; isDefault: boolean;
  source: BlobRef; mask: BlobRef; cutout: BlobRef; thumb: BlobRef;
  w: number; h: number;
  calibration?: BodyCalibration }       // normalized 0..1; absent ⇒ bbox defaults

interface BodyCalibration { shoulderL: Pt; shoulderR: Pt; waistL: Pt; waistR: Pt; hipL: Pt; hipR: Pt;
  ankleL: Pt; ankleR: Pt; wristL: Pt; wristR: Pt }

type Category = 'dress'|'top'|'pants'|'skirt'|'shoes'|'accessory';
interface Tags { colors: string[]; occasions: string[]; seasons: ('summer'|'winter'|'spring'|'autumn')[]; free: string[] }

interface Garment { id: ID; name: string; category: Category; tags: Tags; tagIndex: string[]; // "color:אדום"
  favorite: boolean; createdAt: number; updatedAt: number;
  render: BlobRef; thumb: BlobRef; w: number; h: number;   // ALWAYS present: transparent PNG used by try-on
  body: GarmentBody; currentVersion: ID;
  origin?: { type: 'file'|'paste'|'url'|'studio'; url?: string } }

type GarmentBody =
  | { kind: 'raster'; source: BlobRef; mask: BlobRef; details: Detail[]; adjust?: RecolorAdjust[] }
  | { kind: 'design'; design: GarmentDesign; bodyFrame: Rect };   // rect in canonical body units, for auto-fit

interface GarmentDesign { engineVersion: 1; template: TemplateId;
  type: 'dress'|'skirt'|'top'|'pants'; profile: 'fitted'|'aline'|'mermaid';
  hem: number;            // 0 = hip … 1 = floor. Chips: mini .22 / knee .50 / midi .72 / maxi .97
  neckline: 'v'|'round'|'strapless'|'offShoulder'|'halter'; neckDepth: number;
  sleeves: 'none'|'spaghetti'|'short'|'puff'|'long';
  waistFit: number;       // 0 loose … 1 fitted
  ease: number; flare: number;
  slit: { side: 'left'|'right'|'center'; height: number } | null;
  fabrics: { main: Fabric; bodice?: Fabric; sleeves?: Fabric };   // embedded by value
  details: Detail[]; seed: number }     // seed ⇒ stable folds

interface Fabric { id: ID; name?: string; kind: 'solid'|'satin'|'lace'|'denim'|'floral'|'plaid'|'image';
  colors: string[]; image?: BlobRef; scale: number; rotation: number; sheen: number; sequins?: number }

type DetailKind = 'ruffle'|'bow'|'belt'|'buttons'|'zipper'|'sequins'|'embroidery';
interface Detail { id: ID; kind: DetailKind; color: string; z: number; params: Record<string, number|string>;
  attach: | { type: 'curve'; curve: CurveName; t0: number; t1: number; offset: number }  // follows the garment
          | { type: 'free'; anchor?: AnchorName; x: number; y: number; scale: number; rotation: number }
          | { type: 'line'; p0: Pt; p1: Pt; bend: number } }                             // raster garments

interface GarmentVersion { id: ID; garmentId: ID; createdAt: number; label?: string;
  body: GarmentBody; render: BlobRef; thumb: BlobRef }       // explicit saves only, cap 20

interface PlacedItem { id: ID; garmentId: ID; x: number; y: number;  // centre, fraction of doll w/h
  scale: number;          // garment height / doll height
  stretchX: number; rotation: number; flipX: boolean; z: number; hidden?: boolean }

interface Look { id: ID; name: string; dollId: ID; items: PlacedItem[]; favorite: boolean;
  render: BlobRef; thumb: BlobRef; createdAt: number; updatedAt: number }  // id 'draft' = live session
```

**Dexie stores (v1)**

| Store | Key and indexes |
|---|---|
| `dolls` | `id, createdAt` |
| `garments` | `id, category, *tagIndex, favorite, updatedAt, body.kind` |
| `garmentVersions` | `id, garmentId, createdAt` |
| `fabrics` | `id, kind, createdAt` |
| `looks` | `id, dollId, favorite, updatedAt` |
| `blobs` | `id, ownerId` |
| `meta` (settings, `lastBackupAt`, `persistGranted`) | `key` |

**Blob policy**
- Store `ArrayBuffer + mime`, not `Blob` (WebKit IDB blob history).
- Camera original is not kept. On import: fix EXIF, downscale to long side 2048 (doll) / 1536 (garment) / 512 (fabric).
- Per item: `source` (JPEG q0.9) + `mask` (8-bit PNG alpha) for non-destructive erase/restore; `cutout`/`render` (PNG trimmed to alpha bbox); `thumb` (256 px PNG).
- Alpha images as PNG only (Safari `toBlob` has no WebP).
- Deleting an owner deletes its blobs by `ownerId`; orphan sweep at startup at most weekly.
- Looks keep their own `render`; missing garments are skipped on reopen with a toast.

**Migrations**: Dexie `version(n).upgrade()`. Design JSON has its own `engineVersion` with a `migrateDesign()` chain on read. Never change geometry of an existing `engineVersion`.

**Backup** (`chadar-halbasha-YYYY-MM-DD.zip`): `manifest.json {app, formatVersion: 1, schemaVersion, exportedAt, counts}`, `data/{dolls,garments,garmentVersions,fabrics,looks,meta,blobIndex}.json`, `blobs/<id>.<png|jpg>`. Export streams blob by blob, then `navigator.share({files})` or `<a download>`. Restore: validate manifest, refuse newer `schemaVersion`, clear and bulk-insert in batches of 20, run migrations. Replace only.

## 4. Parametric pattern engine

### 4.1 Body model
The body is an input to the generator, not a post-hoc stretch.

```ts
type Pt = { x: number; y: number };
interface Level { y: number; l: number; r: number }      // a body row: left/right silhouette x
interface Body { neck: Level; shoulder: Level; underarm: Level; bust: Level; waist: Level; hip: Level;
  crotchY: number; knee: Level; ankle: Level; floorY: number;
  legGap: { knee: number; ankle: number };
  wristL: Pt; wristR: Pt }
const CANONICAL: Body;                                   // 600×1000 croquis, centre x = 300
function deriveBody(c: BodyCalibration | undefined, doll: {w: number; h: number; alphaBBox: Rect}): Body;
```

`generate(design, body)` runs against `CANONICAL` (thumbnail, studio without a doll) or the doll's `Body` in doll-pixel space (live preview, try-on).

### 4.2 Fitting to the doll
- Optional one-time calibration per doll: `DollCalibrate` shows 10 large draggable dots (shoulders, waist, hips, ankles, wrists), pre-placed from the alpha bbox with croquis ratios. "גררי את הנקודות אל הגוף".
- Neck, underarm, bust, knee, crotch are interpolated with fixed ratios. If skipped, bbox defaults.
- In try-on a designed garment is rendered for the active doll (cache key `garmentId:version:dollId`) at identity transform; the normal `PlacedItem` transform applies on top.
- Engine assumes a frontal standing pose. Garments always draw over the doll (no arm/hair occlusion in v1). No pose auto-detection.

### 4.3 Composition
- The seven base patterns are **presets** over one generator: `TEMPLATES: Record<TemplateId, Partial<GarmentDesign>>`.
- **type** selects pieces: dress = bodice + skirt; top = bodice to hip; skirt = skirt + waistband; pants = legs + waistband.
- **profile × flare × ease**: `PROFILE[p](t)` gives outward offset along the skirt on top of the body row width.
- **length**: `hemY = lerp(hip.y, floorY, hem)`.
- **waistFit**: blends the waist row between the true waist and a straight bust-to-hip line.
- **neckline**: `necklines[n](body, depth) → { topEdge, hasShoulders, strap? }`; replaces only the bodice top edge.
- **sleeves**: pieces along the shoulder-to-wrist axis (`short` 25%, `long` 100% tapered, `puff` bulged cap + gathered cuff, `spaghetti` = strap pieces).
- **slit**: inverted-V wedge in the hem edge, so the doll shows through.
- `constraints.ts` normalizes invalid combos (strapless/halter ⇒ sleeves none or spaghetti; slit needs `hem > .3`; pants ignore slit/profile). UI greys those out.

```ts
interface Piece { id: PieceId; d: string; z: number; fabric: Fabric; folds: Fold[]; seams: string[] }
interface Fold  { a: Pt; b: Pt; width: number; depth: number }            // tapered shadow wedge a→b
interface GarmentGeometry { pieces: Piece[]; curves: Record<CurveName, Pt[]>;  // hem, waist, neckline, centerFront, cuffL/R
  anchors: Record<AnchorName, Pt>; bbox: Rect }
function generate(d: GarmentDesign, b: Body): GarmentGeometry;            // pure, deterministic (d.seed)
function renderGarment(g: GarmentGeometry, tiles: FabricTiles, o: {scale: number}): HTMLCanvasElement;

const PROFILE = {
  fitted:  () => 0,
  aline:   (t: number, _k: number, f: number) => f * t,
  mermaid: (t: number, k: number, f: number) => t < k ? 0 : 1.6 * f * ((t - k) / (1 - k)) ** 2,
};
export function skirtPiece(d: GarmentDesign, b: Body): Piece {
  const hemY = lerp(b.hip.y, b.floorY, d.hem), hw = (b.hip.r - b.hip.l) / 2;
  const tKnee = (b.knee.y - b.waist.y) / (hemY - b.waist.y);
  const rows = range(0, 1, 12).map(t => {
    const y = lerp(b.waist.y, hemY, t), body = bodyRowAt(b, y);
    const fit = t < .25 ? lerp(d.waistFit, 1, t / .25) : 1;
    const out = hw * (d.ease + PROFILE[d.profile](t, tKnee, d.flare));
    return { y, l: lerp(b.hip.l, body.l, fit) - out, r: lerp(b.hip.r, body.r, fit) + out };
  });
  const L = rows.map(r => ({ x: r.l, y: r.y })), R = rows.map(r => ({ x: r.r, y: r.y })).reverse();
  const path = `M${p(L[0])} ${spline(L)} ${hemEdge(L.at(-1)!, R[0], d.slit, d.flare)} ${spline(R)} ${arc(R.at(-1)!, L[0], -6)} Z`;
  return { id: 'skirt', d: path, z: 1, fabric: d.fabrics.main, folds: skirtFolds(rows, d), seams: [] };
}
```

`spline` = Catmull-Rom → cubic Béziers. `hemEdge` = shallow downward arc (deeper with flare) + slit wedge. `skirtFolds` emits `round(2 + 8·flare)` folds, jittered by seeded RNG.

### 4.4 Fabric and shading
Geometry is SVG path strings (flat SVG export is trivial); pixels are drawn with Canvas 2D. No `ctx.filter`, no SVG filters (Safari).

Per piece, on an offscreen canvas:
1. `clip(new Path2D(d))`.
2. Fill with `createPattern(tile)` + `pattern.setTransform` (scale, rotation).
3. Form shading: horizontal gradient (dark edges, light centre) in `multiply`.
4. Folds: tapered wedges with a transverse gradient in `multiply` + faint `screen` highlight.
5. Sheen (satin): 2-3 wide diagonal `screen` bands, strength from `fabric.sheen`.
6. Contact shadows under bust, waistband, hem.
7. Seams and a thin darker outline.

- Softness without blur: draw the fold layer at quarter resolution and upscale.
- Fabric tiles are procedural 256 px canvases cached per `Fabric` hash: satin (streak gradient), denim (twill + noise), lace (real alpha holes), floral (seeded petal stamps), plaid (crossing stripes), image (mirrored tile). All-over sequins = fabric overlay.
- Into Konva: the canvas is the `image` of a `Konva.Image`. ~512 px during slider drags, 1536 px on release.
- Export: `stage.toCanvas({pixelRatio})`. Saved garment stores `render` PNG on `CANONICAL`.

### 4.5 Details
- `curve` details (belt, ruffle, buttons, zipper) regenerate from `GarmentGeometry.curves` on every param change.
- `free` details (bow, embroidery motif, sequin patch) are vector stamps relative to an optional anchor.
- Selected detail gets a Konva `Transformer` overlay with ≥44 px handles; curve details use `t0/t1/offset/size` sliders.

## 5. Stage 3: editing imported garments

Working canvas ≤1536 px; preview at 512 px, full-res on release; heavy loops in a worker. Session undo = up to 8 snapshots; save bakes and writes a `GarmentVersion`.

- **Recolour**: *hue shift* (rotate H, scale S) and *colorize* (set H/S, remap L — needed for white/black/grey; keeps folds). Region = whole garment or wand + brush mask, feathered 2 px. Stored as `RecolorAdjust {mode, h, s, l, mask?}`.
- **Shorten/lengthen**: two guide lines define a band; redraw in three slices (top unchanged, band scaled in y, bottom shifted). 0 to ~1.6×.
- **Warp**: 3×4 control grid, affine-mapped triangles in Canvas 2D (inflated 0.5 px), displacement clamped to 15%. Ship two preset sliders first ("היצרות במותן", "הרחבה בשוליים"); free grid under "מתקדם".
- **New fabric**: tile through garment alpha (`source-in`), multiplied by the garment's normalized luminance map.
- **Details**: same library, `free` or `line` attach.

## 6. Screens

Bottom nav (RTL, from the right): **מדידה** `/`, **ארון** `/wardrobe`, **סטודיו** `/studio`, **לוקים** `/looks`. Header gear → **הגדרות**.

| Screen | Main components |
|---|---|
| מדידה | `TryOnStage`, doll switcher, `WardrobeDrawer` sheet, selected-item toolbar (קדימה / אחורה / היפוך / שכפול / הסרה), "שמירת לוק" |
| ארון | category tabs, tag filter chips, grid, FAB "הוספת בגד" → `ImportFlow` |
| ImportFlow | source step ("הדבקה" primary, "מהגלריה", "קישור"), `CropStep`, `CutoutStep` (auto / "רקע לבן" / brush), `MetaStep` |
| פריט | preview, tags, "מדידה", "עריכה בסטודיו", "שכפול", "גרסאות", delete |
| סטודיו | template cards + recent; editor: preview on doll (~55%), tabs "גזרה / בד / פרטים", top bar "בטל / בצע שוב / גרסאות / שמירה / שמירה כעותק" |
| בובות | list, add (→ cutout → `DollCalibrate`), set default |
| לוקים | grid + favourites, look page, `CompareScreen` (two renders side by side) |
| הגדרות | backup, restore, storage usage, persistent-storage status, install instructions, model status |

**RTL**: `dir="rtl"` on `<html>`, Tailwind logical utilities only. Konva container `dir="ltr"`, no text on canvas. Right/left for slit and details = screen side. Undo/redo icons not mirrored. Self-hosted Heebo. Touch targets ≥44 px; `touch-action: none` on the stage; `overscroll-behavior: none` on body.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mobile memory | Hard caps (2048/1536); `createImageBitmap(..., {resizeWidth})`; one working canvas at a time, `canvas.width = 0`; `bitmap.close()`; grids use thumbs; `useBlobUrl` revokes. |
| iOS canvas limits | Stage `pixelRatio` ≤ 2; look export ≤ 2048; ≤ ~5 full-res canvases; snapshots ≤ 8. |
| Model size / first run | First-run sheet "מורידה את כלי הסרת הרקע (פעם אחת, כ-80MB), מומלץ Wi-Fi" with progress; downloaded on first import; SW `CacheFirst`. Fallback: "רקע לבן" wand + brush. Model input is 1024², only the mask is upscaled. |
| Garment photos worn by a model | Salient-object models keep the person: make `CropStep` and the brush fast and prominent. |
| iOS clipboard | Button → `navigator.clipboard.read()`; fallback contenteditable paste target ("לחיצה ארוכה ← הדבק"). Screenshots are first-class via `CropStep`. Android `share_target`. |
| Storage eviction (Safari ITP) | Onboarding pushes "הוסיפי למסך הבית" before content is created (tab and home-screen storage are separate on iOS). `navigator.storage.persist()`. Backup reminder after 14 days. |
| IDB on WebKit | ArrayBuffer storage; small transactions; `QuotaExceededError` → "פני מקום / גבי" dialog. |
| CORS on URL import | On failure show guidance: "האתר חוסם הורדה ישירה. לחצי לחיצה ארוכה על התמונה ← 'העתק', חזרי לכאן ולחצי 'הדבקה'". Optional stage-4 `/api/fetch-image` proxy: https only, block private IPs, `image/*` only, 10 MB cap. |
| Blend modes / pattern transforms on old iOS | Feature-probe `CanvasPattern.setTransform`; fall back to pre-scaled tiles. Test on the target phone in stage 2 task 1. |
| Engine shape drift | `engineVersion` + golden snapshot tests; stored `render` PNG. |
| Stage 5 | IDM-VTON weights are non-commercial; photo leaves the device: explicit consent toggle, strip EXIF, rate limit. |

**Simplifications**: seven patterns are presets over one generator · no camera originals · restore is replace-only · version history = explicit saves, cap 20 · region recolour for imported garments only (designed garments get per-piece fabrics) · warp starts as two sliders · sequins = fabric overlay + patch stamp; embroidery = 4-6 stamp motifs · no pose auto-detection, no arm occlusion · no wasm threads · compare = two static renders.

## 8. Work breakdown

**Stage 1: MVP**
1. Scaffold (Vite + React + TS, Tailwind v4, router, RTL shell, `BottomNav`, `he.ts`, Vitest), `vercel.json`. Spike: Konva stage + bg-removal worker.
2. `db/` (schema, blobs, repos) and `imaging/load.ts`.
3. Bg-removal worker (lazy, progress, first-run sheet); `mask.ts`.
4. `CutoutStep` brush editor (erase/restore, pinch-zoom, undo), shared by dolls and garments.
5. Dolls: add, list, default, multiple poses.
6. `ImportFlow`: file, drag-drop, paste (both paths), URL + CORS guidance, `CropStep`, `MetaStep`.
7. Wardrobe: category tabs, tag filters, garment page.
8. `TryOnStage`: add, select, `Transformer`, `useMultiTouchTransform`, z-order, flip, remove; draft autosave.
9. Onboarding, `storage.persist()`, quota and error toasts.
- **Verify**: build + unit tests pass. On the phone: add a doll, import three garments (file, paste, screenshot + crop), fix a cutout, dress with pinch/rotate, reload and confirm persistence.

**Stage 2: Studio, from scratch**
1. `engine/types`, `body.ts`, geometry helpers; skirt + bodice for an A-line dress; flat debug render; device probe.
2. Profiles, hem, waistFit, ease, flare, slit; `templates.ts`; `legs`; `constraints.ts`.
3. Necklines (5), sleeves/straps (5).
4. `fabricTiles` and `shading`/`folds`.
5. `studioStore` with history; `ParamPanel`, `FabricPanel`; low-res live render, hi-res on release.
6. `DollCalibrate`, `deriveBody`; live preview on doll; auto-fit in try-on with render cache.
7. Details: curve kinds, then free kinds; `DetailOverlay`.
8. Save, "שמירה כעותק", `GarmentVersion`, `VersionsSheet`.
9. Engine tests: every template × neckline × sleeve × length gives closed, finite paths; golden snapshots.
- **Verify**: tests green. On the phone: mermaid dress, V neck, puff sleeves, slit, floral, belt; undo/redo 10 steps; save; reopen an earlier version; auto-fit on two dolls.

**Stage 3: Studio, edit imported**
1. `RasterEditTools` shell, snapshot undo, bake + version on save.
2. Selection mask: wand and brush.
3. Recolour worker with live preview.
4. Lengthen/shorten tool.
5. Warp: mesh renderer, two preset sliders, advanced grid.
6. Apply-fabric (luminance-preserving).
7. Details on raster garments.
- **Verify**: recolour a white top and a region of a dress, lengthen a skirt 30%, taper a waist, apply plaid, add a bow; each undoable; memory stable across 10 edits.

**Stage 4: Looks, backup, PWA, deploy**
1. Save look from draft, looks grid, favourites, reopen.
2. `CompareScreen`; export look as PNG.
3. `backup.ts` export/import with validation.
4. `vite-plugin-pwa`: manifest, icons, precache, model caching, update prompt, `share_target`.
5. Storage panel, backup reminder, orphan-blob GC.
6. Vercel project; optional `/api/fetch-image`.
7. Polish: empty states, error copy, a11y, Lighthouse.
- **Verify**: preview URL; install to home screen; airplane-mode full flow; backup → wipe → restore with identical counts.

**Stage 5 (outline)**: `api/tryon.ts`, `api/edit.ts` proxy to Replicate/fal with env keys; results stored as look renders.

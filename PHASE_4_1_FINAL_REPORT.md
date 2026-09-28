# Phase 4.1 — dimension standardisation, final cleanup, production master

Source of truth: the Phase 4 build (commit `3bbbc29`, `habitat-studio-next-phase4.zip`). Nothing was
redesigned: the Planner art direction, Showcase, the Tetris Assembly Builder, the enclosure → assembly →
room workflow and the RoomDocument architecture are unchanged. This pass fixes the dimension convention,
the RACK 30 fixture, the idle FPS display, and produces a clean production package.

```
CREATE ENCLOSURE → MY ENCLOSURES → TETRIS ASSEMBLY BUILDER → MY ASSEMBLIES → DRAG INTO ROOM → ENTER ASSEMBLY → SELECT ENCLOSURE
```

## 1. The convention (locked)

**WIDTH × DEPTH × HEIGHT — W × D × H** (cs: Š × H × V). `60 × 45 × 90 cm` = 60 wide, 45 deep, 90 high.

`src/model/Dimensions.js` is now the single place that decides how sizes are shown:

| Helper | Purpose |
|---|---|
| `formatDims(size, {unit, sep})` | `{width,height,depth}` or `{w,h,d}` → `"60 × 45 × 90 cm"` (always W × D × H) |
| `parseDims("60 × 45 × 90")` | → `{ width: 0.6, depth: 0.45, height: 0.9 }` (read as W × D × H) |
| `dimLabel(axis)`, `dimShort(axis)`, `dimsOrderLabel()` | "Width / Depth / Height", "W / D / H", "W × D × H" |
| `DIM_LABELS.cs` + `setDimLanguage('cs')` | Czech prepared: Šířka / Hloubka / Výška, `Š × H × V` |

No UI code builds "a × b × c" strings by hand any more.

## 2. Dimension inconsistencies found and how each was corrected

| # | Where | Found | Correction |
|---|---|---|---|
| 1 | Assembly Builder status line | `W × H × max D` order, literally labelled "(W × H × max D)" | `formatDims(stats)` → `186 × 60 × 241 cm (W × D × H, incl. frame)` |
| 2 | Assembly Builder totals | width · **height** · depth | **total width · max depth · total height** (`data-total` order tested) |
| 3 | Assembly Builder palette (enclosure cards) | `width×height×depth` | W×D×H via helper |
| 4 | Assembly Builder palette (modules) | Cabinet `90×80×50` (W×H×D) | `90×50×80` (W×D×H) |
| 5 | Assembly Builder selected enclosure meta + "Replace with" list | W × H × D / W × H | W × D × H |
| 6 | Assembly Builder module & reserved-space fields | W, **H, D** | **W, D, H** (`dimShort`) |
| 7 | Assembly Builder canvas piece labels | front W×H only (`60×60`) — ambiguous | full `60×60×60` / `30×45×18` W×D×H |
| 8 | Assembly Builder guides | line spanned the content, label showed outer size | guides span OUTER size incl. frame; labelled `W 186 cm` / `H 241 cm`; `D max 60 cm (depth)` printed under the width guide |
| 9 | Assembly Builder — frame | only one number (outer) | **Outer incl. frame** `186 × 60 × 241 cm` vs **Enclosure content** `180 × 60 × 238 cm` (`assemblyStats().content`) |
| 10 | Enclosure Designer fields | Width, **Height, Depth** | **Width W · Depth D · Height H** + live `W × D × H = 30 × 45 × 18 cm` |
| 11 | Enclosure Designer stage label | `W × H × D cm` | `W × D × H  30 × 45 × 18 cm` |
| 12 | Enclosure Designer substrate field | labelled "Depth" (substrate layer) — confusable with enclosure depth | "Layer thickness" |
| 13 | MY ENCLOSURES cards | `width×height×depth cm` | W×D×H |
| 14 | MY ASSEMBLIES cards | `width×height×depth cm` | W×D×H |
| 15 | Inspector — physical enclosure / assembly member meta | `W × H × D cm` | W × D × H |
| 16 | Inspector — "Replace with" list | `W×H` | W×D×H |
| 17 | Inspector — assembly section | no dimensions | Outer incl. frame + enclosure content, W × D × H |
| 18 | Inspector — object dimensions | order already W, D, H | labels from `dimLabel`, `W × D × H` hint on the section |
| 19 | Starting-template cards | already W×D×H (hand-built) | via helper, with unit |
| 20 | Toolbar room size | already W × D × H (hand-built, `5.00 × 4.00 × 2.70 m`) | via helper (`5 × 4 × 2.7 m`) |
| 21 | Builder "saved" toast | already W × D × H (hand-built) | via helper + order label |
| 22 | Docs (ASSEMBLY_BUILDER, TEST_REPORT) | "W×H×D", "180 × 265 × 60" etc. | rewritten W × D × H; DATA_MODEL documents the convention |
| 23 | **RACK 30 fixture** | `30 × 45 × 18` entered as W 30 × **H 45** × D 18 → tall 45 cm boxes | **W 30 × D 45 × H 18** — low boxes (see §3) |

Audited without change (already correct or not dimensions): 3D selection overlay labels (W / D / H by axis),
export/import (semantic keys), RoomDocument, diagnostics, comparison panel (ratios), schema.

## 3. RACK 30 — physically corrected

Created through the Designer UI by typing `30`, `45`, `18` into the first, second and third dimension fields
(Width, Depth, Height). Stored `dimensions: { width: 0.30, depth: 0.45, height: 0.18 }`.

* Geometry (e2e measured): **30.7 × 45.5 × 18.0 cm** (W × D × H; the extra mm are the tub lip / handle).
* Builder piece size `{ w: 0.30, d: 0.45, h: 0.18 }`; card `30×45×18 cm`.
* In TEST BREEDING WALL the rack row is now a row of six LOW boxes on top of the terrariums
  (screenshot `3-rack30-low-row`), 18 cm high instead of 45.

## 4. Starting templates — geometry verified against their dimensions

All seven starting templates were measured in both renderers (object-local bounding boxes vs. `size`):
W ↔ x, D ↔ z, H ↔ y match for every template — **no swapped axes** (e.g. Tropical terrarium `60×45×90`:
60 wide, 45 deep, 90 high; Paludarium `120×50×140` incl. cabinet; Tub rack `122×62×178`).

One real defect was found: the planting of the *tropical* and *paludarium* interiors pushed leaf cards
**through the glass** — the parametric "Tropical 60" measured 76 × 58 cm instead of 60 × 45, "Paludarium 120"
125.5 × 62. Fixed by `PaintBuilder.clampSince()`: interior planting / placed items are pressed onto the
inner glass box (nothing is scaled). Now every template built from the catalogue matches within 2.5 cm (tested).

Known, intended deviations outside the body envelope (not dimension errors): lamp hoods on the arid
terrarium (+10 cm on top), conduits of the control panel, tap of the sink, door / window frames and sills,
the tub-rack top shelf.

## 5. Compatibility strategy

* **No data migration and no reinterpretation.** Stored sizes keep semantic keys (`width/height/depth`,
  `w/h/d`); display order is decided only by `Dimensions.js`. JSON key order is irrelevant.
* A Phase 4 project whose old RACK 30 is `{ width: 0.3, height: 0.45, depth: 0.18 }` loads exactly like that
  (a 45 cm tall, 18 cm deep box — shown as `30 × 18 × 45 cm`). The user can edit it in the designer.
* Document version stays **2**; v1 files (e.g. `data/demo-room.json`) still import.
* Tested: Phase-4 fixture import (dims, placement rotation, instance id, code, member id preserved), v1
  import, full export → import round trip identical.

## 6. Idle diagnostics ("0 fps")

The on-demand renderer draws nothing while nothing changes; the HUD used to average frames over wall-clock
time and showed `0 fps`. Now:

* FPS is measured only over **back-to-back rendered frames**; the last valid sample is kept.
* After 300 ms without a frame the HUD shows **`IDLE · last 60 fps · 16.6 ms`** (diagnostics panel too).
* No frame is rendered to keep the counter alive (test: frame counter unchanged over 1.5 s while idle).
* The stats line got its own row above the status text (it overlapped the hint at narrow widths).

Adaptive quality is unchanged (EMA + hysteresis levels, MSAA kept at 100 %, anisotropy, mipmaps): the
render scale drops only when measured interactive frame time requires it.

## 7. Production package

Two ZIPs:

* **`HABITAT_STUDIO_NEXT_PRODUCTION.zip`** (15.3 MB, 205 files, 24.2 MB unpacked) — the upload package, built by
  `node tools/package-production.mjs`. One folder `habitat-studio-next/` →
  entry point **`/habitat-studio-next/index.html`**. Static files only; no build step; no server code.

  | Included | Why |
  |---|---|
  | `index.html` | entry point (import map → `./vendor/three/…`, all paths relative) |
  | `.htaccess` | MIME / charset / caching for this folder only |
  | `src/` (74 files) | application ES modules |
  | `vendor/three/` (46 files) | three.js r186 + used addons (loaded by the import map, some lazily) |
  | `assets/` (139 files) | GLB models, PBR textures, HDR, painted atlas, thumbnails — all kept |
  | `data/demo-room.json` | demo room |
  | `schema/habitat-room.schema.json` | document schema (for integrators) |
  | `ASSET_LICENSES.md`, `DEPLOY.txt` | licences must ship with the assets; deployment note |

  Excluded: `tests/`, `tools/`, `docs/` (screenshots, comparison images, perf JSON), `node_modules/`,
  `package*.json`, developer markdown, logs, Playwright output, caches, `*.bak/*.old/*~`, OS metadata (a junk
  filter runs over every copied path; none were present).

* **Full development ZIP** (`habitat-studio-next-phase4_1-dev.zip`, `node tools/package.mjs`): everything above
  plus sources for assets, tools, tests, docs, screenshots and all reports.

**Dependency audit before excluding anything**: the running app (both renderers, every catalogue type
placed, all lighting presets, library thumbnails, Enclosure Designer, Assembly Builder) was driven in a
browser and every request recorded: **193 requests, 0 failures**. Only 9 shipped files were never requested
(model manifest, 4 texture maps, the schema, the three.js licence / version files, one geometry helper): all are
tiny and were **kept** (dynamic / conditional paths); nothing under `assets/` was deleted.

**Verified on real Apache 2.4** (installed in this container) with the ZIP extracted to
`<docroot>/habitat-studio-next/` next to a mock parent application (`AllowOverride All`):

| URL | Content-Type |
|---|---|
| `/habitat-studio-next/` and `/index.html` | `text/html; charset=utf-8` |
| `*.js` / `*.mjs` | `text/javascript; charset=utf-8` |
| `*.json` | `application/json; charset=utf-8` |
| `*.glb` | `model/gltf-binary` |
| `*.webp` | `image/webp` |
| `*.hdr` | `image/vnd.radiance` |
| parent `/parent.js`, `/parent.json`, `/index.html` | unchanged server defaults, no caching headers from us |

A browser session against that Apache instance (Planner → Showcase, designer, builder, all catalogue types)
made 193 requests, all inside `/habitat-studio-next/`, 0 failures. The `.htaccess` contains no rewrite rules;
every block is `IfModule`-guarded, so it is inert where a module is missing and cannot affect the parent
IR Manager application.

## 8. Test results

`node tests/run-e2e.mjs` (Chromium + SwiftShader, starts its own server) — **49 / 49 passed**
(Phase 4: 43 tests; 4.1 adds 6 regression tests and extends the Phase 4 workflow tests).

The whole Phase 4 test workflow was repeated **through the UI with real pointer drags** — nothing was
written as JSON: TERRA 60 (60 × 60 × 60) and RACK 30 (typed 30 / 45 / 18 into Width / Depth / Height) in the
Designer; 9 × TERRA 60 (3 × 3, rough drops snapped exactly), 6 × RACK 30 (a row of low boxes) above,
collision rejection (Alt-drop onto an occupied spot), undo / redo, cabinet dropped under the floor line and
set to full width × 40 cm, **auto frame** → saved TEST BREEDING WALL: **outer 186 × 60 × 241 cm**
(W × D × H incl. 3 cm uprights + top rail), **content 180 × 60 × 238 cm** (40 + 3 × 60 + 18), 16 members,
15 distinct physical ids. Dragged from MY ASSEMBLIES into the room (ONE `assembly` object, footprint
186 × 60 × 241), moved, rotated, room collision; ENTER ASSEMBLY → one TERRA 60 selected (code, instance id,
device ids `inst_…:light`, `inst_…:tsens`) → Esc → Esc; export + autosave → **reload** → placement, rotation,
all ids, relative positions and dimensions identical; PLANNER → SHOWCASE → PLANNER leaves the document
identical; export → import identical. Mixed Tetris (large 100 × 50 × 90, two 50 × 45 × 45 stacked beside,
two 75 × 50 × 50 below, two low RACK 30 above, reserved space, technical cabinet): no overlaps, irregular,
reserved space saved as its own entry.

Earlier run of the same suite: 48 / 49 — the ENTER test double-clicked the workbench standing between the
(room-clamped) focus camera and the wall; the test now frames the wall explicitly (app behaviour unchanged).

| Test | Result | |
|---|---|---|
| initial room load (demo room, UI panels, render loop) | ✓ |
| GLB loading (all catalogue models load, materials bound) | ✓ |
| missing asset handling (placeholder, logical object intact, no crash) | ✓ |
| camera orbit / pan / zoom | ✓ |
| view presets & smooth transitions (top/front/left/right/iso/reset) | ✓ |
| fullscreen toggle | ✓ |
| selection by clicking an object | ✓ |
| move by dragging (grid snapped) + undo | ✓ |
| rotation (keyboard R, inspector) + snapping angle | ✓ |
| duplicate (Ctrl+D) and delete (Del) | ✓ |
| snapping: wall snap, grid snap, stacking on a stand, collision report | ✓ |
| room resizing (inspector) rebuilds walls and keeps objects inside | ✓ |
| add enclosure from library (click-to-place) | ✓ |
| add furniture by drag & drop from the library | ✓ |
| wall placement: door & window follow walls and cut openings | ✓ |
| JSON export (download) | ✓ |
| JSON re-import (round trip) | ✓ |
| browser refresh restores the autosaved room | ✓ |
| responsive viewport resizing | ✓ |
| lighting presets & quality levels | ✓ |
| progressive renderer: interactive while orbiting, final restored after settling | ✓ |
| shadow invalidation on placement change | ✓ |
| no shader recompilation on lighting presets / occupancy / placement preview | ✓ |
| static batching reduces draw calls; selection detaches the object | ✓ |
| Auto quality mode available and adaptive diagnostics exposed | ✓ |
| Planner ↔ Showcase switching leaves RoomDocument, ids and transforms untouched | ✓ |
| Planner renders the room cheaply (batched painted materials, no lights, no shadow maps) | ✓ |
| Planner selection by clicking (amber rim on the detached object) | ✓ |
| edits in Planner are shown by Showcase (stale mode re-synced on activation) | ✓ |
| export / import round trip in Planner mode is identical to Showcase | ✓ |
| Planner lighting presets & selector UI | ✓ |
| Planner starts without loading the realistic pipeline (lazy Showcase) | ✓ |
| Enclosure Designer: create "TERRA 60" (60×60×60, glass, sliding doors, ventilation, tropical) via the UI | ✓ |
| Designer rebuilds parametrically — resizing never scales the model | ✓ |
| Enclosure Designer: create "RACK 30" rack box — 30 × 45 × 18 cm = W 30 × D 45 × H 18 (low box) | ✓ |
| RACK 30 physical geometry is 30 wide, 45 deep, 18 high (not a 45 cm tall box) | ✓ | **new 4.1**
| Assembly Builder: drag TERRA 60 ×9 (3×3) and RACK 30 ×6 above — magnetic snapping, no overlaps | ✓ |
| Assembly Builder: technical cabinet below, save as "TEST BREEDING WALL" (dimensions verified) | ✓ |
| Drag TEST BREEDING WALL from MY ASSEMBLIES into the room; move & rotate it as ONE structure | ✓ |
| ENTER ASSEMBLY → select one terrarium → exit (hierarchical selection) | ✓ |
| Save project, reload: assembly placement, all ids, relative positions and dimensions preserved; Planner/Showcase switching safe | ✓ |
| Mixed Tetris: large + stacked smalls, normals below, rack boxes above, reserved space, tech cabinet — no uniform grid | ✓ |
| Performance: 5 assemblies / 50+ enclosure members in the room stay batched | ✓ |
| W × D × H convention: formatter, parser and every user-facing dimension text | ✓ | **new 4.1**
| Assembly dimension calculation: total width, max depth, total height (± frame) | ✓ | **new 4.1**
| Export / import compatibility: Phase 4 files and v1 files load without reinterpreting width/height/depth | ✓ | **new 4.1**
| Idle diagnostics: render-on-demand shows "IDLE · last N fps", no continuous loop | ✓ | **new 4.1**
| Starting templates: geometry matches their W × D × H (no swapped axes, planting inside the glass) | ✓ | **new 4.1**
| no fatal console errors | ✓ |

Additional checks run for this pass:

* **Starting templates** in both renderers: every body matches W ↔ x, D ↔ z, H ↔ y (see §4).
* **Planner visual regression** — Phase 4 build vs. 4.1 build, identical cameras (hero / iso / interior,
  quality High): mean pixel difference 0.4 / 255, 0.5 % of pixels changed; the differences are the HUD
  stats row (moved up) and thin slivers where leaves now stop at the glass. Draw calls (18) and triangles
  (60 k) identical — the approved Planner look is unchanged.
* **Production package under real Apache 2.4** with the bundled `.htaccess` (§7).

## 9. Performance before / after

`node tests/assembly-perf.mjs` (SwiftShader, 1280 × 720) — Phase 4 (`docs/assembly-perf-results.json`) vs.
Phase 4.1 (`docs/assembly-perf-results-4_1.json`):

| | Phase 4 | Phase 4.1 |
|---|---|---|
| Planner demo room — draws / triangles | 18 / 63 514 | **18 / 63 514** |
| Planner demo — batches / batched instances | 5 / 73 | 5 / 73 |
| Planner demo — heap | 24.2 MB | 21.2 MB |
| Planner demo — orbit (median rAF) | 7.2 fps | 7.4 fps |
| **Planner 5 assemblies / 75 enclosures — draws** | **25** | **25** |
| Planner 5 assemblies — triangles | 311 773 | 311 773 |
| Planner 5 assemblies — batches / instances | 5 / 265 | 5 / 265 |
| Planner 5 assemblies — geometries / textures | 39 / 15 | 39 / 15 |
| Planner 5 assemblies — heap | 28.4 MB | 28.1 MB |
| Planner 5 assemblies — build (save + place) | 150 ms | 129 ms |
| Planner 5 assemblies — orbit | 5.5 fps | 6.4 fps |
| Showcase demo — draws / triangles | 384 / 868 k | 384 / 868 k |
| Showcase 5 assemblies — draws / triangles | 89 / 929 k | 89 / 929 k |
| In-suite perf test (5 assemblies, 75 ids) | 28 draws · 305 k tris · 5 batches | 28 draws · 305 k tris · 5 batches |

No regression: identical draw calls, triangles, batching and resource counts (the dimension work adds no
geometry or material instances; the planting clamp moves vertices only). Frame times are SwiftShader
numbers and within run-to-run noise. The real-hardware baseline (~60 fps / 16.6 ms / ~14 draws / ~58 k tris,
100 % scale on the small room) uses the same code path; the only engine change is the HUD's FPS bookkeeping.

## 10. Files changed (since Phase 4)

| File | Change |
|---|---|
| `src/model/Dimensions.js` | **new** — convention, formatter, parser, labels (en + cs) |
| `src/assembly/AssemblyBuilder.js` | totals W·D·H, outer vs content, guides, labels, fields, `RESERVED_DEFAULT` |
| `src/enclosures/EnclosureDesigner.js` | W / D / H fields + live summary, stage label, substrate "Layer thickness" |
| `src/ui/Inspector.js`, `src/ui/LibraryPanel.js`, `src/ui/Toolbar.js` | helper-based dimension texts, assembly outer/content |
| `src/model/Library.js` | `assemblyStats().content`, `RESERVED_DEFAULT` |
| `src/planner/PaintBuilder.js` | `clampSince()` |
| `src/planner/components.js`, `src/enclosures/EnclosureGeometry.js` | interiors / items clamped inside the glass |
| `src/App.js`, `src/ui/Hud.js`, `src/planner/PlannerEngine.js`, `src/renderer/RenderEngine.js` | idle-aware FPS, `IDLE · last N fps` |
| `src/styles/app.css` | dimension summary styles, HUD rows |
| `.htaccess` | **new** — folder-scoped MIME / charset / caching |
| `tools/package-production.mjs` | **new** — clean production ZIP |
| `tools/package.mjs` | dev ZIP includes `.htaccess`, this report |
| `tests/run-e2e.mjs` | RACK 30 = W30 D45 H18, auto frame dimensions, 6 new regression tests, optional `SHOTS` screenshots, ENTER test camera framing |
| `tests/assembly-perf.mjs` | RACK 30 fixture corrected |
| `ASSEMBLY_BUILDER.md`, `DATA_MODEL.md`, `ENCLOSURE_BUILDER.md`, `TEST_REPORT.md` | convention documented, figures corrected |
| `docs/screenshots/phase4_1/` | fresh validation screenshots (old `phase4/` set with tall rack boxes removed) |

## 11. Known limitations

* All measurements come from Chromium + SwiftShader (CPU rasteriser) in this container; absolute FPS is
  not representative of real hardware (the real-hardware Planner baseline of ~60 fps / 16.6 ms / ~14 draws /
  ~58 k tris on the small room cannot be re-measured here). Draw calls, triangles, batches and memory are.
* Existing Phase 4 projects keep whatever sizes they stored (by design); a RACK 30 saved by Phase 4 stays
  45 cm tall until edited.
* Czech labels are prepared (`setDimLanguage('cs')`) but the UI has no language switch yet.
* While an assembly is *entered* it is drawn detached from the batches (≈ 70–80 draws for the 16-piece wall).
* Showcase draws custom enclosures with the painted parametric geometry (no GLB exists for user designs).
* Focus (F / double-click) on a large structure can be clamped by the room size so furniture stands between
  camera and object; the e2e ENTER test frames the wall explicitly.

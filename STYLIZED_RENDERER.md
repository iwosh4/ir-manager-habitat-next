# PLANNER — stylised hand-painted renderer

Habitat Studio has two renderers over one room:

| | **PLANNER** (default) | **SHOWCASE** |
|---|---|---|
| Purpose | everyday planning: fast on any GPU, readable, calm | presentation: the approved realistic look |
| Look | original IR Manager hand-painted style: graphite room, warm amber accents, luminous enclosure dioramas | physically based, HDRI, soft shadows, GTAO, bloom |
| Assets | procedural parametric kit + one painted atlas (412 KB) | 26 GLB models + PBR texture sets + HDRI |
| Loaded | at start-up | on first switch (lazy: dynamic import + downloads) |

Switch with the **PLANNER / SHOWCASE** selector at the left of the toolbar or `?mode=planner|showcase`.
Both renderers draw the **same `RoomDocument`** (`ir-manager/habitat-room` v1, unchanged), use the same
editor, selection, snapping, undo history, camera and canvas. Switching is a pure view change.

The Showcase renderer is untouched: its code path, GLB assets, materials and post-processing are the
approved Phase 1/2 pipeline. The only changes on its side are structural (it is now constructed on the
shared WebGL renderer and imported lazily) plus one bug fix in the settle window (see PERFORMANCE.md).

---

## 1. Architecture

```
            ┌──────────── logical layer (unchanged) ─────────────┐
 UI ───────▶│ Editor · History · Snapper ─▶ RoomDocument (JSON)   │──▶ Persistence / export / import
            └───────────────┬────────────────────────────────────┘
                            │ change events (ids)
            ┌───────────────▼──────────── App (composition root) ─────────────────────────┐
            │ shared: WebGLRenderer + canvas · CameraRig · SelectionOverlay · CSS2D labels  │
            │ active mode ◀── setRenderMode() ──▶ inactive mode (marked stale, re-synced)   │
            └───────┬──────────────────────────────────────────────┬───────────────────────┘
      ┌─────────────▼─────────────┐                  ┌─────────────▼──────────────┐
      │ PlannerMode               │                  │ ShowcaseMode (lazy)        │
      │  PaintedMaterials (atlas) │                  │  MaterialLibrary (PBR)     │
      │  PlannerShell             │                  │  RoomShell · Lighting · Env│
      │  ObjectLayer(PlannerView) │                  │  ObjectLayer(ObjectView)   │
      │  StaticBatcher            │                  │  StaticBatcher             │
      │  PlannerEngine            │                  │  RenderEngine (composer)   │
      └───────────────────────────┘                  └────────────────────────────┘
```

* **One document, two view sets.** `ObjectLayer` is shared code; it is given the view class
  (`PlannerView` or `ObjectView`). Both implement the same contract (`root`, `proxy`, `visual`,
  `update(obj)`, `setHidden`, `dispose`, `version`), so picking (logical proxy boxes), snapping,
  collision, dragging, the ghost preview, cut-away and the batcher work unchanged.
* **No second state.** Views are derived from the document; nothing is written back. The inactive
  mode is only flagged `stale` on edits and does a full `syncDocument()` when activated.
* **Shared canvas.** `createRenderer()` (`src/renderer/quality.js`) creates the one WebGL2 context. Only
  the active engine sizes the canvas and draws; switching never re-creates the context.
* **App getters** (`app.engine`, `app.scene`, `app.objects`, `app.batcher`, `app.shell`) resolve to the
  active mode, so UI, interaction and tests are renderer-agnostic.
* **Lazy Showcase.** `App` statically imports only the Planner. `ShowcaseMode` (and with it
  `RenderEngine`, the post-processing passes, `GLTFLoader`, `MaterialLibrary`, the HDRI and all GLBs) is
  loaded by `import()` on first use; the toolbar shows progress while the Planner keeps rendering.
  Layer constants moved to the dependency-free `src/renderer/layers.js` for this reason. A test asserts
  that a Planner session downloads no `.glb`/`.hdr` and no post-processing module.

Files:

| File | Role |
|---|---|
| `src/modes/PlannerMode.js`, `src/modes/ShowcaseMode.js` | mode objects (init / activate / sync / frame / diagnostics) |
| `src/planner/PlannerEngine.js` | the Planner render loop contract (same API as `RenderEngine`) |
| `src/planner/PaintedMaterials.js` | atlas loading + the 5 shader materials (+2 selection variants) |
| `src/planner/PaintBuilder.js` | geometry accumulator: bakes painted attributes, merges to ≤5 meshes |
| `src/planner/geometry.js` | low-level generators (chamfer box, leaf card, tapered tube, faceted rock, relief…) |
| `src/planner/components.js` | builder-ready parametric component kit + dioramas |
| `src/planner/stylizedModels.js` | all 26 catalogue types, generated at logical size |
| `src/planner/PlannerView.js` | per-object view + reference-counted geometry cache |
| `src/planner/PlannerShell.js` | walls (same opening logic as Showcase), floor, ceiling, light pools |
| `src/diagnostics/RendererComparison.js`, `src/ui/ComparisonPanel.js` | SHOWCASE vs PLANNER for the same camera |
| `tools/asset-pipeline/build-planner-atlas.mjs` | offline painter for the atlas |

## 2. Art direction & art pipeline

*Original look, not a game style copy.* Crafted, dark, warm, calm; nothing cartoon-bright:

* **Room subdued** — graphite / charcoal walls with a vertical value gradient, warm-grey polished
  floor, dark steel furniture with painted edge highlights. The north feature wall stays darkest.
* **Amber is information** — selection (rim + brackets + overlay), rack identification stripes, labels,
  status dots, small LEDs. Nowhere else.
* **Enclosures are the heroes** — the only saturated, luminous areas: warm sandstone and sand, deep cork
  and moss, teal water. *Occupied* enclosures are lit (painted lamp pools, glowing fixture, animal);
  *empty* ones get paper + hide and a cool, dim interior; *lighting off* removes the lamp pool.
* **Illustrated edges** — chamfered geometry catches a crisp highlight on every edge from the painted key
  light, a soft rim darkening shapes silhouettes, and a 1-pixel warm-dark ink line is drawn on depth
  discontinuities. No thick outlines.

**Atlas** (`assets/planner/atlas.webp`, 2304², 9×9 cells of 256 px with an 8 px gutter, 73 tiles,
412 KB). Painted offline by `build-planner-atlas.mjs` with a small brush engine (tapered strokes, dabs,
mottling, pebbles, grain, posterise) — no photographs, no third-party textures. Tiles are either
*repeating* (seamless, value-flat: the light comes from geometry) or *clamped* faces/sprites (labels,
displays, control faces, doors, leaves, fern fronds). Repeating tiles are wrapped with `fract()` inside the
cell and sampled with `textureGrad` (derivatives clamped to the gutter) so mip-mapping never bleeds.

Tile groups: architecture · metals & boards · light & emissive · glass & water · naturals (sand, soil, moss,
cork, bark, driftwood, sandstone, basalt, faceted rock, gravel, clay) · substrate cross-sections
(arid / tropical / paludarium) · foliage sprites · animal skins · printed faces.

## 3. Materials

One `ShaderMaterial` family, all sharing **one uniform block** and **one texture**:

| Material | Used for | State |
|---|---|---|
| `painted_opaque` | everything solid | opaque, depth write |
| `painted_cutout` | leaves, fronds, grass, cork | alpha-test, double-sided |
| `painted_glass` | panes, water, waterfall | blended, no depth write, double-sided |
| `painted_decal` | contact shadows, mesh screens, wall occlusion | blended, polygon offset |
| `painted_glow` | lamp halos, light pools, sparkle | additive |
| `…_sel` (2) | opaque/cutout of the selected object | amber rim variant |

Per-vertex attributes carry everything else, so any number of different-looking objects share a draw call:

* `tile` — atlas cell + wrap mode (+1000 clamp, +2000 repeat-U) + room-light flag (+10000);
* `uv` — metres (repeating) or 0..1 (faces, sprites);
* `color` (vec4) — rgb: tint × baked occlusion × painted gradient × baked lamp light; a: self-illumination.

Fragment shading (≈25 ALU + 1 texture fetch): wrapped two-tone *painted* key ramp (soft band between shade
and key colours) + sky/ground fill → × vertex colour → rim darkening → height grounding → + emissive.
**Glass** is cheap and stylised: tinted alpha + painted streak tile + fresnel sheen, no transmission, no
refraction; pane edges are separate tinted strips (reads as thick glass). Water: tinted blended surface
with painted ripples + a darker front section.

## 4. Lighting strategy

No real-time lights, no shadow maps. Light is **painted** in three places:

1. **Uniforms** — one key direction with key/shade colours, sky and ground fill, emissive, glow and room
   light levels. Day / Evening / Night only change these uniforms (zero shader recompiles).
2. **Vertex colours at build time** — `PaintBuilder.lamp()` registers enclosure fixtures (LED bars, basking
   spots); every interior part flagged `lit` receives a warm/cool pool of light (smooth falloff, facing and
   "below the lamp" terms) and self-illumination, so interiors glow at night. Interiors without a lamp are
   darkened and cooled. Floor occlusion along walls/corners and interior occlusion (back corners, sides,
   floor) are baked the same way.
3. **Cheap decals** — contact-shadow blobs under every floor object, painted shadows behind wall-mounted
   items, wall-base occlusion, additive light pools under the ceiling panels and in front of the window.
   Ceiling panels, window daylight and pools carry the *room-light* flag: Evening dims them, Night turns
   them off while enclosure lamps keep glowing.

## 5. Render & draw-call strategy

```
scene pass → HalfFloat MSAA×4 target (no tone mapping)  →  blit: soft shoulder · split tone · vignette ·
             (≈15–35 draws)                                   ink edge (depth) · linear→sRGB   (1 draw)
```

* **Merged per object**: `PaintBuilder.build()` merges every part of an asset into one mesh per bucket —
  a complete terrarium (frame, doors, glass, background, substrate, rocks, plants, lamp, animal) is ≤5
  meshes; a six-tank rack likewise.
* **Batched across objects**: the existing `StaticBatcher` folds all views into one `BatchedMesh` per
  material (multi-draw). With the painted family that is ~5 batches for *all* objects, independent of
  object count. The selected / dragged object is detached and drawn with its selection variants.
* **Geometry cache**: views with the same type, size and visual props share geometry
  (reference-counted), e.g. 40 identical racks = 1 build.
* **Adaptive**: stationary frames render at the device pixel ratio (Auto caps at 1.5, 1.0 on software
  GPUs); while interacting the same pass renders at an adaptive scale that only drops if the measured
  frame exceeds the 60 fps budget (floor 50 %). Render-on-demand like the Showcase.
* **Auto quality (sharpness fix)**: the interactive scale is chosen from an EMA of the time *between
  consecutive interactive frames* (idle gaps and the first frame after a pause are ignored — counting them
  was what made AUTO drop to 50 % and look pixelated). Levels with hysteresis: ≤ 20 ms → 100 %,
  20–25 → 90 %, 25–33 → 80 %, 33–45 → 70 %, > 45 → 60 %; a level drops only after two confirmations above
  its bound × 1.08 and recovers when below the next bound × 0.85; > 80 ms single frames trigger the 50 %
  emergency floor. At 100 % the interactive frame keeps the MSAA target (no sharpness change when you
  start orbiting). The painted atlas uses mipmaps + anisotropy `min(8, max)`; the canvas backing store
  equals CSS size × DPR (no CSS up-scaling).
* **Nothing expensive is merely disabled**: there is no composer, no G-buffer, no AO, no bloom, no
  shadow map, no light loop, no environment map in the Planner's code path.

## 6. Performance

All numbers below were measured in this environment on **SwiftShader** (Chromium's CPU software
rasteriser, `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0…`), 1280×720 viewport, pixel ratio 1. That is a
deliberately hostile "weak GPU": absolute times are 50–200× slower than a real integrated GPU; the
**ratios** are the meaningful result. Reproduce with `node tools/compare-renderers.mjs` (identical
cameras, both renderers on the same WebGL context, each frame GPU-synchronised with `readPixels`).

**Same camera, same room, both renderers** (`docs/comparison/report.json`):

| camera | Showcase final | Planner final | | Showcase interactive | Planner interactive | | draw calls | triangles |
|---|---|---|---|---|---|---|---|---|
| hero | 8439 ms | 870 ms | **9.7×** | 2690 ms | 549 ms | **4.9×** | 371 → 18 | 834k → 62k |
| iso | 5222 ms | 411 ms | **12.72×** | 1569 ms | 215 ms | **7.29×** | 334 → 13 | 812k → 61k |
| top | 7956 ms | 741 ms | **10.74×** | 2496 ms | 463 ms | **5.39×** | 366 → 17 | 847k → 63k |
| front | 5564 ms | 553 ms | **10.06×** | 1774 ms | 316 ms | **5.62×** | 337 → 16 | 778k → 59k |
| interior | 8083 ms | 808 ms | **10.01×** | 2539 ms | 574 ms | **4.42×** | 374 → 18 | 836k → 62k |
| arid | 7719 ms | 702 ms | **11×** | 2390 ms | 560 ms | **4.27×** | 183 → 13 | 276k → 44k |
| tropical | 6952 ms | 715 ms | **9.72×** | 2178 ms | 486 ms | **4.48×** | 188 → 14 | 484k → 44k |
| paludarium | 6966 ms | 804 ms | **8.66×** | 2181 ms | 520 ms | **4.19×** | 215 → 14 | 373k → 36k |
| rack | 8468 ms | 816 ms | **10.38×** | 2737 ms | 548 ms | **4.99×** | 258 → 17 | 586k → 54k |

Scene resources (hero): Showcase 128 materials · 97 textures · 27 lights
(1 shadow casters) — Planner 40 materials · 1 textures (the atlas + render targets) · 0 lights.

**Continuous mouse interaction** (`MODE=… node tests/benchmark.mjs "" balanced`, real rAF loop, left-drag orbit):

| | Showcase (Balanced) | Planner |
|---|---|---|
| orbit — median frame | 1772 ms (0.45 fps) | 212 ms (4.9 fps) |
| orbit — p95 frame | 4880 ms | 334 ms |
| zoom — median frame | 1703 ms | 213 ms |
| pan — median frame | 1368 ms | 153 ms |
| draw calls while interacting | 189 | 16 |

≈ 8–11× smoother interaction on the same (very weak) hardware. Projected to a typical integrated GPU,
where the Showcase interactive profile already reaches ≈ 30 fps (PERFORMANCE.md), the Planner has the
headroom to hold 60 fps at full resolution.

**Scalability** (`node tests/stress.mjs 300`): a generated 18.6 × 13.2 m facility with **300
enclosures** (40 six-tank racks + 60 singles, 100 objects, standard RoomDocument):

| metric | Planner |
|---|---|
| build of all views (procedural, cached) | 163 ms |
| draw calls | **18** (5 batches — independent of object count) |
| triangles | 1.50 M |
| stationary / interactive frame (SwiftShader) | 2.49 s / 0.73 s |

Draw calls stay constant as the facility grows; cost scales only with triangles and covered pixels, which
the geometry cache and adaptive interactive resolution keep in check.

Start-up: the Planner downloads the 412 KB atlas and no models; the Showcase is fetched (≈ GLB + textures +
HDRI + post-processing modules) only when the user first selects it.

## 7. Builder asset structure

`src/planner/components.js` is the kit a future enclosure / rack / cabinet builder assembles from.
Every component takes real dimensions in metres; fixed-size parts (handles, hinges, locks, labels, LEDs,
profile sections, vents' slot pitch) keep their size when the assembly is resized, so nothing is ever
stretched:

| Component | Parameters |
|---|---|
| `frameProfile(a, c, {w, h})` | straight profile between two points, rounded section |
| `glassPanel(w, h, pos, {rotY, edge})` | pane + tinted edges |
| `doorPanel(w, h, pos, {handle})` | inset door with shadow gap + fixed-size bar handle |
| `ventStrip(w, h, pos, {slotsPerM})` | slot pitch in metres (more slots when wider) |
| `lightStrip(w, pos, {temp, lit})` | housing + diffuser + glow + painted lamp |
| `labelCard(pos, {status})` | label with optional amber status dot |
| `rackRail(h, pos)` | upright tube with foot and cap |
| `cabinetModule(W, H, D, {doors})` | carcass, plinth, top, n doors |
| `terrariumShell({W, H, D, style})` | sliding / hinged / rimless enclosure; returns interior bounds |
| `backgroundPanel(I, {tile, ledges})`, `sideRock` | relief backgrounds sized to the interior |
| `substrateVolume(I, surf, {top, section})` | height-field surface + visible cross-section |
| `stone`, `branch`, `corkTube`, `waterBowl` | hardscape |
| `bromeliad`, `fernClump`, `strapPlant`, `succulent`, `grassTuft`, `groundCover`, `mossMound`, `vine` | planting |
| `coiledPython`, `gecko`, `frog` | animals |
| `aridInterior`, `tropicalInterior`, `paludariumInterior`, `emptyInterior` | dioramas that adapt to any interior size |
| `terrariumCell(mats, {W, H, D, style, interior})` | complete enclosure as a sub-assembly (used by racks) |

Assemblies nest with `PaintBuilder.include(builder, pos, rotY)` (lamps are resolved inside the
sub-assembly first). The atlas painter (`build-planner-atlas.mjs`) is the matching texture side: new
tiles are added by name and referenced by name.

## 8. Quality gate — how it was judged

* Not the Showcase on Low: different asset source (procedural kit vs GLB), different materials (painted
  atlas vs PBR), different lighting (painted vs lights + shadow maps + IBL), different frame graph
  (1 pass + blit vs composer chain). Nothing in the Planner code path references the Showcase pipeline.
* Not primitive boxes: chamfered profiles, separate frames/tracks/doors/handles/vents/labels, sculpted
  relief backgrounds, faceted rocks, tapered branches, bent leaf cards, animals.
* Interiors keep their richness: every enclosure has a full diorama (see close-ups), including the six
  rack cells.
* Visually checked in Day / Evening / Night, from hero, iso, top, front, eye-level and close-up cameras
  (screenshots in `docs/comparison/`: `<view>_compare.jpg` = Showcase | Planner from the identical
  camera, `<view>_showcase.jpg` / `<view>_planner.jpg` singles; close-ups `arid_*`, `tropical_*`,
  `paludarium_*`, `rack_*`; `planner_evening.jpg`, `planner_night.jpg`, `planner_selection.jpg`).

## 9. Tests

`npm test` (tests/run-e2e.mjs) runs the original 26 tests against the Showcase (`?mode=showcase`) and adds:

* switching Planner ↔ Showcase leaves the RoomDocument, object ids, view transforms, selection and undo
  history untouched (and both modes have a view for every id with identical placement);
* the Planner renders the room with batched painted materials, no lights and no shadow maps; its
  diagnostics show renderer, draw calls, triangles, render scale, materials, GPU;
* clicking selects in the Planner (amber rim materials on the detached object, restored on deselect);
* edits made in the Planner appear in the Showcase after switching;
* export in Planner equals export in Showcase; import in Planner re-syncs both;
* lighting presets and the mode selector UI;
* a fresh Planner session downloads no GLB/HDR and no post-processing module.

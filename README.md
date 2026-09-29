# IR Manager — Habitat Studio Next

A standalone, browser-based **3D planner for reptile breeding facilities** (three.js r186, WebGL 2) with
two renderers over the same room: **PLANNER** — a stylised hand-painted real-time renderer, fast on any
GPU (default) — and **SHOWCASE** — the approved physically based realistic renderer (loaded on demand).
A detailed reference breeding room and a real editor: select, move, rotate, duplicate, delete, snap,
resize, place from a library, export/import JSON.

**Custom enclosures & assemblies**: design your real enclosures parametrically (**MY ENCLOSURES**), build
breeding walls / racks by dragging them together in a Tetris-like front elevation (**Assembly Builder** →
**MY ASSEMBLIES**) and drag a finished assembly into the room as one structure — every enclosure inside
keeps its own id. See **ENCLOSURE_BUILDER.md**, **ASSEMBLY_BUILDER.md**, **DATA_MODEL.md**, **TEST_REPORT.md**.

**Habitat Studio 4.2** (see **HABITAT_STUDIO_4_2_REPORT.md**): no ceiling, free camera with fit / corner presets,
camera-aware walls (AUTO · ALL · CUTAWAY · FOOTPRINT · HIDE), per-wall paints and claddings, floors, attic wall
profiles, one shared procedural window model (blinds NONE / venetian / roller), door types, an extended catalogue
of 90 items in 14 categories, and the **TECH PLAN** mode for water, misting, drainage, electrical and sensor networks.

This is a greenfield prototype meant to be integrated into IR Manager (PHP/MySQL) **after** visual
review. It has no server-side dependencies: it runs from any static web server.

---

## Quick start

Requirements: a desktop browser with **WebGL 2** (current Chrome, Edge, Firefox or Safari) and any static
file server. There is **no build step** — the repository is the deliverable.

```bash
# from the project root (the folder containing index.html) — pick ONE:
node tools/serve.mjs 8080          # zero-dependency server included in the project (Node 18+)
python3 -m http.server 8080        # Python 3
php -S localhost:8080              # PHP built-in server (same stack as IR Manager)
npx serve -l 8080 .                # Node "serve" package
```

Then open **http://localhost:8080/** .

> Opening `index.html` directly from the file system (`file://`) does not work: browsers block ES module
> and model loading from `file://`. Always use a web server.

The demonstration room (`data/demo-room.json`) opens automatically on first launch. Afterwards the last
state is restored from browser storage (autosave); use **Load demonstration room** in the toolbar to
reset.

## Render modes

| Mode | What it is | Switch |
|---|---|---|
| **PLANNER** (default) | stylised hand-painted renderer: painted atlas + 5 tiny shader materials, painted light, no real-time lights / shadow maps / post chain; ≈20 draw calls for the whole room | toolbar **PLANNER** · `?mode=planner` |
| **SHOWCASE** | the approved realistic renderer (GLB + PBR + HDRI + shadows + GTAO + bloom), downloaded and compiled the first time you switch | toolbar **SHOWCASE** · `?mode=showcase` |
| **TECH PLAN** (4.2) | the Planner with the room subdued and the technical network on top: routes coloured by type with flow arrows, in-wall runs highlighted, ports, circuits, route editor, layers ROOM · ENCLOSURES · WATER · MISTING · DRAINAGE · ELECTRICAL · SENSORS | toolbar **TECH PLAN** · **T** · `?mode=techplan` |

Both render the same `RoomDocument`: switching never changes the room, ids, transforms, selection or undo
history, and export/import is identical in both. The diagnostics panel (**I**) has **Compare Showcase ↔
Planner**: it renders the current camera with both renderers and shows the frames side by side with
GPU-synchronised timings, draw calls, triangles, materials and textures. Details: **STYLIZED_RENDERER.md**.

## Using the editor

| Action | How |
|---|---|
| Orbit / pan / zoom | left-drag empty space · right-drag · mouse wheel (zooms towards the cursor) |
| Select | click an object (amber outline, footprint, dimensions and wall clearances appear) |
| Move | drag the object — snaps to the grid, walls (auto-orientation for wall furniture), neighbours; terrariums stack onto stand cabinets. Hold **Alt** to move freely. Arrow keys nudge (Shift = 10 cm) |
| Rotate | drag the ring handle (15° steps, Shift = free) · **R** / **Shift+R** = ±90° · Inspector |
| Duplicate / delete | **Ctrl+D** / **Del** (animal IDs are auto-incremented on duplicates) |
| Focus selection | **F** or double-click |
| Views | toolbar at the top-right of the viewport, or keys **1** top · **2** front · **3** left · **4** right · **5** isometric · **6** eye-level interior · **7 / 8** left / right corner · **9** fit room · **0** reset; **F** fit selection; assembly button = frontal view of the selection |
| Free camera | orbit / pan / zoom with the mouse, **W A S D** pan, **Q / E** orbit, double-click focuses |
| Walls | camera-aware by default (**AUTO**: far walls full, the wall in front of the camera drops to an 18 cm footprint); HUD wall button or **V** cycles ALL WALLS · CUTAWAY · WALL FOOTPRINT · HIDE WALLS |
| Room surfaces | deselect (Esc) → Properties: per-wall surface (paint colour, smooth / fine plaster, claddings incl. wood slats and black technical panel, wainscot height), wall profile (full / low / sloped attic wall), floor, skirting, corner trims |
| Add objects | click a library item then click in the room (**R** rotates the preview, **Esc** cancels) — or drag it from the library into the viewport |
| Doors & windows | drag along walls; they cut real openings; wall, offset and sill height in the Inspector; doors: type, hinge side, open, decor, frame; windows: glass, frame, blinds (none / venetian / roller, open amount, slat angle, inside / outside) |
| Library | search by name, tag or colour (“pump”, “black”, “zimoviště”), category filter, **Ports / Wall / Floor** filters |
| Technical network | **TECH PLAN**: **+ Route** (type, mode) → click the source port → the destination port (or choose them in the panel) → automatic path along the walls; drag the white waypoints (Shift = vertical, Alt = no snap), double-click the route to add one, **Del** removes it; circuits generate routes to their enclosures; **Load example network** builds RO tank → pump → filter → manifold → solenoid → misting circuit + drainage |
| Room size | deselect (Esc) and edit width / depth / height / wall thickness in the Inspector |
| Undo / redo | **Ctrl+Z** / **Ctrl+Y** |
| Export / import | toolbar: **Export JSON** (Ctrl+S) · **Import JSON** (Ctrl+O) |
| Lighting | Day / Evening / Night (night = enclosure lighting only) |
| Quality | **Auto** (default, adapts to the measured frame time) · Ultra / High / Balanced / Fast manual overrides. While you orbit / pan / zoom / drag, a lighter *interactive* profile is drawn; the full-quality frame returns ≈ 0.2 s after you stop |
| Diagnostics | click the stats line (bottom-right) or press **I**: renderer, FPS, frame time, draw calls, triangles, render scale, interactive/final mode, batches, materials/textures, light pool (Showcase), GPU · **Compare Showcase ↔ Planner** for the current camera |
| Render mode | **PLANNER** / **SHOWCASE** / **TECH PLAN** selector at the left of the toolbar |
| Panels / fullscreen | **[** library · **]** inspector · **F11** fullscreen (viewport becomes the whole screen) |

### Custom enclosures & assemblies

| Action | How |
|---|---|
| Design an enclosure | library **MY ENCLOSURES → + Create** (or **Customize…** on a starting template): construction, front, ventilation, interior, technology, exact size in cm, live 3D preview; **Save to My Enclosures** |
| Place one enclosure | click or drag a MY ENCLOSURES card into the room — each placement is a new physical enclosure (own id / code / device ids) |
| Build an assembly | **MY ASSEMBLIES → + Create**: drag enclosures, cabinets, shelves, technical compartments and reserved spaces into the front elevation; they snap magnetically (green = fits, red = collision); Delete · Ctrl+D · arrows (Shift ×10) · Ctrl+Z/Y; **Save to My Assemblies** |
| Place an assembly | click or drag a MY ASSEMBLIES card into the room; it moves / rotates / collides as one structure |
| Enter an assembly | double-click it (or **Enter** / Inspector **Enter assembly**): now single enclosures can be selected, inspected, replaced, removed or opened in the designer; **Esc** goes back up |
| Animal reference | Enclosure Designer → **Animal reference**: snake, lizard, gecko, chameleon, turtle, frog, spider / tarantula, scorpion, insect with adjustable size — a scale check only (not saved, never collides) |

Enclosures have **Occupied** and **Lighting** switches: occupied enclosures are lit and show their animal,
empty ones go dark and quiet. Species and animal ID are printed on the enclosure's label.

## Project layout

```
index.html                 entry page (import map → local three.js)
src/
  App.js                   composition root (logical state ↔ active render mode ↔ UI, shared canvas)
  modes/                   PlannerMode (default) · ShowcaseMode (lazy) — one view set per renderer
  planner/                 PLANNER renderer: PaintedMaterials, PlannerEngine, PaintBuilder, parametric
                           component kit (components.js), stylised models, PlannerView, PlannerShell
  diagnostics/             Showcase vs Planner comparison (same camera)
  model/RoomDocument.js    logical data model, validation, migration, wall frames
  objects/catalog.js       object types: logical defaults, placement rules, model reference
  objects/ObjectView.js    visual binding of one logical object (GLB fitted into its logical box)
  objects/ObjectLayer.js   keeps views in sync with the document
  editor/                  Editor (commands), History (undo/redo), Snapping
  interaction/             pointer (select/drag/rotate/place), keyboard, selection overlay
  camera/CameraRig.js      orbit/pan/zoom, presets, smooth focus
  scene/                   RoomShell (walls with openings, floor, ceiling), Lighting presets
  renderer/                RenderEngine (post-processing), Environment (IBL + HDRI), FinishPass
  assets/                  MaterialLibrary (shared PBR materials), AssetManager (GLB loading)
  serialization/           JSON export/import, autosave
  ui/                      toolbar, library, inspector, HUD, thumbnails, toasts, icons
  styles/app.css
assets/models/             GLB models (+ manifest.json)
assets/textures/           PBR texture sets (albedo / normal / ORM)
assets/environment/        HDRI
assets/planner/            hand-painted atlas for the Planner (atlas.webp + atlas.json)
docs/comparison/           Showcase vs Planner screenshots from identical cameras + report.json
data/demo-room.json        prebuilt demonstration room
schema/                    JSON Schema of the room document
tools/asset-pipeline/      reproducible model & texture authoring (Node)
tools/serve.mjs            static server · tools/vendor-three.mjs copies three.js into vendor/
tools/build-thumbnails.mjs pre-renders library thumbnails into assets/thumbnails/
tools/compare-renderers.mjs Showcase vs Planner from identical cameras → docs/comparison/
tools/asset-pipeline/build-planner-atlas.mjs  paints the Planner atlas
tests/benchmark.mjs        performance benchmark (static frame + mouse orbit/zoom/pan)
tests/run-e2e.mjs          end-to-end browser tests
tests/stress.mjs           scalability: generated facility with hundreds of enclosures
vendor/three/              three.js r186 (MIT), only the files the app imports
```

## Rebuilding assets (optional)

Models and textures are committed, so this is only needed when changing them:

```bash
npm install                 # three (geometry/exporter) + @napi-rs/canvas (texture writer)
npm run build:assets        # textures + GLB models (≈ 30 s)
node tools/asset-pipeline/build-planner-atlas.mjs   # Planner atlas (≈ 2 min)
node tools/build-thumbnails.mjs   # library thumbnails (needs Playwright)
npm run vendor              # refresh vendor/three from node_modules
```

## Tests

```bash
npm install && npm i -D playwright && npx playwright install chromium
npm test
```

The suite starts its own server and covers: initial load, GLB loading, missing-asset fallback, orbit /
pan / zoom, view presets, fullscreen, selection, move + undo, rotation, duplicate, delete, snapping
(wall, grid, stacking, collisions), room resizing, adding an enclosure (click-to-place), adding furniture
(drag & drop), wall placement of doors/windows, JSON export, JSON re-import (+ invalid file rejection),
browser refresh (autosave), responsive resizing, lighting/quality switching, the progressive renderer
(interactive while orbiting, final after settling), shadow invalidation, no shader recompilation on
preset/occupancy changes, static batching, Auto quality + diagnostics, and console errors (26 tests,
run against the Showcase with `?mode=showcase`). Planner tests: Planner ↔ Showcase switching leaves the
RoomDocument, object ids, transforms, selection and undo history untouched; the Planner renders batched
without lights/shadow maps and shows its diagnostics; click selection in the Planner; Planner edits appear
in the Showcase; export/import in Planner mode; presets and the mode selector; a Planner session loads no
GLB/HDR/post-processing (7 tests). Phase-4 tests (real pointer drags in the UI): create TERRA 60 and
RACK 30 in the designer, parametric resize (rebuilt, never scaled), 3×3 terrariums + 6 rack boxes + cabinet
by drag & drop with collision rejection and undo/redo, save *TEST BREEDING WALL*, drag it into the room,
move + rotate, enter / select member / exit, save → reload → export/import → mode switch round-trip, a mixed
Tetris layout, and a 5-assembly performance check. `node tests/assembly-perf.mjs` measures 5 assemblies /
75 enclosures in detail. Results are written to `tests/last-run.json`.

```bash
node tools/compare-renderers.mjs      # identical-camera screenshots + metrics → docs/comparison/
node tests/stress.mjs 300             # 300 enclosures (MODES=planner,showcase)
MODE=planner node tests/benchmark.mjs # orbit / zoom / pan benchmark for one renderer
```

## Performance

See **STYLIZED_RENDERER.md** for the Planner (architecture, art pipeline, materials, lighting, draw-call
strategy, measurements, builder asset kit) and **PERFORMANCE.md** for the Showcase — progressive (interactive / final) rendering, Auto quality, static batching,
shadow invalidation, fixed light pool, measurements and the benchmark script (`tests/benchmark.mjs`).

See **ARCHITECTURE.md** for the data model and the integration plan, **ASSET_LICENSES.md** for licences.

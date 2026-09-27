# IR Manager — Habitat Studio Next

A standalone, browser-based **3D planner for reptile breeding facilities**. Real-time physically based
rendering (three.js r186, WebGL 2), a detailed reference breeding room, and a real editor: select, move,
rotate, duplicate, delete, snap, resize, place from a library, export/import JSON.

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

## Using the editor

| Action | How |
|---|---|
| Orbit / pan / zoom | left-drag empty space · right-drag · mouse wheel (zooms towards the cursor) |
| Select | click an object (amber outline, footprint, dimensions and wall clearances appear) |
| Move | drag the object — snaps to the grid, walls (auto-orientation for wall furniture), neighbours; terrariums stack onto stand cabinets. Hold **Alt** to move freely. Arrow keys nudge (Shift = 10 cm) |
| Rotate | drag the ring handle (15° steps, Shift = free) · **R** / **Shift+R** = ±90° · Inspector |
| Duplicate / delete | **Ctrl+D** / **Del** (animal IDs are auto-incremented on duplicates) |
| Focus selection | **F** or double-click |
| Views | toolbar at the top-right of the viewport, or keys **1** top · **2** front · **3** left · **4** right · **5** isometric · **6** eye-level interior · **0** reset |
| Add objects | click a library item then click in the room (**R** rotates the preview, **Esc** cancels) — or drag it from the library into the viewport |
| Doors & windows | drag along walls; they cut real openings; wall, offset and sill height in the Inspector |
| Room size | deselect (Esc) and edit width / depth / height / wall thickness in the Inspector |
| Undo / redo | **Ctrl+Z** / **Ctrl+Y** |
| Export / import | toolbar: **Export JSON** (Ctrl+S) · **Import JSON** (Ctrl+O) |
| Lighting | Day / Evening / Night (night = enclosure lighting only) |
| Quality | Ultra / High / Balanced / Fast (pixel ratio, MSAA, ambient occlusion, bloom, shadow resolution) |
| Panels / fullscreen | **[** library · **]** inspector · **F11** fullscreen (viewport becomes the whole screen) |

Enclosures have **Occupied** and **Lighting** switches: occupied enclosures are lit and show their animal,
empty ones go dark and quiet. Species and animal ID are printed on the enclosure's label.

## Project layout

```
index.html                 entry page (import map → local three.js)
src/
  App.js                   composition root (wires logical state ↔ 3D ↔ UI)
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
data/demo-room.json        prebuilt demonstration room
schema/                    JSON Schema of the room document
tools/asset-pipeline/      reproducible model & texture authoring (Node)
tools/serve.mjs            static server · tools/vendor-three.mjs copies three.js into vendor/
tests/run-e2e.mjs          end-to-end browser tests
vendor/three/              three.js r186 (MIT), only the files the app imports
```

## Rebuilding assets (optional)

Models and textures are committed, so this is only needed when changing them:

```bash
npm install                 # three (geometry/exporter) + @napi-rs/canvas (texture writer)
npm run build:assets        # textures + GLB models (≈ 30 s)
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
browser refresh (autosave), responsive resizing, lighting/quality switching and console errors.
Results are written to `tests/last-run.json`.

## Performance notes

* Render-on-demand: frames are only rendered while something changes (camera, edits, transitions).
* Every GLB is merged per material slot; all objects share one material/texture set (≈ 70 materials total).
* Enclosure interiors do not cast shadows; one soft directional shadow map covers the room.
* Pixel ratio is capped per quality level; *Balanced* / *Fast* are intended for integrated GPUs.
* Ceiling panels and repeated drain slots use `InstancedMesh`.

See **ARCHITECTURE.md** for the data model and the integration plan, **ASSET_LICENSES.md** for licences.

# Architecture

Habitat Studio is split into a **logical layer** (plain JSON data + editor commands) and a **visual
layer** (three.js scene). Data only flows one way: logical → visual. Nothing in the 3D scene is ever
serialised or read back into the document. This is what makes the planner integrable into IR Manager:
the PHP/MySQL side only ever stores and validates the small logical document.

```
          ┌──────────────── logical layer (no three.js) ───────────────┐
 UI ─────▶│ Editor (commands, selection) ─▶ RoomDocument (JSON)         │──▶ Persistence (JSON file / autosave / future API)
          │   History (undo/redo)   Snapper (grid, walls, stacking)     │
          └───────────────┬────────────────────────────────────────────┘
                          │ 'change' events (ids)
          ┌───────────────▼──────────── visual layer ──────────────────┐
          │ ObjectLayer ─▶ ObjectView (per object) ─▶ GLB clone fitted  │
          │ RoomShell (walls with openings, floor, ceiling, panels)     │
          │ Lighting presets · Environment (IBL/HDRI) · RenderEngine    │
          │ Pointer / SelectionOverlay (reads & writes via Editor only) │
          └────────────────────────────────────────────────────────────┘
```

## 1. The logical document

Defined in `src/model/RoomDocument.js`, formally described by `schema/habitat-room.schema.json`.

```json
{
  "schema": "ir-manager/habitat-room",
  "version": 1,
  "room": { "id": "room_demo_a", "name": "Reptile room A", "width": 5, "depth": 4, "height": 2.7,
            "wallThickness": 0.14, "finishes": { "floor": "concrete_polished", "walls": "warm_grey", "accentWall": "north" } },
  "objects": [
    { "id": "terr_a1", "type": "terrarium_arid", "name": "Python enclosure A1",
      "position": { "x": 0.62, "z": 0.25 }, "elevation": 0.8, "rotation": 0,
      "size": { "w": 1.0, "d": 0.5, "h": 0.5 }, "mount": null,
      "props": { "occupied": true, "lighting": true, "animal": { "species": "Python regius", "code": "PR-01" }, "notes": "…" } },
    { "id": "door_1", "type": "door", "position": { "x": 5.07, "z": 2.7 }, "elevation": 0, "rotation": 270,
      "size": { "w": 1.0, "d": 0.14, "h": 2.1 }, "mount": { "wall": "east", "offset": 2.7 }, "props": {} }
  ],
  "meta": { "created": "…", "modified": "…", "generator": "Habitat Studio Next" }
}
```

Conventions

* Units are metres and degrees. **Plan coordinates** start at the interior north-west corner:
  `x` west→east (0…width), `z` north→south (0…depth). `y` is up.
* `position` is the footprint centre; `elevation` the underside height (terrarium on a stand: 0.8).
* `rotation` 0 = front faces south (+z); 90 = faces east, 180 = north, 270 = west.
* `size` is the **logical box** — footprint, collision and clearance volume. It never depends on mesh
  complexity; a 30 000-triangle terrarium and a placeholder box have the same logical size.
* Wall-bound objects (doors, windows, sockets, panels, AC) store `mount = {wall, offset}`; their
  position/rotation are derived from the wall, so they stay on their wall when the room is resized.
  Wall starts: north = NW corner, east = NE, south = SE, west = SW; offset runs along the wall.
* `props` holds domain data. `props.animal.code` is the natural join point with IR Manager animals.

`normalizeDocument()` validates, clamps and migrates any input (import, autosave, API): unknown types are
skipped and reported in `meta.skippedTypes`, duplicate ids are re-issued, numbers are range-checked.

## 2. Object catalogue (behaviour, not geometry)

`src/objects/catalog.js` lists every type with: label, category, default logical `size`, `placement`
(`floor` · `wall` = floor-standing, auto-backed to walls · `mounted` · `opening`), `stackable` /
`supports` (terrariums can be placed on stands), `enclosure` kind, default `props`, and the `model` URL.
Adding a type = one catalogue entry + one GLB. The PHP side only needs the list of type ids (the schema
enum) to validate documents.

## 3. Visual binding

`ObjectView` builds, for each logical object:

| Node | Purpose |
|---|---|
| `root` | placed from position / elevation / rotation |
| `proxy` | invisible unit box scaled to `size` — used for picking; identical to the collision box |
| `visual` | a clone of the GLB scene (geometry & materials shared between instances) |
| `extras` | lights created from model anchors, animal models, per-instance label textures |

**Fitting.** Each GLB carries `extras.habitat.nativeSize` (the model's body box). The visual is scaled by
`size / nativeSize` (`fit: 'stretch'`) or uniformly by height (`fit: 'uniform'`, plants). Parts that sit
outside the body (lamps on a lid, conduits above a panel) simply overflow and scale along.

**Material slots.** GLBs contain named material slots (`glass`, `frame_black`, `sand`, `led_warm`, …)
with fallback PBR values. `MaterialLibrary` binds each slot to one shared physical material (textures in
metres, transmission glass, clearcoat, emissive LEDs). A model therefore never embeds textures, all
objects share GPU resources, and the look can be restyled centrally.

**Anchors.** Empty nodes in the GLB describe behaviour: `light_*` (enclosure LEDs → range-limited spot
lights, window → area light, task lights), `animal_spot*` (where the animal model sits when occupied).
State (`occupied`, `lighting`) switches lights, emissives and animals; empty enclosures go dark.

**Missing assets.** If a GLB fails to load, the view shows an amber placeholder box of the logical size, a
toast and an inspector warning; the logical object is unaffected and still exported.

## 4. Scene & rendering

* `RoomShell` generates architecture from the room + opening objects: walls are extruded shapes with real
  holes/notches for windows and doors, coved skirting, suspended ceiling, instanced LED panels, floor drain.
  Walls whose outside faces the camera are cut away (plus, in elevation views, furniture backed against
  them); the ceiling hides when looking from above.
* `Lighting`: area lights per ceiling panel, one soft PCF shadow map, window daylight, enclosure lights;
  presets Day / Evening / Night.
* `Environment`: PMREM-filtered procedural light probe matching the facility + CC0 HDRI seen through the
  window.
* `RenderEngine`: progressive renderer. Final (stationary) chain: HDR half-float MSAA target → GTAO →
  bloom (emitters only) → selection outline → ACES tone mapping → finishing grade → optional SMAA.
  Interactive chain (while manipulating): reduced resolution, no MSAA/AO/bloom. Render-on-demand,
  shadow maps only re-rendered when invalidated, Auto quality. Details in PERFORMANCE.md.
* `StaticBatcher`: folds all objects' GLB meshes into one `BatchedMesh` per shared material (multi-draw);
  purely a rendering concern — logical data and ObjectViews are unchanged.

## 5. Editor

All mutations go through `Editor` (`add`, `update`, `remove`, `duplicate`, `setRoom`, `load`), each
emitting `change` with affected ids and recording a JSON snapshot in `History`. Drags/rotations are
wrapped in `begin()`/`commit()` so a whole gesture is one undo step. `Snapper` implements grid, wall
(flush + auto-orientation), neighbour-edge and stacking snaps, wall projection for mounted items, and
2-D OBB collision reports (height-aware).

## 6. Integrating with IR Manager (PHP / MySQL) — proposed plan

Nothing below is implemented yet; the standalone app is designed so this is additive.

**Storage.** Store the document as JSON, with a relational index for querying:

```sql
CREATE TABLE habitat_rooms (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  facility_id   INT UNSIGNED NOT NULL,
  name          VARCHAR(120) NOT NULL,
  width_m DECIMAL(6,3) NOT NULL, depth_m DECIMAL(6,3) NOT NULL, height_m DECIMAL(5,3) NOT NULL,
  document      JSON NOT NULL,                 -- the full logical document (schema v1)
  schema_version SMALLINT NOT NULL DEFAULT 1,
  revision      INT UNSIGNED NOT NULL DEFAULT 1, -- optimistic locking
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE habitat_objects (                  -- denormalised index, rebuilt on every save
  room_id    INT UNSIGNED NOT NULL,
  object_uid VARCHAR(64) NOT NULL,              -- objects[].id
  type       VARCHAR(40) NOT NULL,
  name       VARCHAR(120),
  animal_id  INT UNSIGNED NULL,                 -- resolved from props.animal.code
  occupied   TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, object_uid), KEY (animal_id)
);
```

**API contract.** `GET /api/habitat/rooms/{id}` → document; `PUT /api/habitat/rooms/{id}` with
`{revision, document}` → validates against `schema/habitat-room.schema.json` (e.g. `opis/json-schema`),
rejects stale revisions (409), rewrites `habitat_objects`. `GET /api/habitat/catalog` can later expose
enabled types per tenant.

**Front-end adapter.** `Persistence` is the only class that touches storage. Add an `ApiPersistence`
with the same surface (`restore()` → fetch room, `scheduleAutosave()` → debounced PUT) and select it
when the page is served by IR Manager. Mount the app either inside an iframe (`/habitat/?room=12`) or as
a module: `new App(element).init()` needs only an element with the `#toolbar/#library/#viewport/
#inspector` structure from `index.html`.

**Animals.** Keep `props.animal.code` as the display value and add `props.animal.id` (IR Manager
primary key) when linked; the label texture, inspector and future hover cards read from `props` only.
Live data (temperatures, Home Assistant) should be attached later as a separate, non-persisted overlay
keyed by object id — never written into the room document.

**Versioning.** Bump `VERSION` when the document changes shape and add a migration branch in
`normalizeDocument()`; the server stores `schema_version` so old rooms can be migrated lazily.

## 7. Asset pipeline

`tools/asset-pipeline/` authors all models and textures deterministically in Node:
`lib/kit.mjs` (builder, slots, profiles, box-projected metre UVs, merge-by-slot, anchors),
`lib/enclosures.mjs` (frames, panes, sliding/hinged/rimless fronts, tracks, vents, lids, lights),
`lib/nature.mjs` (rocks, branches, cork, layered substrate, backgrounds, plants, animals),
`models/*.mjs` (one function per GLB), `build-textures.mjs` (tileable PBR maps). Replacing any procedural
GLB by an artist-made one only requires the same material slot names, origin (footprint centre at floor,
front = +Z, metres) and optionally `extras.habitat.nativeSize` / anchor nodes.

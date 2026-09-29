# Data model — room document v3 (enclosures, instances, assemblies, room surfaces, technical network)

Habitat Studio keeps ONE logical document (`schema: "ir-manager/habitat-room"`, `version: 2`). It is
autosaved in the browser, exported/imported as JSON, and is the only thing the renderers read.
JSON Schema: `schema/habitat-room.schema.json`. Code: `src/model/RoomDocument.js`, `src/model/Library.js`.

Units: **metres** internally (the UI shows cm). Plan coordinates: x west→east, z north→south, y up.

## Dimension convention (locked)

Every user-facing size is written **WIDTH × DEPTH × HEIGHT** (W × D × H · cs: Š × H × V):
`60 × 45 × 90 cm` = 60 wide, 45 deep, 90 high. All UI text is produced by `src/model/Dimensions.js`
(`formatDims`, `parseDims`, `dimLabel`, `dimsOrderLabel`) — no hand-built "a × b × c" strings.

Stored data keeps its **semantic property names**, never positional arrays: templates
`dimensions: { width, height, depth }`, room objects / modules / reserved spaces `size: { w, h, d }`.
The JSON key order is irrelevant; the display order is decided only by `Dimensions.js`. Older files are
therefore never reinterpreted — a Phase 4 template saved as `{ width: 0.3, height: 0.45, depth: 0.18 }` loads
as exactly that (30 wide, 18 deep, 45 high; shown as `30 × 18 × 45 cm`).

```
document (v3)
├── room                 dimensions, walls{north,east,south,west}, floor, details  (4.1 finishes kept for migration)
├── objects[]            ROOM PLACEMENTS: catalogue objects + { type:'custom_enclosure', ref:{instanceId} }
│                                                         + { type:'assembly', ref:{assemblyId} }
├── enclosures[]         EnclosureTemplate — construction definitions ("MY ENCLOSURES")
├── instances[]          EnclosureInstance — physical enclosures (one per real enclosure)
├── assemblies[]         Assembly — physical structures ("MY ASSEMBLIES")
└── network              4.2 technical layer: routes[] + circuits[] (linked by id, never embedded)
```

Version 1 files load unchanged (empty library). Export always writes v2. Unknown fields are dropped,
invalid values clamped, dangling references removed (reported in `meta.droppedReferences`) — ids are
never rewritten.

## EnclosureTemplate (construction)

A reusable, purely logical definition. It is **not** a model: the visual is generated from it by the
parametric Planner kit (`src/enclosures/EnclosureGeometry.js`), in both renderers.

```jsonc
{
  "id": "enc_…", "name": "TERRA 60", "type": "glass",          // glass | pvc | wood | rack | mesh | custom
  "dimensions": { "width": 0.6, "height": 0.6, "depth": 0.6 },  // outer, metres
  "construction": {
    "type": "glass",
    "frame":  { "style": "profile", "color": "black", "profile": 0.018 },   // profile | box
    "panels": { "left": "glass", "right": "glass", "rear": "glass" }        // glass | pvc | wood | mesh | open
  },
  "front": { "type": "sliding", "lock": true },   // sliding | fixed | hinged-single | hinged-double | mesh | tub | open
  "ventilation": [ { "id": "v1", "side": "front-top", "coverage": 0.9 } ],  // top | front-top | front-bottom | left | right | rear
  "top":    { "type": "mesh" },                    // mesh | glass | solid | open
  "bottom": { "type": "solid", "base": 0 },        // base = integrated cabinet height (0 = none)
  "background": { "type": "cork" },               // none | sandstone | cork | basalt | foam
  "interior": {
    "preset": "tropical",                          // none | arid | tropical | paludarium | custom
    "substrate": { "type": "soil", "depth": 0.05 },
    "water": { "enabled": false, "fraction": 0.45, "level": 0.3 },
    "items": [ { "id": "i…", "kind": "cork", "x": 0.4, "z": 0.6, "s": 1, "r": 0 } ]   // x,z = fractions of the interior
  },
  "technology": [ { "id": "light", "kind": "led", "label": "", "x": 0.5, "y": 1, "z": 0.35 } ],
  "visualStyle": { "accent": "amber" },
  "metadata": { "code": "T60", "source": "custom | catalogue:<type>", "created": "…", "modified": "…", "notes": "" }
}
```

* `technology[].id` is a **stable slot id** inside the template (`light`, `bask`, `mist`, …).
* Interior items and devices are positioned as fractions of the interior, so they stay in place when the
  enclosure is resized.

## EnclosureInstance (physical enclosure)

One real enclosure built from a template. Six "Dendrobates 50 × 50 × 70" (W × D × H) enclosures are six instances with
six ids — never one object.

```jsonc
{
  "id": "inst_…", "templateId": "enc_…", "code": "D50-03",
  "props": { "occupied": true, "lighting": true, "animal": { "species": "", "code": "" }, "notes": "" },
  "devices": { "light": { "deviceId": "inst_…:light", "entity": null } },   // template slot → stable device id
  "metadata": { "created": "…", "externalId": null }                          // externalId: future IR Manager DB id
}
```

`devices` is the integration seam for IR Manager / Home Assistant: every technology slot of every physical
enclosure has a stable `deviceId`; `entity` will hold the bound entity later (not implemented in this phase).
Adding a device to a template adds the slot to all its instances (with new stable ids); existing ids never change.

## Assembly (physical structure)

```jsonc
{
  "id": "asm_…", "name": "TEST BREEDING WALL",
  "members": [
    { "id": "m…", "kind": "enclosure", "instanceId": "inst_…", "enclosureId": "enc_…", "position": { "x": 0, "y": 0.4, "z": 0 }, "rotation": 0 },
    { "id": "m…", "kind": "module", "module": { "type": "technical", "w": 1.8, "h": 0.4, "d": 0.6, "doors": 0 }, "position": { "x": 0, "y": 0, "z": 0 } }
  ],
  "reserved": [ { "id": "r…", "label": "Reserved", "size": { "w": 0.6, "h": 0.5, "d": 0.5 }, "position": { "x": 1.2, "y": 1.4, "z": 0 } } ],
  "frame": { "mode": "auto", "profile": 0.03, "color": "graphite", "shelves": true, "topRail": true, "feet": true },   // none | auto | custom
  "alignment": "front",          // front | back  (depth alignment of mixed-depth members)
  "limit": null,                 // optional maximum { w, h }
  "metadata": { "created": "…", "modified": "…", "notes": "" }
}
```

* `position` = lower-left-front corner of the piece in the assembly's **front elevation** (x right, y up,
  z = extra depth offset from the aligned face). The structure is stored re-based: min x = 0, min y = 0.
* Members are never merged: every enclosure keeps `instanceId` and its own transform. Modules (cabinet,
  shelf, technical compartment) and reserved spaces have their own ids too.
* Overall size (derived, not stored): `assemblyStats()` returns the OUTER dimensions — width = extent +
  2 × frame profile, depth = max member depth, height = top + top rail — and `content` (the pieces only,
  without the frame). The room object's `size` = outer dimensions, kept in sync.

## Room placements

```jsonc
{ "id": "obj_…", "type": "assembly", "name": "TEST BREEDING WALL", "ref": { "assemblyId": "asm_…" },
  "position": { "x": 0.36, "z": 1.95 }, "rotation": 90, "elevation": 0, "size": { "w": 1.86, "d": 0.6, "h": 2.41 } }
{ "id": "obj_…", "type": "custom_enclosure", "ref": { "instanceId": "inst_…" }, … }
```

* In the room the assembly is ONE movable, rotatable, collidable object (footprint = size).
* An assembly is a physical structure, so it is placed once. Placing it again (or duplicating the room
  object) creates a physical **copy**: new assembly id, new instance ids, same layout.
* Removing the room object leaves the assembly in MY ASSEMBLIES (unplaced). Deleting the assembly from the
  library removes its placement and its instances.

## Persistence & undo

* Everything lives in the document → autosave (localStorage), export and import carry templates,
  instances, assemblies and placements together.
* Library commands (`Editor.saveTemplate`, `saveAssembly`, `placeAssembly`, `placeTemplate`,
  `updateInstance`, `removeMember`, `replaceMember`, `deleteAssembly`, …) are document transactions and
  participate in the room's snapshot undo/redo.
* The Enclosure Designer and the Assembly Builder work on drafts with their **own** undo histories (every
  add / remove / move / duplicate / resize / property / reserved space / frame change); SAVE commits the
  draft as one undoable document change.

## Mapping to IR Manager (later)

| Habitat | IR Manager table (proposal) |
|---|---|
| `enclosures[]` | `enclosure_designs` (JSON columns for construction / interior / technology) |
| `instances[]` | `enclosures` (one row per physical enclosure; `metadata.externalId` ↔ PK) |
| `instances[].devices` | `enclosure_devices` (deviceId, slot, entity binding) |
| `assemblies[]` + members | `enclosure_structures` + `structure_members` (instance FK, position) |
| `objects[]` with `ref` | `room_placements` |


## Version 3 (Habitat Studio 4.2) — room surfaces and the technical network

Architecture: **ROOM → ASSEMBLY → ENCLOSURE → ANIMAL**, with the technical network as a separate layer that
only *references* devices and enclosures by id:

```
room ─┬─ objects[] ── devices (tech.deviceId, ports)      ◄──┐
      ├─ assemblies → instances (enclosures, ports by id) ◄──┤  network.routes[].from / .to = { owner, port }
      └─ network ── routes[] ── circuits[] ───────────────────┘  network.circuits[].destinations = [owner ids]
```

### Room surfaces (`room.walls`, `room.floor`, `room.details`)

```jsonc
"walls": {
  "north": { "surface": "paint_anthracite", "color": null, "finish": "smooth", "coverHeight": 0,
             "profile": { "mode": "full", "hStart": 2.7, "hEnd": 2.7 } },
  "east":  { "surface": "wood_slats", "color": "#e9e6df", "finish": "smooth", "coverHeight": 1.2, "profile": { "mode": "sloped", "hStart": 1.5, "hEnd": 2.5 } }
},
"floor":   { "surface": "tile_dark", "color": null },
"details": { "skirting": "black", "corners": true }
```

* `surface` — paints (`paint_white`, `paint_light_grey`, `paint_warm_grey`, `paint_dark_grey`, `paint_anthracite`,
  `paint_beige`, `paint_custom` + `color`) or claddings (`laminate_black`, `oak`, `light_oak`, `dark_wood`, `walnut`,
  `wood_slats`, `deco_panel`, `tech_panel`). Catalogue: `src/model/Surfaces.js`.
* `coverHeight` — cladding height (0 = full wall; e.g. 1.2 = wainscot, `color` paints the wall above).
* `profile` — attic walls: `full`, `low` (knee wall at `hStart`) or `sloped` (`hStart` → `hEnd` along the wall).
  Only the wall outline changes; **there is no ceiling** in 4.2 (the room height is the full-wall height).
* Migration from v2: `finishes.accentWall = X` → wall X `paint_anthracite`, other walls `paint_warm_grey` (the 4.1 look);
  `finishes.floor = concrete_polished` → `concrete`.

### Object props of procedural types

Procedural (parametric) catalogue types keep their options in `props` (defaults come from the type, so a v2
object without props keeps its 4.1 look). Examples:

```jsonc
{ "type": "window_clear", "props": { "glass": "clear", "frame": "black", "blinds": "venetian", "blindsEnabled": true,
  "blindsPos": "top", "blindsOpen": 40, "blindsAngle": 30, "blindsMount": "inside" } }
{ "type": "door_interior", "props": { "style": "interior", "decor": "white", "frame": "white", "hinge": "left", "open": true } }
{ "type": "table_corner", "props": { "decor": "oak", "frame": "black", "armA": 0.7, "armB": 0.6 } }
{ "type": "plant_monstera", "props": { "pot": "anthracite", "plantSize": "large" } }
```

### Devices (`object.tech`)

Every type with `ports` / `device: true` gets `tech: { deviceId, ports[] }`:

* `deviceId` — `dev_<objectId>`, **never changes** (a duplicate is a new device with a new id).
* catalogue ports come from the type (`src/objects/catalog.js`, e.g. misting pump `WATER_IN`, `MIST_OUT`, `POWER`);
  `tech.ports[]` holds user-created ports `{ id: "AUX_FEED", kind, dir: in|out|both, label, at:[x,y,z] }`.
* enclosures expose `MIST_IN, WATER_IN, DRAIN_OUT, OVERFLOW_OUT, POWER, TEMP_SENSOR, HUM_SENSOR`; catalogue enclosures
  use the object id as owner, custom enclosures and assembly members use their **instance id** (the physical
  enclosure, independent of where the assembly stands).
* global **portId = `deviceId:PORT`** (instance id for enclosures) — the binding key for IR Manager / Home Assistant
  (Home Assistant itself is not implemented).

### Network (`network.routes`, `network.circuits`)

```jsonc
"network": {
  "routes": [ { "id": "rt_…", "kind": "mist", "name": "Solenoid 1 → TERRA 01",
                "from": { "owner": "obj_sol1", "port": "OUT" }, "to": { "owner": "inst_ab12", "port": "MIST_IN" },
                "points": [ { "x": 4.9, "y": 2.25, "z": 3.0 }, { "x": 4.9, "y": 2.25, "z": 0.04 } ],
                "mode": "in_wall", "circuitId": "cir_…", "note": "", "enabled": true } ],
  "circuits": [ { "id": "cir_…", "code": "C1", "name": "Misting circuit 1", "kind": "mist",
                  "source": { "owner": "obj_sol1", "port": "OUT" }, "destinations": ["inst_ab12", "inst_cd34"],
                  "note": "RO → pump → filter → manifold → solenoid", "enabled": true } ]
}
```

* `kind`: `water | mist | drain | power | signal` (layers WATER, MISTING, DRAINAGE, ELECTRICAL, SENSORS).
* `points` are the waypoints between the two ports (plan metres, y up); the ends always follow the ports, so moving
  a device keeps its routes attached. Flow direction = `from` → `to` (drainage runs enclosure → drain point).
* `mode`: `visible` (drawn as a pipe in every view), `in_wall` (runs inside the wall, shown and highlighted only in
  TECH PLAN), `hidden`.
* Normalisation drops unknown fields, clamps coordinates and clears `circuitId` references to deleted circuits;
  ids are never rewritten.

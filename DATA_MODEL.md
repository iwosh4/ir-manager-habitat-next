# Data model — room document v2 (enclosures, instances, assemblies)

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
document (v2)
├── room                 dimensions, finishes
├── objects[]            ROOM PLACEMENTS: catalogue objects + { type:'custom_enclosure', ref:{instanceId} }
│                                                         + { type:'assembly', ref:{assemblyId} }
├── enclosures[]         EnclosureTemplate — construction definitions ("MY ENCLOSURES")
├── instances[]          EnclosureInstance — physical enclosures (one per real enclosure)
└── assemblies[]         Assembly — physical structures ("MY ASSEMBLIES")
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

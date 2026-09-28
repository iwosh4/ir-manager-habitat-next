# Assembly Builder — MY ASSEMBLIES → room

The core workflow of this phase:

```
CREATE ENCLOSURE → MY ENCLOSURES → BUILD ASSEMBLY BY DRAG & DROP → MY ASSEMBLIES → DRAG INTO THE ROOM
```

## Workspace

```
┌ ASSEMBLY BUILDER · name ─────── undo redo · snap step (1/2/5/10 cm) · Snap · Fit · Cancel · Save ┐
│ LEFT               │ CENTER: FRONT ELEVATION ("Tetris")                │ RIGHT                     │
│ MY ENCLOSURES      │  real painted front images of every piece         │ live 3D preview (Planner) │
│  (drag cards)      │  magnetic snapping + amber guides                 │ W · H · max D, counts     │
│ MODULES            │  green = valid · red = collision / outside limit  │ alignment · structure     │
│  cabinet · shelf   │  overall dimension lines                          │ max size (optional)       │
│  technical · resv. │  floor line — drop below it to insert underneath  │ selected piece            │
└────────────────────┴───────────────────────────────────────────────────┴───────────────────────────┘
```

* **Direct manipulation first.** Grab a card, drag it into the workspace, drop it next to / above / below
  another piece. Numbers (X / Y / depth offset, module sizes) are available but secondary.
* Every piece is drawn with an exact **orthographic front image** rendered by the Planner pipeline
  (`PreviewStage.frontImage`), so the elevation looks like the real structure; the live 3D preview shows
  the result in the approved Planner look.
* The structure grows naturally: no predefined size or grid. Pieces dropped below the floor line or left of
  the structure re-base it (the view compensates, nothing jumps). The workspace re-frames itself to keep
  free space around the structure. Right-drag pans, wheel zooms.

## Snapping (`src/assembly/Tetris.js`, pure & testable)

For a dragged piece of size w × h, candidates within 14 screen-px:

* x: my left edge → other right edge; my right edge → other left edge; left/left; right/right; centres;
* y: on top of another piece; below it; bottoms / tops aligned; centres; the floor line.

The best (closest) combination that does **not collide** wins, so a rough drop slides into the free slot
beside / above the target — the "pieces magnetically connect" feel. Without a magnetic candidate the piece
follows the snapping increment (1 / 2 / 5 / 10 cm). **Alt** or the Snap toggle places freely.

## Collision

Physical 3D boxes (`assemblyBoxes`): x/y from the elevation, z from the depth alignment (front- or
back-aligned + per-piece depth offset). Touching faces are allowed; any overlap is refused:

* during a drag the candidate is green (valid) or red (overlap / outside the optional maximum size) and the
  colliding pieces are outlined;
* a red drop is not placed (palette) or snaps back (move); keyboard nudges, resizes and replacements are
  checked the same way. Resizing a supporting piece carries the stack resting on it (no floating gaps).

## Editing

Click selects. **Delete** removes, **Ctrl+D** duplicates into the first free slot (right, above, left,
below), arrows move by the increment (**Shift** ×10), **Ctrl+Z / Ctrl+Y** undo/redo, double-click (or
*Open enclosure*) opens the enclosure design, *Replace with* swaps the enclosure design (new physical id)
if it fits. Every add / remove / move / duplicate / resize / property / reserved space / frame change is an
undo step of the builder; **Save** commits the assembly + the physical enclosures created while building
as one undoable document change.

## Structure

`none` · `auto` (graphite 30 mm: 4 uprights, continuous shelf rails under each level — contiguous spans are
merged, top rail, feet, amber identification stripe) · `custom` (profile, colour, shelves, top rail, feet).
The frame is ONE cached geometry per assembly (`buildFrameInto`), not hundreds of pieces.

## Room integration & hierarchy

* **MY ASSEMBLIES** cards (thumbnail, W×H×D, counts, "in room" badge) can be clicked or dragged into the
  viewport. The assembly becomes ONE room object: moved, rotated, snapped and collision-checked as a whole
  (footprint = assembly size).
* **Enter assembly**: double-click, *Enter assembly* in the Inspector, or Enter. Only members are selectable
  now; the banner shows `ROOM › ASSEMBLY › ENCLOSURE`; the selected member gets amber brackets + rim. The
  Inspector shows the physical enclosure (code, occupancy, lighting, animal, notes, device ids) with *Open
  enclosure*, *Replace with*, *Remove from assembly*. Esc goes up one level; Esc again exits.
* Interior / technology (the 4th level) are edited in the enclosure design (*Open enclosure*).

## Rendering

`PlannerView` builds an assembly as a group of member nodes, each instancing the **cached template
geometry** (the same key as the preview and standalone enclosures) at its transform, plus one frame
geometry. The StaticBatcher folds everything into ~5 BatchedMeshes: 75 enclosures in 5 assemblies render in
25 draw calls. Logical ids stay per member (each member node has its own pick proxy). In the Showcase,
parametric members are drawn with the same painted geometry (no GLB exists for user designs).

## Files

| File | Role |
|---|---|
| `src/assembly/AssemblyBuilder.js` | builder UI: palette drag, elevation canvas, properties, local history |
| `src/assembly/Tetris.js` | snapping, collision, free-slot search (no DOM) |
| `src/assembly/AssemblyLayout.js` | assembly → local 3D layout, frame, reserved placeholders |
| `src/model/Library.js` | `Assembly` schema, stats, boxes, normalisation |
| `src/editor/Editor.js` | `saveAssembly`, `placeAssembly`, `removeMember`, `replaceMember`, … |
| `src/interaction/PointerController.js`, `src/App.js` | library placement, enter/exit assembly, member picking |

## Known limitations

* The elevation is front-facing; stepped depth structures are limited to front/back alignment + per-piece
  depth offset.
* Pieces may float if the user places them in mid-air (allowed; the auto frame then carries them).
* While an assembly is *entered*, it is drawn detached from the batches (≈16 × 5 draws for a 16-piece wall)
  so a single member can be highlighted; normal room editing is fully batched.
* Replacing a member keeps its position; if the new design does not fit there, the replacement is refused.

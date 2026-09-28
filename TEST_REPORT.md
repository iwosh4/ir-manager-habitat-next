# Test report — custom enclosures, Tetris assembly builder, room integration

> Updated for **Phase 4.1** (dimension standardisation): all sizes are **W × D × H** (width × depth × height).
> RACK 30 is now 30 wide × 45 deep × 18 high. Final results: **PHASE_4_1_FINAL_REPORT.md**.

Environment: this cloud container, Chromium (Playwright) with **SwiftShader** (CPU software rasteriser —
no GPU), 1280×720 (e2e) / 1600×900 (screenshots). All workflows were executed in the running application
through its UI with **real pointer drags** (Playwright mouse down / move / up), not by writing JSON.

Commands: `npm test` (full e2e suite, `tests/run-e2e.mjs`), `node tests/assembly-perf.mjs`.

## Test scenario 1 — TEST BREEDING WALL (full workflow)

| Step | Result |
|---|---|
| Designer: **TERRA 60** — 60×60×60 cm, glass, sliding doors, front-top + top ventilation, tropical interior, typed in cm in the UI, saved to MY ENCLOSURES | ✓ |
| Parametric resize 100 → 150 cm width: geometry width follows, more vent slots / geometry generated, no mesh scale ≠ 1 | ✓ |
| Designer: **RACK 30** rack box — 30 × 45 × 18 cm = W 30 × D 45 × H 18 (a low box; Phase 4 had read it as 45 cm tall — corrected in 4.1) | ✓ |
| Builder: 9 × TERRA 60 dragged from the palette with deliberately rough drops (±4 cm) → exact 3 × 3 grid by magnetic snapping | ✓ |
| Drop onto an occupied spot → red, rejected; undo / redo of placements | ✓ |
| 6 × RACK 30 dragged above the terrariums → one row of LOW boxes (6 × 30 = 180 cm wide, 18 cm high) | ✓ |
| Technical cabinet (180 × 50 × 40, W × D × H) dragged **below the floor line** → the structure is re-based and the stack sits on it | ✓ |
| Saved as **TEST BREEDING WALL**: 16 members, 15 distinct physical enclosure ids, auto frame: outer **186 × 60 × 241 cm** (W × D × H incl. 3 cm uprights + top rail), enclosure content 180 × 60 × 238 cm, no overlaps | ✓ |
| Card dragged from MY ASSEMBLIES into the viewport → ONE room object of type `assembly` | ✓ |
| Moved by dragging the structure, rotated 90° — all members follow, room object count unchanged | ✓ |
| Double-click → ENTER ASSEMBLY; click one terrarium → the member is selected (code `T60-0x`, instance id, device ids); the assembly itself is not selectable meanwhile; Esc → back to assembly level | ✓ |
| Save (autosave) → **reload** → assembly placement, rotation, all ids, relative member positions, dimensions identical; export → import identical; Planner ↔ Showcase switching leaves the document identical | ✓ |
| Room unchanged (walls, other objects, room dimensions) | ✓ |

Screenshots (Phase 4.1, captured by the e2e run itself with `SHOTS=<dir>`): `docs/screenshots/phase4_1/` —
`1-designer-rack30-WxDxH`, `2-builder-test-breeding-wall`, `3-rack30-low-row`, `4-room-assembly`,
`4b-room-assembly-iso`, `5-enter-assembly-member-selected`, `6-showcase-assembly`.

## Test scenario 2 — mixed Tetris layout

Large paludarium (100 × 50 × 90 cm, W × D × H), two small terrariums (50 × 45 × 45) stacked beside it, two normal ones
(75 × 50 × 50) dropped **below** the structure, two rack boxes above, one reserved space and one technical
cabinet at the bottom — all by pointer drags, saved as *MIXED WALL*. Verified: no uniform grid
(distinct x positions / widths), every piece rests on another piece or the floor, no 3D overlaps, reserved
space kept as its own entry, the saved assembly re-opens identically. ✓

## Full e2e suite

`node tests/run-e2e.mjs` — **43 tests**. The first full run gave 41/43. The two failures were real
regressions from this phase and were fixed, then both tests were re-run and pass:

* *selection by clicking an object*: the Inspector chip showed the renamed library category "Starting
  templates" for a placed enclosure → it shows "Enclosure" again (`chip` on the category).
* *JSON export*: the test still expected document version 1 → it now checks version 2 plus the
  `enclosures` / `instances` / `assemblies` arrays (v1 files still import — `tests/stress.mjs` feeds v1).

In-suite performance line: `{"members":75,"assemblies":5,"draws":28,"tris":304833,"batches":5,"instances":265,"ids":75}`.

| Test | Result |
|---|---|
| initial room load (demo room, UI panels, render loop) | ✓ |
| GLB loading (all catalogue models load, materials bound) | ✓ |
| missing asset handling (placeholder, logical object intact, no crash) | ✓ |
| camera orbit / pan / zoom | ✓ |
| view presets & smooth transitions (top/front/left/right/iso/reset) | ✓ |
| fullscreen toggle | ✓ |
| selection by clicking an object | ✓ (fixed, re-run) |
| move by dragging (grid snapped) + undo | ✓ |
| rotation (keyboard R, inspector) + snapping angle | ✓ |
| duplicate (Ctrl+D) and delete (Del) | ✓ |
| snapping: wall snap, grid snap, stacking on a stand, collision report | ✓ |
| room resizing (inspector) rebuilds walls and keeps objects inside | ✓ |
| add enclosure from library (click-to-place) | ✓ |
| add furniture by drag & drop from the library | ✓ |
| wall placement: door & window follow walls and cut openings | ✓ |
| JSON export (download) | ✓ (fixed, re-run) |
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
| Enclosure Designer: create "RACK 30" rack box (30×45×18) | ✓ |
| Assembly Builder: drag TERRA 60 ×9 (3×3) and RACK 30 ×6 above — magnetic snapping, no overlaps | ✓ |
| Assembly Builder: technical cabinet below, save as "TEST BREEDING WALL" (dimensions verified) | ✓ |
| Drag TEST BREEDING WALL from MY ASSEMBLIES into the room; move & rotate it as ONE structure | ✓ |
| ENTER ASSEMBLY → select one terrarium → exit (hierarchical selection) | ✓ |
| Save project, reload: assembly placement, all ids, relative positions and dimensions preserved; Planner/Showcase switching safe | ✓ |
| Mixed Tetris: large + stacked smalls, normals below, rack boxes above, reserved space, tech cabinet — no uniform grid | ✓ |
| Performance: 5 assemblies / 50+ enclosure members in the room stay batched | ✓ |
| no fatal console errors | ✓ |

## Performance (5 assemblies / 75 enclosures)

`node tests/assembly-perf.mjs` — room with 5 auto-framed walls (each 9 × TERRA 60 + 6 × RACK 30), compared
with the reference demo room. SwiftShader: absolute times are 50–200× slower than a real integrated GPU;
draw calls, triangles and memory are the meaningful numbers. Raw output: `docs/assembly-perf-results.json`.

| | Planner demo room (28 objects) | Planner 5 assemblies / 75 enclosures | Showcase demo room | Showcase 5 assemblies |
|---|---|---|---|---|
| draw calls | 18 | **25** | 384 | 89 |
| triangles | 64 k | 312 k | 868 k | 929 k |
| batches / batched instances | 5 / 73 | 5 / 265 | 65 / 230 | 5 / 265 |
| geometries / textures | 46 / 13 | 39 / 15 | 153 / 221 | 86 / 103 |
| JS heap | 24 MB | 28 MB | 40 MB | 44 MB |
| build (save 5 assemblies + place) | — | 150 ms | — | — |
| orbit (real rAF loop, median) | 7.2 fps | 5.5 fps | 0.7 fps | 2.9 fps |

* 75 physical enclosures with independent ids add **7 draw calls** to the Planner — members share the
  cached template geometry and are folded into the same ≤ 5 BatchedMeshes. Frame time scales with
  triangles only.
* The in-suite performance test (5 assemblies, 50+ members) recorded 28 draw calls / 305 k triangles.
* Auto quality: with the sampling fix the stationary frame is always 100 %; the interactive scale on
  SwiftShader drops to its floor (it is ~150 ms/frame) — on a real GPU the 20 ms bound keeps 100 %.

## Known limitations

* While an assembly is **entered** it is drawn detached from the batches (≈ 81 draw calls for the 16-piece
  wall) so the selected member can be highlighted; normal room editing is batched.
* Showcase draws custom enclosures and assemblies with the painted parametric geometry (there is no GLB for
  user designs); it lights them but they keep the Planner look.
* (Phase 4) RACK 30 had been read as W 30 × H 45 × D 18 — fixed in Phase 4.1 (W 30 × D 45 × H 18).
* The auto frame adds its profiles to the overall dimensions (reported both ways).
* Pieces may be placed floating (allowed; the frame carries them).
* All measurements are from a software rasteriser; no real-GPU numbers could be taken in this container.

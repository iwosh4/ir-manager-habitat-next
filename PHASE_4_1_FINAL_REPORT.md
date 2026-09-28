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

RESULTS_PACKAGE

## 8. Test results

RESULTS_TESTS

## 9. Performance before / after

RESULTS_PERF

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

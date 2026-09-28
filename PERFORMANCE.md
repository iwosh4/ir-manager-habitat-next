# Performance

Goal of this phase: keep the approved stationary image, but make the demo room responsive on weaker
desktop hardware (reported: ~5 FPS, ~915 draw calls on *Balanced*, "Page unresponsive" while navigating).

## What was wrong (audit)

| Area | Finding |
|---|---|
| Draw calls | Every object is a GLB clone with one mesh per material slot → ~600 meshes for 28 objects. Each frame rendered them in up to 5 passes (shadow map, transmission, main, GTAO normals, outline) → **~900 draw calls per frame**, even while only the camera moved. |
| Shadows | The shadow map was re-rendered **every frame** (three.js default), although nothing that casts shadows moves when the camera orbits. |
| Post-processing | Every camera frame paid for 4× MSAA, GTAO (8–16 samples + denoise), bloom and SMAA at full resolution. |
| Shader recompiles (the freezes) | The number of lights changed at runtime: presets set lights `visible=false`, occupancy toggles and resizing re-created enclosure lights, placement previews created lights, cut-away hid window lights with their wall. In three.js **any light-count change recompiles every lit material** on the next frame (measured: 26 new programs per Night switch and again per occupancy toggle) — a multi-second main-thread stall on weak machines, i.e. the "Page unresponsive" dialog. |
| Frame pacing | OrbitControls damping is per *frame*: at low frame rates the camera kept gliding for dozens of frames, extending the slow period. |
| Materials | Seven surfaces used `MeshPhysicalMaterial` only for a 0.08–0.2 clearcoat (an extra specular lobe evaluated for every light on every pixel). |
| Start-up | Library thumbnails were rendered live from all 26 GLBs in a second WebGL context. |

## What changed

### 1. Progressive viewport renderer (`src/renderer/RenderEngine.js`)
Two composer chains share the scene, materials and lights:

| | **Interactive** (orbit, pan, zoom, camera transitions, dragging, rotating, placing) | **Final** (stationary) |
|---|---|---|
| Resolution | `renderScale` × pixel ratio (Auto: adaptive 35–100 %; manual modes: fixed 60–75 %) | full, per quality level |
| MSAA / GTAO / bloom | off | as approved (4× / 8–16 samples / on) |
| Refraction buffer | half resolution | full |
| Outline, tone mapping, grade | yes (grain off) | yes |
| Shadow map | reused (refreshed at most every 300 ms if an edit invalidated it) | refreshed if invalidated |

The final frame is rendered automatically once interaction has been idle for **220 ms** (or ≥ 2.5
interactive frame times on very slow devices, so it never lands between two input events). Rendering
remains on-demand: an idle viewport draws nothing.

### 2. AUTO quality (new default)
* Interactive `renderScale` follows the measured frame time (EMA) toward a **33 ms (≈30 fps)** budget,
  in 5 % steps, re-evaluated every 350 ms.
* The final profile starts at *High* (*Balanced* on software/very weak GPUs) and steps down if two
  consecutive stationary frames take longer than 450 ms.
* Ultra / High / Balanced / Fast remain as manual overrides (they also use the interactive profile while moving).

### 3. Shadow invalidation
`renderer.shadowMap.autoUpdate = false`. Shadows are re-rendered only when marked dirty: object
added/removed/moved/resized, room rebuilt, model loaded, lighting preset or quality changed. Camera
movement never re-renders them. Cut-away walls are moved to a *shadow-only* layer (invisible to the
camera, still casting), so cutting walls away while orbiting doesn't invalidate shadows either.

### 4. Static batching (`src/renderer/StaticBatcher.js`)
All objects' meshes are folded into one `THREE.BatchedMesh` per (shared material, shadow flag, layer),
drawn with `WEBGL_multi_draw`: **~600 meshes → 65 batches (230 instances)**. Transforms and cut-away
visibility are updated per instance (`setMatrixAt` / `setVisibleAt`) — no rebuild when objects move,
rotate, resize or hide; batches are rebuilt only when objects are added/removed. The selected / dragged
object is *detached* and drawn from its own meshes, so the outline and live dragging are unchanged.
Per-object materials (switchable LEDs, printed labels) and animals stay individual. Transmissive and
blended batches sort their instances back-to-front, like individual meshes would be sorted.
Instancing was already used for ceiling panels, diffusers and drain slots; skirting is now one mesh per wall.

### 5. Constant light count (`src/scene/Lighting.js`)
Enclosure, task and window lights come from a **fixed pool** created at start-up; unused lights sit at
intensity 0 and lights are never made invisible. Presets, occupancy/lighting toggles, placement
previews and cut-away therefore never recompile shaders (covered by an e2e test). The pool grows by a
small chunk only if the user adds more light fixtures than it holds — a single recompile on that
explicit edit. Pool lights live outside object hierarchies and follow their fixture in world space.

### 6. Frame pacing on slow devices
* The settle window before the final frame is at least 220 ms but never shorter than 2.5 × the measured
  interactive frame cost (measured from render start to the next animation frame, so asynchronous GPU
  work is included). On a device where one frame takes 400 ms, the expensive final frame therefore never
  starts between two wheel ticks or mouse moves.
* OrbitControls damping is made frame-rate independent.

### 7. Smaller items
* All programs (incl. batching, shadow and post-processing variants) are compiled behind the loading
  screen (`renderer.compileAsync` + one warm-up frame of each chain).
* The seven low-clearcoat surfaces use `MeshStandardMaterial` (roughness nudged to keep the same sheen).
* Library thumbnails are pre-rendered PNGs (`assets/thumbnails`, `tools/build-thumbnails.mjs`); live
  rendering is only a fallback for a missing file.

Nothing in the JSON format, the catalogue, the GLB assets or the editor behaviour changed.

## Measurements

Benchmark: `node tests/benchmark.mjs <url> <quality>` — demo room, 1280×720, hero camera, real mouse
input via Playwright: 60-step left-drag orbit, 20 wheel ticks, 40-step right-drag pan.

**Test machine caveat:** the only browser available in this environment is headless Chromium with
**SwiftShader, a CPU software rasterizer**, which is 10–50× slower than any real GPU. Absolute FPS below
are therefore meaningless for real hardware; draw calls and the *ratios* between before and after are
the useful numbers. Before = approved build (commit `387d28d`), after = this build.

All runs were executed sequentially on an otherwise idle machine in one session (`tests/benchmark.mjs`,
raw JSON not committed). "Frame time" = interval between animation frames, i.e. including GPU work.

| Metric | Before (Balanced) | After — Balanced | After — **Auto** | After — Fast |
|---|---|---|---|---|
| Draw calls, stationary frame incl. shadow pass | **926** | **383** | 383 | 276 |
| Draw calls, frame while orbiting | 853 | **190** | 189 | 190 |
| Draw calls, frame while zooming / panning | 719 / 732 | 177 / 180 | 177 / 180 | 177 / 180 |
| Shadow-map renders during a pure camera orbit | every frame | **0** | 0 | 0 |
| Orbit — median frame | 4 127 ms | 1 720 ms (2.4×) | **904 ms (4.6×)** | 1 404 ms (2.9×) |
| Orbit — 95th percentile | 13 316 ms | 3 082 ms | 4 869 ms¹ | 3 424 ms |
| Orbit — worst frame | 37 574 ms | 10 744 ms¹ | 11 492 ms¹ | 7 639 ms¹ |
| Zoom (wheel) — median / p95 | 4 752 / 5 472 ms | 1 630 / 2 607 ms | **861 / 1 547 ms (5.5×)** | 1 288 / 2 007 ms |
| Pan — median / p95 | 3 830 / 4 068 ms | 1 372 / 2 051 ms | **803 / 1 375 ms (4.8×)** | 1 091 / 1 743 ms |
| New shader programs compiled by a Day→Night switch | +26 (every lit material) | **0** | 0 | 0 |
| New shader programs compiled by an occupancy toggle | +26 | **0** | 0 | 0 |
| Auto: interactive render scale reached | — | 75 % (fixed) | 35 % (adaptive floor) | 60 % (fixed) |

¹ the first frames of the orbit: one full-quality frame left pending by the benchmark's own forced
static renders (hook fixed afterwards) and the first resolution change; the steady state is the median.

What this means for a real integrated GPU (expected, not measured here): the reported 5 FPS on
*Balanced* was a GPU-bound ≈200 ms frame doing 4× MSAA + GTAO + bloom + a per-frame shadow map with
~900 draw calls. While moving, the interactive frame now skips MSAA, GTAO, bloom and the shadow map,
issues ~180–190 batched draw calls, and in Auto shrinks its resolution until the frame fits ≈33 ms
(floor 35 %). That is designed to reach ~30 FPS during manipulation on ordinary integrated graphics; the
**I** panel shows the actual frame time and render scale on your machine. Because presets, toggles and
placement no longer recompile shaders, the multi-second stalls behind "Page unresponsive" are gone.
The stationary frame keeps the approved pipeline and may take longer (it is drawn once, ~0.2 s after
the last input; Auto steps the final profile from High to Balanced if it keeps exceeding 450 ms).

Visual regression check: final frames of the approved and optimized builds were rendered with identical
cameras (hero, paludarium, rack, overview, night, selection). Mean absolute pixel difference is
0.7–1.7 / 255 for close views and ≈5 / 255 for the wide overview (film grain + the Standard-material
conversion) — no structural or lighting differences.

## How to check on your machine
Press **I** (or click the stats line bottom-right) for live diagnostics: mode (interactive / final),
quality and the effective final profile, FPS, frame time, draw calls, triangles, render scale, shadow-map
updates, batches, light-pool usage, program count and GPU name. The orange dot means the interactive
profile is active; green means the final frame is on screen.

## Phase 3 note — settle-window fix (Showcase)

The settle window after an interaction is counted from the *end* of the slow frame so queued input is
not cut short. It is now extended **once per input event**; previously it was re-extended after every
interactive frame, which on very slow hardware (≥ 1 s interactive frames) could keep the Showcase in
the interactive profile indefinitely and never draw the final frame. No visual or pipeline change.
The Planner renderer and its measurements are documented in **STYLIZED_RENDERER.md**.

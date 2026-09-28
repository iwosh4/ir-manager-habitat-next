# Concept B — Test report

All tests ran against the **running app**, served statically and driven by Playwright (Chromium 1.56, `--disable-gpu`). Every run starts from freshly generated demo data. Raw outputs are in `tests/`.

## 1. Real-work & workflow-efficiency tests — `tests/workflow.test.cjs`

**48 / 48 pass** (full output: `tests/workflow-results.txt`, `tests/workflow-results.json`).

| Suite | Scenarios | Result |
|---|---:|---|
| Desktop 1440 × 900 (mouse + keyboard) | 25 | 25 pass |
| Mobile 390 × 844 (touch, bottom nav, sheets, no shortcuts) | 21 | 21 pass |
| Mobile 390 × 844 with clock pinned to 08:10 (morning round) | 2 | 2 pass |

Each scenario counts its interactions, checks them against the brief's budget, and **verifies the result in the persisted database**. The scenarios cover:
- scheduled feeding
- grouped ×N feeding (12 records in one tap)
- water/mist/clean
- refused (rotation not advanced)
- postpone and skip
- undo
- weight (queue 2, profile 3, global 5)
- shed and health
- bulk care (29 animals in 4 interactions; 12 misted in 4 interactions)
- group husbandry
- new task
- incubation check
- stock correction
- low stock → shopping list
- search → open
- four **custom-workspace** tests: add via library search and persist across reload; resize, move, duplicate, remove, undo, persist; preset then reset; two independent shopping lists
- no uncaught page errors

Counts per scenario are in WORKFLOW_EFFICIENCY.md.

**Time-dependence.** The demo is generated relative to "now". One desktop/mobile scenario ("Quick Record → Select all due") reports *"no activity has ≥2 animals due at this hour"* when run in the evening. That is why the morning-round suite pins the clock to 08:10, where the same flow is verified with 12 animals.

### Defects found by these tests and fixed

| # | Found | Fix |
|---|---|---|
| 1 | Bottom sheets (z-index 50) rendered **under** the mobile bottom nav (60). Buttons at the bottom of Quick Record could not be tapped. | Overlays 70, menus 85, toasts 90 |
| 2 | The "Incubation window" tool could not be added as a widget: its key was shadowed by the Reproduction "Incubation" widget. | Tool widgets whose key collides get the `-tool` suffix; the Tools page maps keys correctly |
| 3 | Picking a single target in Quick Record took 2 taps (select + Continue). | Tapping a row selects it and continues; the check box starts multi-select |
| 4 | Tapping FED took ~150 ms synchronously (resolving the item rebuilt a 445-day timeline). | Narrow-window fast path, ~5× faster; optimistic feedback painted in the tap frame |
| 5 | Phone layout: the main column grew to the width of the context tabs (516 px on a 390 px screen). | `.main-col { grid-template-columns: minmax(0, 1fr) }` |
| 6 | Horizontal overflow at 360 px in the converter tool, long timeline meta, mini tables and the contact e-mail button. | Min-width and wrap fixes (see §3) |
| 7 | Avatars rendered at full image size inside inline contexts (Health list). | `.av` is `inline-block` |
| 8 | Desktop: the electricity-cost table overflowed its card on Finance → Calculators. | Tool mini-tables scroll inside their card |

## 2. Route scan (console errors, page errors, failed requests, horizontal overflow)

**55 routes** were scanned at **1440, 430, 390 and 360 px**. They cover every module, every sub-tab and all detail routes: animal profile (individual and group), cycle, clutch, enclosure and contact. The scan captured console errors, uncaught page errors and failed requests, and measured every element's bounding box for horizontal overflow (elements clipped by their own scroll container were excluded).

**Result: 0 console errors, 0 page errors, 0 failed requests, 0 overflowing routes at every width** (after fixes #5, #6 and #8).

These overlay and interactive states were exercised in the screenshot and workflow runs, also without errors:
- Quick Record (3 steps), search, notifications
- workspace edit, widget library, widget config
- the Multitool drawer, postpone menu, add-animal stepper, hatch flow

## 3. Responsive targets

| Width | Result |
|---|---|
| 1920 × 1080 | OK (spot scan + screenshots `-1920`) |
| 1440 × 900 | OK (55-route scan) |
| 1366 × 768 | OK (spot scan + screenshots `-1366`) |
| 430 × 932 | OK (55-route scan) |
| 390 × 844 | OK (55-route scan) |
| 360 × 780 | OK (55-route scan) |

## 4. Performance — `tests/perf.cjs` (`tests/perf-results.jsonl`)

| Metric | Desktop 1440 | Mobile 390 |
|---|---:|---:|
| First load → dashboard rendered | 379 ms | 330 ms |
| Median route switch (12 routes) | 69 ms | 68 ms |
| Slowest route switch (Planner timeline) | 116 ms | 180 ms |
| Tap FED → feedback painted | 22 ms | 23 ms |
| Tap FED → Planner week (≈7,300 nodes) re-rendered | 262 ms | 196 ms |
| JS heap | 10 MB | 10 MB |
| Requests / transfer (fonts and images included) | 61 / 1.2 MB | 58 / 1.1 MB |

## 5. Deployment check (Apache + `.htaccess`)

Concept B was served by Apache 2.4 with `AllowOverride All`:
- `index.html` → 200.
- `.webp` → `image/webp`.
- The **CSP header** (`default-src 'self'`) is present; 6 routes, Quick Record and the Multitool run with **0 CSP violations**.
- `tests/` and `tools/` → **403**.

## 6. Screenshots — `screenshots/` (87 images from the running app)

| Set | Viewport | Images |
|---|---|---|
| desktop/*-1440 | 1440 × 900 | 30 module screens + 14 interactive states |
| desktop/*-1920 | 1920 × 1080 | 7 |
| desktop/*-1366 | 1366 × 768 | 6 |
| mobile/*-390 | 390 × 844 @2× | 12 screens + 6 interactive states |
| mobile/*-430 | 430 × 932 @2× | 6 |
| mobile/*-360 | 360 × 780 @2× | 6 |

**Module screens:** dashboard, planner (timeline, week with lanes, history), tasks, Quick Care, animals (grid, table, groups), profile (individual and group), reproduction, cycle, clutch, incubation, health, medication, enclosures, enclosure detail, assemblies, Habitat Studio entry, inventory, stock, finance, monthly, sales, directory, genetics, tools, settings.

**Interactive states:** Quick Record (3 steps), search palette, notifications, workspace edit, widget library, widget config, Multitool drawer, postpone menu, expanded group, add-animal stepper, hatch flow, light theme; on mobile, the + sheet, Quick Record weight, the More accordion, the postpone sheet and the Multitool.

`screenshots/INDEX.txt` lists them all. They were captured as PNG and stored as WebP (quality 82).

## 7. Isolation check

- `git diff --stat 912562e..HEAD -- . ':!ir-manager-design-lab'` is **empty**. No file outside `ir-manager-design-lab/` was changed by this work.
- `/app-manager/` does not exist in this repository and was not accessed.
- There are no network calls. `connect-src 'self'` is enforced by the CSP, and the only storage is the browser's `localStorage` (`irmB.*` keys).

## 8. Not tested / limits

- Real phones: the mobile tests used Chromium device emulation (touch, isMobile, DPR 2), not physical iOS or Android devices.
- Screen readers were not tested. Semantics are in place (roles, labels, aria-pressed/checked), but no NVDA/VoiceOver pass was done.
- Voice commands and QR scanning depend on browser APIs. Only their typed fallbacks were exercised.
- The comparison with the current IR Manager could not be measured, because its source and UI were not available (see CONCEPT_B_COMPARISON.md).

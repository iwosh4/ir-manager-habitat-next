# Concept B — factual comparison notes

> **Important limitation.** The source of the current production IR Manager (`/app-manager/`) was **not available** in the working environment for this task. Only the Habitat Studio repository was accessible. Concept B was therefore built from the written brief, **not** from a code-level or screen-level study of the current application.
>
> This document does not declare a winner. It lists what Concept B does, measurably, so that it can be compared side by side with the current IR Manager by someone who has both open. The "Current IR Manager" column is deliberately left for that reviewer to fill in.

## How to compare

1. Run both apps on the same data scale (Concept B has 31 animal records / 50 animals, 28 enclosures, 7 cycles, 4 clutches).
2. Perform the tasks below in each and count interactions the same way: 1 tap/click, 1 key press, or 1 typed value = 1 interaction. Scrolling is not counted.
3. Record the numbers in the empty column.

| # | Task | Concept B (measured) | Current IR Manager |
|---|---|---:|---:|
| 1 | Record a scheduled feeding | 1 | |
| 2 | Record 8 identical frog feedings due at the same time | 1 | |
| 3 | Scheduled water / misting / cleaning | 1 | |
| 4 | Feeding refused | 1 | |
| 5 | Postpone an item by 1 h | 2 | |
| 6 | Skip an item | 2 | |
| 7 | Undo the last action | 1 | |
| 8 | Weight from the weigh-in queue / planner | 2 | |
| 9 | Weight from the animal profile | 3 | |
| 10 | Weight from anywhere (global Quick Record) | 5 (+1 if the animal is not due: "All" filter) | |
| 11 | Shed from the profile | 2 | |
| 12 | Health observation from the profile | 3 | |
| 13 | Water 29 animals at once (Quick Care) | 4 | |
| 14 | Record care for a 4-frog group | 2 | |
| 15 | New task | 3 | |
| 16 | Incubation check | 1 | |
| 17 | Correct stock by +1 | 1 | |
| 18 | Low stock → shopping list | 1 | |
| 19 | Find and open an animal by name | 3 | |
| 20 | Add a widget to the dashboard via library search (persisted) | 5 | |

Measured with `tests/workflow.test.cjs` on desktop (1440 × 900) and mobile (390 × 844). See WORKFLOW_EFFICIENCY.md and TEST_REPORT.md.

## Structural differences to check

These describe Concept B. Whether the current app differs has to be verified against it.

| Area | Concept B |
|---|---|
| Record model | One history (`records[]`) written by every interface; stock and rotation side-effects are reversible. |
| Work generation | Care plans generate occurrences, so routine work is confirmed rather than entered. |
| Timeline | One engine and one renderer, reused in 7 places, including a 90-day biological Gantt. |
| Biology | Expected phases and hatch windows shown as ranges; observed events solid. |
| Group animals | A group is one record with members; one record per care action. |
| Confirmation | Undo toasts plus Ctrl+Z; confirmation only for resets. |
| Customisation | 9 workspaces × 46 widget types, accents and frames, presets, reset, multi-instance documents. |
| Tools | 15-tool Multitool as drawer, page and widgets. |
| Mobile | Bottom nav with a central +, bottom sheets, stream timeline, card tables; no horizontal overflow at 360/390/430 px (verified on 50 routes). |
| Offline | Everything is local; no remote assets. |

## Known gaps and risks of Concept B

- **Demo-only persistence** (`localStorage`). There is no API, authentication, multi-user support or sync. Connecting it to the production backend is a separate project.
- **i18n:** Czech covers navigation and core actions only; the module content is in English.
- **Genetics** is limited to *Python regius* morphs (recessive / incomplete-dominant / dominant, possible-het weighting).
- **Voice commands** depend on the browser's SpeechRecognition (a typed command line is the fallback). **QR scanning** depends on BarcodeDetector (code entry is the fallback).
- **Habitat Studio** is linked (`../index.html`), not embedded. The ZIP contains only Concept B, so the link resolves only when Concept B is deployed next to Habitat Studio.
- **Time-of-day effects:** the demo is generated relative to "now", so which items are due depends on when the app is opened. The tests note when a scenario had nothing due.

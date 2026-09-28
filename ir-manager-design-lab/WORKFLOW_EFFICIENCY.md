# Concept B — Workflow efficiency

**Absolute rule: save the breeder's time.** This document sets the brief's interaction budget against **measured** counts from the running app. The counts come from `tests/workflow.test.cjs`, run in Chromium on desktop (1440 × 900) and on mobile (390 × 844, touch).

**Counting rule:** one tap/click = 1, one key press = 1, one typed value = 1. Scrolling, and the app's own feedback (toast, re-render), are not counted.

Each scenario starts from freshly generated demo data, and every scenario verifies its **outcome in the persisted database**: the record exists, the occurrence is done, stock moved, the widget persisted.

## Budget vs. measured

| Brief budget | Scenario | Desktop | Mobile | Result |
|---|---|---:|---:|---|
| Scheduled feeding **1** | FED on a scheduled feeding (Planner, Tasks, Dashboard, profile) | **1** | **1** | Record written with feeder, quantity and rotation supplement; stock deducted |
| Scheduled feeding **1** | "Feeding ×N" group card → FED all | **1** | **1** | 12 records in one tap |
| Water / misting / cleaning **1** | DONE on a scheduled item | **1** | **1** | ✓ |
| Water / misting / cleaning **1** | Morning misting round, grouped "Misting ×12" (clock pinned to 08:10) | – | **1** | 12 records in one tap |
| Refused **1–2** | Refused button on a feeding | **1** | **1** | Rotation *not* advanced |
| Postpone **1–2** | Later → +1 hour | **2** | **2** | ✓ |
| Skip **1–2** | More → Skip | **2** | **2** | ✓ |
| Shed **1–2** | Profile → Shed → SHED | **2** | **2** | ✓ |
| Weight **2–3** | Weigh-in queue / Planner item: type value → SAVE | **2** | **2** | ✓ |
| Weight **2–3** | Profile → Weight → value → SAVE | **3** | **3** | Shows the difference from the last weight |
| Weight **2–3** | Global Quick Record: open → Weight → animal → value → SAVE | **5** (6 if the animal is not due) | **5** (6) | **Over budget.** Explained below. |
| Bulk care **2–4** | Quick Care: Water → All animals → All → GO | **4** | **4** | 29 animals, each with its own record |
| Bulk care **2–4** | Quick Record: + → Misting → Select all due → DONE (08:10) | – | **4** | 12 animals |
| Group husbandry | Profile of a 4-frog group → Mist → DONE | **2** | **2** | One record covers all members |
| Undo instead of confirm | Toast → Undo | **1** | **1** | State restored, including stock and rotation |
| — | New task (N → title → CREATE; mobile: "+ Task" → title → CREATE) | **3** | **3** | ✓ |
| — | Incubation check | **1** | **1** | ✓ |
| — | Stock +1 | **1** | **1** | ✓ |
| — | Low stock → shopping list | **1** | **1** | Duplicates detected |
| — | Find and open an animal by name | **3** | **3** | `/` → type → Enter |
| — | Add a widget via library search (persisted after reload) | **5** | – | ✓ |

**Result:** 48 of 48 scenarios pass (see TEST_REPORT.md). Every routine task in the brief is within budget in its intended context. The one over-budget path is *weight from a cold start with no context*. It costs 5, or 6 when the animal is not in the "Due now" list, because the app has to learn *which* animal.

Three shorter paths exist for weighing:
- the weigh-in queue (2)
- the profile (3)
- "Repeat last" in Quick Record (the last action and target are one tap away)

## Mechanisms that produce these numbers

1. **Work is generated, not entered.** Care plans produce occurrences (`plan@due`), so recording is a confirmation.
2. **One primary button per item**, labelled with the outcome: FED / DONE / GIVEN / CONFIRM / CHECK / SAVE.
3. **Grouping identical work.** Same type, same time and same group key form one card (e.g. `dendro-feed`, `mist`). Open and finished items never share a card.
4. **Context pre-fill.** Quick Record opened from a profile, cycle or enclosure skips target selection.
5. **One-tap target.** In Quick Record, tapping an animal row selects it *and* continues. Ticking the check box instead starts multi-select for bulk care. This was introduced after the first measurement run showed two taps (select + Continue) for single targets.
6. **Defaults from data.** Feeder, quantity, supplement rotation, stock item, time and follow-up interval are filled in. Extra fields sit behind "Details · optional".
7. **Postpone presets.** +1 h, later today, tomorrow and +2 d show the resulting time before you commit.
8. **Undo everywhere** (toast plus Ctrl+Z, 40 labelled steps) instead of confirmation dialogs.
9. **Keyboard.**
   - `Q` record, digits 1–0 choose the action, Enter picks the first match
   - `/` search, `N` new, `T` tools, `G`+letter to navigate
10. **Mobile thumb zone.** The + button sits in the centre of the bottom nav. Sheets rise from the bottom, primary buttons are ≥ 48 px, and timeline actions sit on their own row under the content.

## Speed (the time side of efficiency)

Measured with `tests/perf.cjs` (headless Chromium, local static server):

| Metric | Desktop | Mobile |
|---|---:|---:|
| First load → dashboard rendered | 379 ms | 330 ms |
| Median route switch (12 routes) | 69 ms | 68 ms |
| Tap FED → visual feedback painted | **22 ms** | **23 ms** |
| Tap FED → Planner week (≈7,300 DOM nodes) fully re-rendered | 262 ms | 196 ms |
| JS heap | 10 MB | 10 MB |
| Transfer (61 requests, fonts and images included) | ≈1.2 MB | ≈1.2 MB |

Two optimisations came out of measuring:
- **Resolving an item** used to rebuild a 445-day timeline on every tap (≈150 ms). It now tries a narrow window first, which made the handler about 5× faster.
- **Optimistic feedback** (the item dims and the button turns green) is painted in the same frame as the tap, before the view re-renders.

## Mobile real-work test

The same 20 scenarios were run with a 390 × 844 touch viewport using only the bottom navigation, the + sheet and on-screen buttons (no keyboard shortcuts). All pass with the same counts as desktop. A 50-route overflow scan at 360, 390 and 430 px found **no horizontal overflow**. Screenshots are in `screenshots/mobile/`.

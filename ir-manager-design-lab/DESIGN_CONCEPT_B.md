# IR Manager Enterprise — Concept B

**What it is.** Concept B is a complete, runnable alternative frontend for IR Manager. It lives in `/ir-manager-design-lab/`, isolated from production. It is static HTML/CSS/ES modules with no build step and no server code. It uses its own demo data in the browser's `localStorage`. It never touches `/app-manager/`, the production database, uploads, migrations, production CSS/PHP/JS or Habitat Studio.

**Guiding rule.** Save the breeder's time. Every screen answers three questions: *what needs me now, what is next, and what can I finish right here.* Routine work is **recorded, not created**. Care plans generate the work, and the breeder confirms it with one tap.

---

## 1. Principles → mechanisms

| Principle | Mechanism in Concept B |
|---|---|
| Never ask for known context | Quick Record opens pre-filled from the current screen: the animal on a profile, the cycle in reproduction, the enclosure in its detail. Feeder, quantity, supplement (from the rotation), time and stock item come from the care plan. |
| One tap for scheduled work | Every timeline item has one primary button (FED / DONE / GIVEN / CONFIRM / CHECK). Grouped identical work (e.g. "Feeding ×8") has a group button. |
| Undo instead of confirmation | Every write goes through `store.mutate(label, fn)`, which takes a snapshot per labelled step. Toasts offer **Undo** and **Edit**, and **Ctrl+Z** works globally. Only destructive resets ask for confirmation. |
| Smart defaults, progressive disclosure | Details are behind an "optional" disclosure (feeder/quantity override, time, note, vet, diagnosis, file). Postpone offers presets (+1 h, later today, tomorrow, +2 d) before a date picker. |
| One history | Planner, Tasks, Dashboard widgets, Quick Record, Profile, Quick Care and bulk actions all call `engine/actions.js` and write the same `records[]`. Re-opening or deleting a record restores stock and the supplement rotation. |
| Honest biology | Reproduction phases and hatch windows are **ranges** (e.g. 52–60 d at 31.5 °C), drawn hatched when expected and solid when observed. The app never shows a fake exact date. |
| Latin names first | *Italic serif* (Fraunces) is the primary species label everywhere. Common and Czech names are secondary. |

## 2. Information architecture

```
OPERATE      Dashboard · Planner · Tasks & Care
COLLECTION   Animals · Reproduction · Health · Enclosures (→ Habitat Studio)
BUSINESS     Inventory · Finance · Sales & Archive · Directory · Genetics
SYSTEM       Tools (Multitool) · Settings
```

- **Desktop:** a collapsible left rail. A top bar holds global search (`/`, Ctrl+K), **Record** (`Q`), QR/code entry, voice/command, Multitool (`T`), notifications and save state. Below it an **active context bar** shows the module title, a live subtitle, tabs with counts, and actions for that context.
- **Mobile (≤ 760 px):** a bottom navigation **HOME · ANIMALS · + · TASKS · MORE**. The **+** opens Quick Record as a bottom sheet. **More** is an accordion of all modules and their sub-pages; it keeps its open state and does not reload. The top bar shows the brand, the current title, search and the bell. Context tabs scroll horizontally.

## 3. The shared timeline system

A single engine, `engine/timeline.js` `buildTimeline()`, merges these sources:
- care-plan occurrences (`plan@due`)
- manual tasks
- reproduction phases, milestones and next steps
- clutch hatch windows and incubation checks
- health follow-ups
- medication doses
- stock reminders
- history records

Each item has a status: open / overdue (after a 30-minute grace period) / done / skipped / cancelled / span.

A single renderer, `ui/timeline.js` `streamHTML()`, lays the items out as **Overdue → Earlier today → NOW → Later today → Tomorrow → day groups**. It is reused in:
- Planner (Today / 3 days / Week / Month, filters, search, species/enclosure filter, show completed, history)
- Tasks & Care
- the Dashboard widgets
- the animal profile ("Now & next")
- cycle detail, enclosure detail, and Health follow-ups

Identical work is grouped into one card with per-animal rows, select, done, skip and later actions. Every item has **"Why is this here?"**, which names the care plan, task or cycle rule that generated it.

The Planner also has a **90-day biological lanes view** (Gantt) of cycles, incubation and medication courses, with a NOW line.

## 4. Key flows

- **Quick Record** (global): action (10 tiles, keys 1–0, order configurable in Settings) → target (Due now · Recent · Favourites · Groups · All · search) → minimal detail → one primary button. **Tapping a row selects it and continues. Ticking boxes starts multi-select for bulk care.** "Repeat last" and "Edit last" are one tap each.
- **Quick Care** (Tasks → Quick Care): pick an activity, then select *All / Visible / Today's group / by group / species / enclosure / recent selection*, then **GO**. Every animal gets its own record and its own rotation step.
- **Animal profile:** hero with specimen plate, Latin name, facts and favourite star. An action strip holds **Feed** (completes the next scheduled feeding in one tap), Water/Mist, Weight, Health, Breeding and More. Six focused sections replace ten equal tabs: Overview · Care · Breeding · Health · Records · Details.
- **Reproduction:** season Gantt, next biological steps (confirming one advances the cycle), clutch detail with day N of the expected range, per-egg state, one-tap checks, and a **Hatch** flow that creates the offspring records with their parents linked.
- **Group husbandry:** frog groups are one animal record (`kind: group`) with members inside. One record covers the whole group, and member notes are optional.
- **Supplement rotation:** `rotation[count of non-refused feedings % length]`. It is recorded automatically. A refused feeding does not advance it, and it can be overridden per feeding.

## 5. Workspaces, widgets and the Multitool

See **WIDGET_SYSTEM.md** (46 widget types, 9 workspaces, full edit mode, presets, persistence) and **MULTITOOL_CATALOG.md** (15 tools including feed-demand planner, expo price list, label printer, incubation window and electricity cost).

## 6. Visual system

- **Theme:** "graphite lab" dark by default (surfaces `#0c0e10 → #20252a`), with **amber** (`#f0a13c`) as the only brand and action colour. A paper **light theme** is available.
- **Event-family colours:** feed amber, water blue, mist teal, clean sand, weight violet-grey, shed, health red, medication pink, repro violet, incubation orange, enclosure green, inventory, finance. The same colour means the same thing in the timeline, chips, widgets and charts.
- **Typography:** Inter (UI, tabular numbers), Fraunces italic (Latin names) and JetBrains Mono (codes, times, sex ratios such as `2.2.0`).
- **Imagery:** procedural specimen plates for all 8 species (6 variants plus a macro each), clutches, feeders and supplement jars; Habitat Studio renders for enclosures and the room; SVG line illustrations for empty states and KPIs; Lucide icons. Everything is local. See **ASSET_MANIFEST.md**.
- **Density:** 44 px minimum touch targets on mobile, 32–36 px controls on desktop, a 12-column grid, and cards with a subtle 1 px line in place of heavy shadows.
- **Motion:** 120–260 ms, with FLIP animation for widget reordering. It respects system settings and never blocks input.

## 7. Performance and accessibility

- No framework and no build. There are around 40 ES modules, and view modules are lazy-loaded per route. Re-renders are batched with `requestAnimationFrame`, and they preserve scroll, focus and text selection.
- Images are WebP, lazy-loaded with `decoding=async`. The total asset payload is about 2 MB for the whole app, including fonts.
- Keyboard:
  - `Q` record, `/` search, `N` new (context-aware), `T` Multitool
  - `G`, then a letter, to navigate
  - Ctrl+Z undo, `Esc` closes, `?` shows help
- Other: tabs use `role=tab`, switches use `aria-pressed`/`aria-checked`, and inputs are labelled. Mobile inputs use a 16 px font size to prevent iOS zoom.

## 8. Running it

```
python3 -m http.server 8095   # from the repository root, or any static host
open http://localhost:8095/ir-manager-design-lab/
```

The demo data is generated relative to *today*, so there is always something due and something overdue. **Settings → Workspaces & data → Reset demo** regenerates it.

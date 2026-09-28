# Concept B — Widget & workspace system

Every main module has a **workspace**: a user-arranged grid of widgets placed under the module's fixed content. The workspaces are Dashboard, Animals, Tasks, Planner, Health, Reproduction, Enclosures, Inventory and Finance. The fixed content (the brief, lists and timelines) always stays where it is. The workspace is the personal layer.

Code:
- `js/widgets/registry.js`: widget catalogue, categories, accents, frames, defaults and presets.
- `js/widgets/workspace.js`: rendering, edit mode, drag, library and configuration.
- `js/widgets/wsstore.js`: persistence.
- `js/widgets/tools.js`: tool widgets.

## Model

```
localStorage["irmB.ws.v1"] = {
  layouts: { dashboard: [instance…], animals: [...], … },   // per workspace, created from DEFAULTS on first use
  docs:    { <docId>: { kind: 'shopping'|'notes'|'checklist', title, accent, items|text, pinned, updated } }
}
instance = { id, type, size: 's'|'m'|'l'|'w', title, accent, frame, icon, density, collapsed, cfg, docId? }
```

- **Documents are separate from widgets.** A shopping list, note or checklist is a document, and a widget only points to it (`docId`). The same list is therefore identical on the dashboard, in a module workspace and in the global Multitool drawer. Deleting a document removes the widgets that show it.
- **Multiple instances.** Tool widgets that hold documents, and the calculator, are `multi`. You can place two shopping lists ("FEED ORDER", amber, and "EQUIPMENT", blue) side by side, each with its own colour, title and items.
- The **grid** has 12 columns and 74 px rows, packed with `grid-auto-flow: dense`. There are four sizes: **S** 3×3, **M** 4×4, **L** 6×5 and **W** 12×3. Each widget declares which sizes make sense for it. Below 1024 px, S and M take half the width. Below 760 px every widget takes the full width with automatic height (a single column).

## Edit mode (the "Edit workspace" button on each workspace)

| Capability | How |
|---|---|
| Add | **+ Add widget** opens the library, a modal with categories, live search ("shopping", "incubation", "stock"…), previews, allowed sizes and a *multi* badge. |
| Remove | ✕ on the widget. The toast offers **Undo**, so there is no confirmation dialog. |
| Move | Drag the handle (FLIP-animated reflow), or use ← / → buttons, which are keyboard accessible and keep focus. |
| Resize | S / M / L / W segmented control in the widget header, limited to the widget's allowed sizes. |
| Configure | The palette button opens a panel with title, **accent** (8 curated colours: neutral, amber, blue, violet, red, green, teal, sand), **frame** (header strip, side line, tint, outline, plain), icon, density (comfortable/compact) and a live preview. Document widgets recolour their document. |
| Duplicate | Copies the widget. For document widgets it also copies the document ("… (copy)"), so the two can diverge. |
| Collapse | Chevron outside edit mode. The collapsed state persists. |
| Presets | **Balanced (default)**, **Breeding focus**, **Daily care**, **Inventory & sales**. Applying one can be undone. |
| Reset | Restores the workspace defaults (can be undone). Documents are kept. Settings → Workspaces can reset one workspace or everything. |
| Persistence | Every change is saved immediately (debounced) and survives reloads. Verified by `tests/workflow.test.cjs`. |

The accent palette is deliberately curated rather than a free colour picker. Every accent is tuned for both the dark and the light theme and reads as a *category*, not decoration.

## Widget catalogue (46 types)

### Information & action widgets (30)

| Key | Name | Category | Sizes | Purpose |
|---|---|---|---|---|
| kpis | Collection KPIs | Overview | W, L | Animals, enclosures, clutches, health and finance, with imagery |
| attention | Needs attention | Overview | M, L, W | Overdue care, alerts, windows and low stock in one list |
| activity | Recent activity | Overview | M, L | Records from every interface |
| docs | Document shortcuts | Overview | S, M | CITES, invoices, lab reports |
| today | Today & Upcoming | Planner | M, L, W | Compact timeline: overdue, NOW, today, tomorrow, with one-tap completion |
| upcoming | Upcoming events | Planner | M, L | Non-routine events for the next 14 days |
| overdue | Overdue | Tasks | S, M, L | Late work, one tap to complete |
| quickcare | Quick Care | Care | S, M, L | Due care grouped by activity; a whole group in one tap |
| rotation | Supplement rotation | Care | M, L | Where each rotation stands and what comes next |
| weighin | Weigh-in queue | Care | M, L | Inline weight entry with the last weight shown |
| collection | Collection overview | Animals | M, L | Species counts and sex ratios |
| favorites | Favourites | Animals | S, M, L | Starred animals and their next action |
| recent | Recent animals | Animals | S, M, L | Recently opened or recorded animals |
| groups | Group overview | Animals | M, L | Group-kept frogs as one card each |
| repro | Active reproduction | Reproduction | M, L, W | Every cycle: current phase and next step |
| incubation | Incubation | Reproduction | M, L, W | Clutch day counts against expected ranges, one-tap check |
| hatch | Expected hatchings | Reproduction | M, L, W | Hatch windows on a shared time axis, shown as ranges |
| healthalerts | Health alerts | Health | S, M, L | Open problems by severity |
| followups | Follow-ups | Health | S, M | Scheduled re-checks |
| meds | Medication | Health | S, M, L | Course progress and next dose |
| enclosures | Enclosure status | Enclosures | M, L, W | Readings, technical warnings, maintenance |
| habitat | Habitat Studio | Enclosures | M, L, W | Room render and the entry point to the 3D planner |
| lowstock | Low stock | Inventory | S, M, L | Below-minimum items, one tap to the shopping list |
| stockvalue | Stock value | Inventory | S, M | Value by category |
| moves | Recent stock movements | Inventory | M, L | Includes automatic deductions from feedings |
| feeddemand | Feed demand | Inventory | M, L | Weekly demand from care plans compared with stock |
| finsum | Finance summary | Finance | S, M, L | This month's result |
| monthly | Monthly overview | Finance | M, L, W | 12-month income against expenses |
| sales | Recent sales & reservations | Finance | M, L | Sold, reserved, for sale |
| budget | Monthly budget | Finance | S, M | Spending against budget per category |

### Tool widgets (16, from the Multitool — see MULTITOOL_CATALOG.md)

These are shopping list*, notes*, checklist*, calculator*, unit converter, date calculator, incubation window (`incubation-tool`), enclosure volume & substrate, price & margin, electricity cost, stock count, expo price list, label printer and quick links. Tools marked * support multiple instances. The feed demand planner appears as `feeddemand`.

## Defaults per workspace

| Workspace | Default widgets |
|---|---|
| Dashboard | KPIs (W), Today & Upcoming (L), Needs attention (L), Incubation (L), Active reproduction (L), Quick Care, Low stock, Health alerts, Recent activity, Favourites, Habitat Studio (L), "Breeding room notes" |
| Animals | Collection overview, Group overview (L), Favourites, Weigh-in queue, Recent animals |
| Tasks | Quick Care, Overdue, Supplement rotation, Weigh-in queue (L), Upcoming |
| Planner | Today (L), Upcoming, Supplement rotation |
| Health | Health alerts (L), Follow-ups, Medication, "Vet questions" note (red), Recent activity |
| Reproduction | Active reproduction (L), Incubation (L), Expected hatchings, "Breeding notes" (violet), "Hatching prep" checklist |
| Enclosures | Enclosure status (L), Habitat Studio (L), Volume & substrate, Electricity cost (L) |
| Inventory | Low stock, **FEED ORDER** + **EQUIPMENT** shopping lists (two instances), Feed demand (L), Recent movements, Stock value (S), Calculator (S), "Supplier notes" |
| Finance | Finance summary, Budget, Calculator (finance keys, S), Monthly overview (L), Sales, Price & margin, "Month-end" checklist (green) |

## Custom-workspace test (automated, `tests/workflow.test.cjs`)

1. Edit → Add widget → search "incubation window" → add → Done → **reload → still there** (5 interactions).
2. Resize to W, move, duplicate, remove, then undo the removal → **reload → size, order and count preserved**.
3. Apply the "Breeding focus" preset (the hatch widget appears), then reset (the default layout returns).
4. Two independent shopping-list widgets exist (FEED ORDER, EQUIPMENT on the Inventory workspace).

Measured results are in TEST_REPORT.md.

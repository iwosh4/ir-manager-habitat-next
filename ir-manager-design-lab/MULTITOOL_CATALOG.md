# Concept B — Multitool catalogue

The Multitool is a set of small working tools that a breeder uses next to the records. It is reachable from four places, and it is **the same tool with the same data** in each:

1. **Header wrench / key `T`**: global drawer (bottom sheet on mobile), from any screen, without losing context.
2. **Tools page** (`#/tools`): searchable catalogue with the tool open next to it and an **Add to dashboard** button.
3. **Widgets**: any tool can be placed on any workspace. Lists, notes, checklists and the calculator allow multiple instances.
4. **Contextual shortcuts**: for example "Expo price list" in Sales, "Stock count" in Inventory, "Print label" in the profile's More menu, and "Low → shopping" in Inventory, Directory and the Low-stock widget.

Implementation: `js/widgets/tools.js`. Each tool is a pair of functions: `R[kind]` renders and `H[kind]` handles events. Tools bind their own events on their root element, so they work anywhere without global wiring. Documents persist in `irmB.ws.v1.docs`. Calculators keep transient per-instance state.

## Lists & notes (documents, multi-instance)

| Tool | What it does | Why a breeder needs it |
|---|---|---|
| **Shopping list** | Items with quantity, unit, price, category (feed / supplements / equipment / substrate / other) and priority. Items can be linked to inventory items (`ref`). Shows a total cost. Tick off, clear done, several lists each with a colour (FEED ORDER amber, EQUIPMENT blue). | Orders are split by supplier. Low stock fills the lists automatically, and duplicates are detected ("Already on FEED ORDER"). |
| **Notes** | Autosaved notepad with pin, a large editor and checklist mode. | Vet questions, breeding notes, expo ideas. Demo notes are seeded per workspace ("Vet questions" in Health, "Breeding notes" in Reproduction). |
| **Checklist** | Light personal checklist with a progress count. | Expo packing, transport, room close-down, month-end bookkeeping. |

## Calculate

| Tool | What it does |
|---|---|
| **Calculator** | Keyboard-friendly calculator with **context keys**. In Finance: +21 % VAT, −VAT, ÷12, +30 % margin. In Enclosures: cm³→L, L→gal. |
| **Unit converter** | g ↔ oz, cm ↔ in, °C ↔ °F, litres ↔ US gallons, with a swap button. |
| **Date calculator** | Date ± days; days between two dates; day N of a clutch. |
| **Incubation window** *(invented)* | Species, lay date and range (prefilled from the species data, editable) → today's day, window start and end dates, and a range bar. It never gives a single "due date". |
| **Enclosure volume & substrate** *(invented)* | W × D × H → litres, floor area, glass area, substrate litres and number of bags. Can be prefilled from any enclosure record. |
| **Price & margin** | Unit price × quantity with VAT, and a sale price from cost and margin. |
| **Electricity cost** *(invented)* | Monthly cost of lamps, heating and pumps (W × h/day × price per kWh), prefilled from the technical state of the enclosures. |

## Collection tools (invented for this concept)

| Tool | What it does |
|---|---|
| **Feed demand planner** | Reads every active feeding plan (quantity × frequency) and compares it with stock. Shows per week, in stock, how long it lasts, and what to order for 2 weeks. **Add order to shopping list** is one tap. |
| **Stock count** | Count live and frozen feed by category with steppers (±10 for large stocks). **Save** writes one stock movement per changed item, with undo. |
| **Expo price list** | Builds a copy-ready price list from animals marked *for sale* (code, Latin name, morph, sex notation 1.0 / 0.1 / 0.0.1, age, price). One tap to copy. |
| **Label printer** | Select animals and print 70 × 36 mm enclosure labels with code, Latin name, morph, sex and hatch date. The print sheet opens in a new window. |
| **Quick links** | Personal shortcuts built from your data: favourite animals, active clutches, the main supplier, finance, Habitat Studio and genetics. |

## Interaction costs (measured, desktop)

| Action | Interactions |
|---|---|
| Open the Multitool from anywhere | 1 (`T` or the wrench) |
| Low stock → shopping list | 1 |
| Feed demand → order onto list | 1 |
| Add a tool to the dashboard | 2 (Tools page → Add to dashboard) |
| Add a second shopping list | 2 (drawer → New list) |

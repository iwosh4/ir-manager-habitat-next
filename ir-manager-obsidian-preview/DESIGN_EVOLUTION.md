# DESIGN EVOLUTION — IR Manager Obsidian / Orange

This is an **evolution** of the real current IR Manager (`/app-manager/`, lock064 obsidian/orange), not a new brand.
Every foundation (colours, icons, KPI photography, the caiman, the sidebar/header structure) is taken from the current
source and refined. Concept B was used only as a *function/workflow library* (timeline engine, grouped work, quick record,
widgets, tools); none of its visual design, density or navigation look was reused.

## 1. What was kept from the current app

| Current (`/app-manager/`) | Kept as |
|---|---|
| Obsidian background `#070a0c` / `#05080a`, panels `#0d1317` | Surface ladder `--ob-0…2`, `--sf-1…4` (one step darker at the page, one step lighter per elevation) |
| Accent `#f28b28` / `#ff9d3f` / `#ffb54f` (IR_ACCENT, lock064) | Amber scale `--am`, `--am-2`, `--am-3` + transparent tints for lines, edges, backgrounds |
| Segoe UI Variable | Same stack; Inter (bundled, OFL) is only the fallback on non-Windows systems |
| Glossy IR icons (`assets/icons/custom/*.webp`) | 53 icons **cleaned** (sheet crop leftovers, amber corner glows removed, re-centred) → `assets/ir/icons/` |
| Line glyph sprite (`assets/icons/sprite.svg`, 65 glyphs) | Kept 1:1 and **extended** in the same 1.8 px stroke style (`sprite-ext.svg`: undo, pause, skip, cart, sync, cloud…) |
| KPI photo cards (animals, sex, habitat, clutch, health, finance) | Same six images, same order; new gradient + typography, value animates only on change |
| `caiman-hero.webp` behind the header & dashboard hero | Header: a dedicated eye crop as the **brand signature** at the far right. Dashboard: kept as the hero, masked into graphite |
| Sidebar collapsed 76 / open 248 | 256 / 76, with sub-sections inline and a gliding amber indicator |
| Header with Přidat záznam / QR / Hlas / search / bell / profile | Same functions, reordered per brief and given state feedback |

## 2. Design system

**Surfaces.** Page `#05080a` → sidebar `#080c0f` → panel `#0b1115` → raised `#0f171c` → control `#141e24`. Hairlines `#1e2a32`,
control borders `#2a3a44`. Depth comes from 1 px inner highlights and soft black shadows, never from glow.

**Amber is a signal, not a paint.** Orange is reserved for: the primary action (Rychlý záznam, the one primary button per view),
the active navigation edge, TEĎ (NOW), overdue state and the live tag. Completion uses **green** (`.btn.done`),
secondary actions are graphite, tertiary are text-only. Activity families (feeding, water, misting…) use muted colours so
orange keeps priority.

**Button hierarchy.** PRIMARY (orange gradient, dark ink) · SECONDARY (graphite) · TERTIARY (text) · DANGER (red tint) ·
DONE (green, used for HOTOVO / NAKRMENO / KONTROLA) · ICON (38 / 30 px square).

**Typography roles.** `.t-page` 28/750 · `.t-module` 18/700 · `.t-block` 15/700 · `.kicker` 10.5/800 tracked caps ·
`.value` tabular display numbers · `.meta` 11 px · `.code` JetBrains Mono in amber (animal codes like `PR-02`) ·
`.latin` italic-capable species name, always visually primary over the Czech name.

**Icon family.** Two tiers from IR's own library, documented as one system: glossy illustration icons for *things*
(modules, activity types, KPI, quick actions — rendered on an obsidian tile) and line glyphs for *actions* inside controls
(check, later, more, chevrons). Glossy icons were avoided where the source crops were unusable (microscope, treatment,
vet-record, veterinary, medicine).

**Radii & spacing.** 7 / 10 / 14 / 18 px; gutter 22 px desktop, 16 px mobile; 12-column widget grid with 16 px gaps.

**Motion.** FAST 130 ms (hover, press) · NORMAL 190 ms (menus, tabs, panels) · STATE 300 ms (completion, KPI change, toast).
See `DYNAMIC_UI_SYSTEM.md`.

## 3. Information hierarchy (three levels)

* **PRIMARY** — what needs doing now: *Dnes & následující*, *Vyžaduje pozornost*, overdue, Quick Care. Amber top hairline,
  slightly lighter panel, larger title.
* **SECONDARY** — the collection: incubation, reproduction cycles, collection by species, favourites, Habitat Studio.
* **DETAIL** — context: recent activity, statistics, notes, tools. Flat panel, muted title.

The same three levels are used for blocks (`.blk.lvl-*`) and widgets (`.w.lvl-*`), so a page reads top-down the same way everywhere.

## 4. Screens

| Area | Evolution |
|---|---|
| Header | Order: Rychlý záznam · QR · Hlas · Hledat (Ctrl K) · Oznámení · Profil · kajman. No recent records / tasks in the header. |
| Live strip | 36 px operational line under the header; one message at a time, slow step, priority first. |
| Sidebar | Přehled, Zvířata, Úkoly & péče, Zdraví, Ubikace, Reprodukce, Sklad, Finance, Adresář; 28 px glossy icons; no scroll at 900 px height; Nástroje + Habitat Studio card in the footer. No QR, no duplicated profile. |
| Přehled | Hero (greeting, today's progress) → 6 photo KPI → calm workspace (Dnes & následující, Vyžaduje pozornost, Inkubace, Reprodukce, Sbírka, Aktivity, Statistiky, Poznámky, Habitat Studio, Rychlé odkazy). |
| Planner | PO TERMÍNU / TEĎ / DNES / ZÍTRA / NÁSLEDUJÍCÍ; grouped cards; optional ROZŠÍŘENÝ HARMONOGRAM with biological phases as honest ranges. |
| Zvířata | Grid (photo cards, hover OTEVŘÍT / RYCHLÝ ZÁZNAM) and sortable Table. |
| Karta zvířete | Photo + Latin name + 5 facts → action strip (NAKRMIT, VODA/ROSENÍ, VÁHA, ZDRAVÍ, REPRODUKCE, VÍCE) → sections PŘEHLED / PÉČE / CHOV & REPRODUKCE / ZDRAVÍ / HISTORIE / DETAILY; VITAMINOVÁ ROTACE block. |
| Reprodukce | Each cycle: AKTUÁLNÍ FÁZE / DALŠÍ AKCE / OČEKÁVANÉ OKNO + phase bar; incubation cards with day counter and range bar. |
| Zdraví | Fast record (animal · observation · save) on top; diagnosis/vet/follow-up/attachment behind *Více možností*. |
| Sklad | KPI (Hodnota zásob, Nízký stav, Krmivo, Technika) → main ZÁSOBY + side NÁKUPNÍ SEZNAM → POSLEDNÍ POHYBY. |
| Finance | PŘÍJMY, VÝDAJE, VÝSLEDEK, NÁKLADY CHOVU → 12 months, categories, records. |
| Nástroje | 14 tools grouped Výpočty / Ubikace & provoz / Obchod / Osobní. |
| Habitat Studio | Premium entry only (render + OTEVŘÍT STUDIO); the studio itself is untouched. |

## 5. Mobile

Bottom navigation DOMŮ / ZVÍŘATA / **+** / ÚKOLY / VÍCE (76 px + safe area), raised orange “+”, all dialogs become bottom
sheets with a grab handle (swipe down to close), Více is an accordion sheet (no page reload), the planner becomes a vertical
stream with a sticky DNES · FILTR · + · TEĎ bar, action targets are ≥ 40 px, inputs use 16 px to avoid iOS zoom.

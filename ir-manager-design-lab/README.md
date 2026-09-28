# IR Manager Enterprise — Concept B (design lab)

This is a complete, runnable alternative frontend, isolated from production. It is static files only: no build, no server code, no database. Demo data lives in the browser (`localStorage`).

## Run

```
cd ir-manager-design-lab && python3 -m http.server 8095
# open http://localhost:8095/
```

The app works on any static host. `.htaccess` is included for Apache: MIME types, security headers and a CSP, and it blocks `tests/` and `tools/`.

## Explore (15–30 minutes)

1. **Dashboard:** the brief shows what's open and overdue, with one-tap quick chips and the next item. Below it is *My workspace*; press **Edit workspace** to add, move, resize and recolour widgets or apply a preset.
2. Press **Q** (or **+** on mobile) for **Quick Record**: pick an action → an animal → one button.
3. **Planner:** Today / 3 days / Week / Month. Try **FED** on a grouped "Feeding ×N" card, **Later**, and **Why is this here?**. The lanes icon opens the 90-day biological timeline.
4. **Tasks → Quick Care:** bulk care in 2–4 taps.
5. **Animals → PR-02 Tessa:** the profile, the Feed button, and the rotation on the Care tab.
6. **Reproduction:** open clutch CL-2026-04 (day N of 52–60, a range rather than a date) and try **Hatch…**.
7. Press **T** for the Multitool. Try Feed demand → *Add order to shopping list*.
8. Settings → Activities lets you reorder the Quick Record tiles.

Shortcuts:
- `Q` record, `/` search, `N` new, `T` tools
- `G` then D/P/T/A/R/H/E/I/F to navigate
- Ctrl+Z undo, `?` help

## Documents

| File | Content |
|---|---|
| DESIGN_CONCEPT_B.md | Principles, information architecture, timeline system, flows, visual system |
| WORKFLOW_EFFICIENCY.md | Interaction budget against measured interactions per task |
| WIDGET_SYSTEM.md | Workspaces, 46 widget types, edit mode, persistence |
| MULTITOOL_CATALOG.md | 15 tools and where they appear |
| ASSET_MANIFEST.md | Every image, icon and font, with its origin and licence |
| CONCEPT_B_COMPARISON.md | Factual comparison sheet (the current app's source was not available) |
| TEST_REPORT.md | Automated tests, responsive checks, screenshots |

## Tests

```
node tests/workflow.test.cjs  http://localhost:8095/index.html   # real-work & workspace tests
node tests/screenshots.cjs    http://localhost:8095/index.html   # screenshots of the running app
```

Both need Playwright with Chromium.

## Isolation

Concept B does not read or write `/app-manager/`, the production database, uploads or migrations, and it does not change production CSS/PHP/JS or Habitat Studio. Habitat Studio is only *linked* (`../index.html`).

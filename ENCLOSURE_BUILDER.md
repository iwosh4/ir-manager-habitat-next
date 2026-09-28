# Enclosure Designer — MY ENCLOSURES

The breeder designs their **real** enclosures (exact size, construction, doors, ventilation, interior,
technology) and saves them to **MY ENCLOSURES**. Catalogue models are only starting templates.

Open: library → **MY ENCLOSURES → + Create**, a card's edit button, **Customize…** on a starting template,
**Open enclosure** from the Assembly Builder / an entered assembly / a placed enclosure.

```
┌ ENCLOSURE DESIGNER · name ─────────────────────────── undo redo · Cancel · Save to My Enclosures ┐
│ LEFT: options            │ CENTER: live 3D preview (Planner look)       │ RIGHT: properties      │
│  Construction            │  orbit · zoom · views Front 3/4 Top Side    │  name, code prefix     │
│  Front / doors           │  drag interior items & devices directly     │  W / H / D (cm)        │
│  Ventilation             │                                             │  selected item/device  │
│  Interior                │                                             │  physical enclosures   │
│  Technology              │                                             │  notes                 │
└──────────────────────────┴─────────────────────────────────────────────┴────────────────────────┘
```

## What can be configured

| Group | Options |
|---|---|
| Dimensions | **W × D × H** — width, depth, height in cm, in that order (fields labelled *Width W · Depth D · Height H*, live summary `W × D × H = 30 × 45 × 18 cm`), integrated base cabinet height |
| Construction | glass terrarium · PVC · wood/board · rack box/tub · mesh · mixed/custom; frame style (profile / box), frame colour, profile thickness (mm), left / right / rear panel (glass · PVC · wood · mesh · open), top (mesh · glass · solid · open) |
| Front | sliding glass doors · fixed glass · single hinged · double hinged · mesh door · tub/drawer · open; lock/latch |
| Ventilation | top · front top strip · front bottom strip · left · right · rear, each with coverage of the available length |
| Interior | presets (empty, arid, tropical, paludarium) or custom (background, substrate type/depth, water section); addable components: cork, branch, rock, hide, water bowl, bromeliad, fern, grass, succulent, moss — positioned by dragging in 3D or with sliders |
| Technology | LED strip, UVB fixture, basking lamp, heat panel, heat cable, misting nozzle, fan, temperature sensor, humidity sensor, thermostat probe, cable/service entry — each with a stable slot id |

## Parametric, never scaled

`src/enclosures/EnclosureGeometry.js` rebuilds the enclosure from its definition with the approved Planner
kit (`src/planner/components.js`). Changing 100 → 150 cm width:

* frame profiles are extruded to the new lengths (section stays `profile` mm), glass panes and panels re-cut;
* vent strips keep their **slot pitch** (9 slots / m) → more slots, not wider ones;
* substrate height-field, cross-section, backgrounds and planting are regenerated for the new interior;
* handles, locks, hinges, labels, sensors, LEDs keep their physical size.

An e2e test builds the same design at 1.0 m and 1.5 m and checks the geometry width follows while more
geometry is generated and no mesh is scaled.

## Templates vs physical enclosures

A template (**construction**) can be built many times. Every placement — into an assembly or directly into
the room — creates a new **EnclosureInstance** with its own id, code (`<prefix>-NN`, e.g. `T60-04`),
animal, notes and **device ids** (`<instanceId>:<slot>`). Card actions:

* **click / drag** into the room → a new physical enclosure is placed;
* **＋** → create physical copy (place a new instance);
* edit · duplicate design · delete (refused while physical enclosures still use it).

Occupied / lighting / animal / code live on the **instance** (Inspector of a placed enclosure or of an
assembly member). Empty enclosures render quiet and dim; lights off removes the painted lamp pool.

## Files

| File | Role |
|---|---|
| `src/model/Library.js` | vocabularies, `defaultTemplate`, `normalizeTemplate`, `createInstance`, `templateFromCatalogue` |
| `src/enclosures/EnclosureGeometry.js` | template → painted geometry (shell, fronts, vents, interior, technology), modules |
| `src/enclosures/EnclosureDesigner.js` | the designer UI (draft + own undo history, direct manipulation) |
| `src/preview/PreviewStage.js` | small shared Planner stage (designer preview, builder preview, thumbnails, front images) |
| `src/preview/parts.js`, `src/ui/LibraryImages.js` | cached preview parts, library imagery |

## Known limitations

* Interior editing is intentionally practical (presets + placeable components), not a landscape sculptor.
* Custom interiors show one generic animal when occupied and no components are placed.
* Rack boxes (tubs) render their interior as a dim silhouette through the translucent tub.
* Technology devices are visual + data slots only — no Home Assistant binding yet (by design).

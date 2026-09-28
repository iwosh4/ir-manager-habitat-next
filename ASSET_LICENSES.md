# Asset licences

Every asset shipped in this project is either **original work created for IR Manager Habitat Studio**
or third-party material under a licence that permits commercial use. No asset is hot-linked: everything
is stored locally under `assets/` and `vendor/`.

## Summary

| Asset | Location | Source | Author | Licence | Original URL |
|---|---|---|---|---|---|
| All 3D models (26 GLB files, see list below) | `assets/models/*.glb` | Authored procedurally for this project by `tools/asset-pipeline/build-models.mjs` | IR Manager Habitat Studio project | Original work — owned by the project, free for commercial use (no third-party content) | — (generated locally; reproducible with `npm run build:models`) |
| All PBR texture sets (albedo / normal / ORM / alpha) | `assets/textures/**` | Authored procedurally for this project by `tools/asset-pipeline/build-textures.mjs` | IR Manager Habitat Studio project | Original work — owned by the project, free for commercial use | — (generated locally; reproducible with `npm run build:textures`) |
| Planner hand-painted atlas (73 tiles: surfaces, foliage, faces, cross-sections) | `assets/planner/atlas.webp`, `atlas.json` | Painted procedurally for this project by `tools/asset-pipeline/build-planner-atlas.mjs` (brush strokes, dabs, mottling — no photographs or third-party images) | IR Manager Habitat Studio project | Original work — owned by the project, free for commercial use | — (generated locally) |
| Planner 3D assets (all 26 catalogue types, room shell) | generated at runtime by `src/planner/*.js` | Parametric components written for this project | IR Manager Habitat Studio project | Original work | — |
| HDRI "Spruit Sunrise" (1k, Radiance .hdr) | `assets/environment/spruit_sunrise_1k.hdr` | Poly Haven (file obtained from the three.js repository, which redistributes this Poly Haven HDRI) | Greg Zaal / Poly Haven | **CC0 1.0** (public domain dedication) | https://polyhaven.com/a/spruit_sunrise — copy used: https://github.com/mrdoob/three.js/blob/dev/examples/textures/equirectangular/spruit_sunrise_1k.hdr |
| three.js r186 (runtime library, loaders, post-processing) | `vendor/three/` (licence in `vendor/three/LICENSE`) | https://threejs.org | three.js authors | **MIT** | https://github.com/mrdoob/three.js |
| UI icons | `src/ui/icons.js` | Drawn for this project (inline SVG) | IR Manager Habitat Studio project | Original work | — |
| Fonts | — | System font stack only (no font files shipped) | — | — | — |

Development-only tools (not shipped to the browser): `@napi-rs/canvas` (MIT) is used by the texture
generator; Playwright (Apache-2.0) is used by the optional end-to-end tests.

## Original 3D models

All models are built from parametric geometry (extrusions of real profiles, lathed parts, tapered tubes,
displaced surfaces, bent leaf cards) and exported as binary glTF 2.0 with named material slots.

| Model | Contents |
|---|---|
| `terrarium_arid.glb` | 100×50×50 framed glass terrarium: L-profile corners, separate panes, 2 sliding doors in a double aluminium track, finger pulls, lock, perforated front vent, insect-mesh top, LED bar, T5 UVB fixture, basking dome; sculpted rock background, sand substrate, sandstone basking stack, branch, cork tube hide, water bowl, succulents, sansevieria, grass tufts |
| `terrarium_tropical.glb` | 60×45×90 front-opening terrarium with hinged doors & central latch, cork background, visible drainage layer (clay pebbles), substrate barrier, bioactive soil, moss mounds, branches, bromeliads, fern, pothos vines, ground cover, mist nozzle |
| `paludarium.glb` | 120×50×60 rimless paludarium on a cabinet: water section, wet gravel, rock retaining wall, land section, waterfall, driftwood, aquatic & terrestrial plants, pump/heater, suspended LED fixture |
| `rack_glass.glb` | Powder-coated steel rack with six 55×45×45 glass terrariums (arid / tropical / prepared), per-level LED lighting, thermostat controller and cabling |
| `rack_tubs.glb` | Breeding rack with 14 translucent tubs, heat-tape shelves, labels, thermostat |
| `quarantine.glb` | White PVC quarantine enclosure with sliding glass, round vents, clinical interior, on a stainless trolley |
| `incubator.glb` | Cabinet incubator with glass door, gasket, wire shelves, egg boxes in vermiculite, control panel |
| `stand_cabinet.glb` | Terrarium stand cabinet |
| `workbench.glb` | Steel-frame workbench with oak top, drawer pedestal, pegboard with tools, task light, scale, tablet |
| `sink_unit.glb` | Stainless sink unit with basin cut-out, gooseneck tap, tiled splashback, dispensers |
| `shelving.glb` | Five-level steel shelving with substrate sacks, bins, boxes, deli cups, paper rolls |
| `storage_cabinet.glb` | Two-door steel storage cabinet |
| `door.glb` | Steel door set: frame, architraves, leaf with vision panel, lever handles, kick plate, closer, hinges |
| `window_unit.glb` | Aluminium window with frosted and clear glazing, reveals, sills, venetian blinds |
| `ceiling_panel.glb` | 120×60 LED ceiling panel (instanced by the room shell) |
| `control_panel.glb`, `ac_unit.glb`, `dehumidifier.glb`, `sensor.glb`, `outlet.glb` | Technical / electrical equipment |
| `plant_large.glb`, `plant_snake.glb`, `plant_fern.glb` | Room plants in planters |
| `animal_python.glb`, `animal_gecko.glb`, `animal_frog.glb` | Animals attached to occupied enclosures |

## Adding third-party assets later

Prefer CC0 sources (Poly Haven, ambientCG, Kenney). For every new file add a row to the summary table with
asset name, source, author, licence and original URL, store the file locally under `assets/`, and never
reference remote URLs at runtime.

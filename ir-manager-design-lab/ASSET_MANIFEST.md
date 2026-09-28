# Concept B — Asset manifest

Every visual in Concept B ships inside `ir-manager-design-lab/`. Nothing is hotlinked, and the app runs fully offline from static hosting. There are no stock photos and no placeholder boxes.

| Category | Count | Size | Origin | Licence |
|---|---:|---:|---|---|
| Species plates (`assets/img/species/<slug>-1…6.webp`) | 48 | ~0.9 MB | Procedural canvas painters (`tools/art/painters.js`), rendered by headless Chromium at build time | Original work for this project |
| Species macro crops (`<slug>-macro.webp`) | 8 | ~0.1 MB | Same painters at 1.6× zoom, used as KPI and profile backgrounds | Original |
| Clutch / incubation images (`assets/img/kpi/clutch-*.webp`) | 4 | ~0.18 MB | Painter `paintClutch` (python, gecko and chameleon eggs on vermiculite or sand) | Original |
| Feeders and supplements (`assets/img/feeders/*.webp`) | 7 | ~0.05 MB | Painters `paintDubia`, `paintCricket`, `paintJar` | Original |
| Enclosures and room (`assets/img/enclosures/*.webp`) | 10 | ~0.37 MB | Rendered from **Habitat Studio** (this repository) with its painted Planner renderer, then captured and converted to WebP | Project's own software output |
| Dashboard banner (`assets/img/art/banner.webp`) | 1 | 43 KB | Collage of the species painters | Original |
| Technical line illustrations (`js/ui/art.js`) | 9 | inline SVG | Hand-written SVG for health, finance, inventory, tasks, genetics, directory, repro, enclosure and empty states | Original |
| UI icons (`js/core/icons.js`) | ~195 | inline SVG | Subset of **Lucide** icon paths, inlined | ISC (lucide.dev) |
| Brand mark (`BRAND` in `js/ui/shell.js`) | 1 | inline SVG | Original hexagon mark | Original |
| Fonts (`assets/fonts/`) | 9 woff2 | ~0.3 MB | **Inter** (UI), **Fraunces** italic (Latin names), **JetBrains Mono** (codes, times) via @fontsource | SIL Open Font License 1.1 (licence files included) |

## Species covered, each with 6 plates and a macro crop

| Slug | Latin name (primary) | Painter / notes |
|---|---|---|
| dendrobates-tinctorius-azureus | *Dendrobates tinctorius* “azureus” | `paintFrog` — cobalt with a noise-driven black spot field and toe pads |
| dendrobates-leucomelas | *Dendrobates leucomelas* | `paintFrog` — yellow bands with irregular noise edges |
| correlophus-ciliatus | *Correlophus ciliatus* | `paintGecko` — crests, harlequin/dalmatian/flame morph variants |
| furcifer-pardalis | *Furcifer pardalis* | `paintChameleon` — Ambilobe and Nosy Be colourations, casque and curled tail |
| morelia-spilota | *Morelia spilota* | `paintSnake('spilota')` — coastal / jungle pattern |
| python-regius | *Python regius* | `paintSnake('regius')` — normal, pastel, clown and piebald variants |
| atheris-squamigera | *Atheris squamigera* | `paintSnake('squamigera')` — keeled green scales, coiled |
| pantherophis-obsoletus-lindheimeri | *Pantherophis obsoletus lindheimeri* | `paintSnake('lindheimeri' / 'leucistic')` |

## Rebuilding the imagery

```
python3 -m http.server 8095              # from the repository root
node ir-manager-design-lab/tools/generate-assets.mjs            # everything
node ir-manager-design-lab/tools/generate-assets.mjs python     # one species (slug part)
node ir-manager-design-lab/tools/generate-assets.mjs misc       # clutches, feeders, jars
node ir-manager-design-lab/tools/generate-assets.mjs banner     # dashboard collage
```

`tools/art/preview.html` shows a contact sheet of all painters. `tools/art/one.html?p=…` renders a single painter.

## What is deliberately not used

- No remote images, CDNs or web fonts loaded at runtime.
- No AI-generated or stock photos of real animals, and no copyrighted photographs.
- The contacts, breeders, vets and suppliers in the demo data are fictional, and their e-mail domains end in `-demo.cz`.

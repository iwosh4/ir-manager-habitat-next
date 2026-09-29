# CURRENT vs EVOLUTION

**Source of “current”:** the real `/app-manager/` source (`IR_MANAGER_APP_MANAGER_VISUAL_SOURCE_SAFE.zip`), rendered
locally from a read-only scratch copy with its own templates, CSS (core + lock064), icons and images. Because production
data, credentials and uploads were removed, the current app was fed a small **synthetic** demo database (same species
and codes as the preview). Nothing in `/app-manager/` was modified or committed. Screenshots:
`screenshots/current/*.png` (current) vs `screenshots/desktop-*.png`, `mobile-*.png` (evolution).

## HEADER

| | Current (`shell.php`, lock064) | Evolution |
|---|---|---|
| Actions | Three **icon-only** squares (záznam, QR, mikrofon) — meaning must be guessed | **Rychlý záznam** as the labelled primary (orange, `Q`), then **QR** and **Hlas** labelled secondaries |
| Search | Wide field, `Ctrl + K` | Same, with amber focus ring; `/` also opens it; results grouped (Zvířata, Úkoly, Ubikace, Reprodukce, Dokumenty, Kontakty) |
| Date/time block | Large clock (`23:13`) takes header space | Removed from the header; time lives where it matters (TEĎ marker, live strip, relative times) |
| Bell | Static icon | Badge with count, one swing + ring pulse on *new* items, static amber ring while something is urgent; panel with categories and direct actions |
| Profile | Avatar icon + name + “Administrátor” | Initials avatar + name + role, **save/sync dot** on the avatar, menu with live strip / motion toggles |
| Caiman | Photo behind the whole header at ~34 % — reduces contrast of controls | Dedicated **eye crop** as the brand signature at the far right, fading into graphite; controls sit on clean graphite |
| Below header | nothing | **Live strip**: one calm operational message at a time (overdue first), pause, save state |

`screenshots/current/dashboard-1440.png` ↔ `screenshots/detail-hlavicka.png`, `detail-zivy-pas.png`.

## DASHBOARD

| | Current | Evolution |
|---|---|---|
| Top | Hero banner “Přehled” with caiman | Hero kept (caiman masked into graphite) but it now says something: greeting, open / done / overdue, next task, progress bar |
| KPI | 6 photo cards | Same 6 photos and order, stronger gradient, readable subtitles, value moves only when it changes, link on each |
| Content | Fixed list: Moje zvířata, Aktuální úkoly, Rychlé akce, Reprodukce – aktuální cykly, Burzy & akce, Poslední aktivity — all equal weight | Three levels: PRIMARY *Dnes & následující* (act from the card: HOTOVO / ODLOŽIT / DETAIL, grouped ×N) + *Vyžaduje pozornost*; SECONDARY incubation, cycles, collection; DETAIL activity (grouped, new highlighted), stats, notes, Habitat Studio, links |
| Customisation | none | **UPRAVIT PŘEHLED** → + PŘIDAT WIDGET (37 widgets in 7 Czech categories, search), size S–W, move, accent, frame, density, icon, title; personal multi-instance widgets |

`current/dashboard-1440.png` ↔ `desktop-01-prehled.png`, `desktop-18…22`.

## PLANNER

| | Current (`tasks.php`) | Evolution |
|---|---|---|
| Structure | Day strip (7 days), 6 counter tiles, “Dnešní práce” left, “Po termínu” right, quick-record chips, big form below | One **timeline**: PO TERMÍNU → **TEĎ** (live marker) → DNES → ZÍTRA → NÁSLEDUJÍCÍ, with times on an axis |
| Row actions | ✓ / +1 / ⊘ small icon buttons | Words: **HOTOVO** (green, type-specific: NAKRMENO, KONTROLA, PODÁNO…), **ODLOŽIT** (+1 h, později, zítra, +2 dny, vlastní), **VYNECHAT**, **DETAIL** (why it exists, edit this occurrence, links) |
| Repetitive work | “Krmení ×2” as a row | Groups **KRMENÍ ×3 · HOTOVO VŠE · ROZBALIT** with per-animal select, “odmítl”, complete selected |
| Feedback | reload | 280 ms completion motion + toast **Zapsáno · ZPĚT** (full undo, incl. rotation and stock) |
| Biology | separate reproduction pages | Optional **ROZŠÍŘENÝ HARMONOGRAM**: cycling, brumation, pairing, observed mating, ovulation, pre-lay shed, clutch, incubation, hatching — confirmed phases solid, expected **ranges** hatched |
| Mobile | same page squeezed | Vertical stream + sticky DNES · FILTR · + · TEĎ |

`current/planner-1440.png`, `current/tasks-today-1440.png` ↔ `desktop-02-planovac.png`, `desktop-03…`, `desktop-04-ukoly-dnes.png`, `mobile-05-planovac.png`.

## ANIMAL PROFILE

| | Current | Evolution |
|---|---|---|
| Header | Photo, facts, 10 tabs (Přehled, Popis, Chov & parametry, Reprodukce, Zdraví, Galerie, Rodokmen, Původ & dokumenty, Automatizace…) | Photo + **Latin name as the title** + code/name/Czech name/morph + 5 facts (pohlaví, věk, hmotnost, ubikace, krmení) |
| Actions | via Quick record / forms | **Action strip**: NAKRMIT (one click completes the scheduled feeding incl. supplement and stock), VODA/ROSENÍ, VÁHA, ZDRAVÍ, REPRODUKCE, VÍCE |
| Sections | 10 tabs | 6: PŘEHLED / PÉČE / CHOV & REPRODUKCE / ZDRAVÍ / HISTORIE / DETAILY |
| Supplements | not visible | **VITAMINOVÁ ROTACE**: sequence, POSLEDNĚ / DALŠÍ / potom, UPRAVIT |
| Reproduction | own tab | cycle card AKTUÁLNÍ FÁZE / DALŠÍ AKCE / OČEKÁVANÉ OKNO right in Přehled |

`current/profile-1440.png` ↔ `desktop-07-karta-zvirete.png`, `desktop-08-karta-chov-reprodukce.png`, `mobile-03*.png`.

## INVENTORY

| | Current (Sklad) | Evolution |
|---|---|---|
| KPI | Položky, Nízké zásoby, Expirace do 30 dní, Hodnota zásob (small icons, thin cards) | HODNOTA ZÁSOB, NÍZKÝ STAV (with “vše do nákupu”), KRMIVO (shortest supply in days from care plans), TECHNIKA |
| Main | Category tiles (Krmivo, Suplementy, Technika) + “Vyžaduje pozornost” list | **ZÁSOBY** list with stock bar vs. minimum, ± steppers, value, add-to-cart; low items first; category chips |
| Shopping | separate “Nákupní list” tab | **NÁKUPNÍ SEZNAM** beside the stock (qty, unit, price, supplier, note, check, reorder, clear completed, copy); multiple lists |
| History | — | **POSLEDNÍ POHYBY** incl. automatic deductions from feedings |

`current/inventory-1440.png` ↔ `desktop-13-sklad.png`, `desktop-17-…`, `mobile-10-sklad.png`, `mobile-11-nakupni-seznam.png`.

## What deliberately did NOT change

The obsidian/orange identity, the glossy icon family, the KPI photography, the caiman, the module list and order,
Czech labels, the sidebar-left / header-top layout, and Habitat Studio (entry only, untouched).

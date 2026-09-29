# IR Manager Enterprise — Obsidian / Orange Evolution (náhled)

Izolovaný, spustitelný a interaktivní náhled vývoje **současného** IR Manageru (`/app-manager/`).
Celé rozhraní je v češtině; latinské názvy druhů zůstávají vizuálně primární.

> Náhled **nemění** produkční `/app-manager/`, databázi, PHP, uploady, migrace, CSS ani Habitat Studio.
> Všechna data jsou fiktivní a žijí jen v prohlížeči (localStorage).

## Spuštění

Jde o statické soubory (ES moduly, bez build kroku). Potřebují jen HTTP server:

```bash
# z kořene repozitáře
python3 -m http.server 8095
# otevřít
http://localhost:8095/ir-manager-obsidian-preview/index.html
```

Tlačítko **OTEVŘÍT STUDIO** vede na `../index.html` (stávající Habitat Studio v tomto repozitáři);
cílová produkční adresa je `/app-manager/habitat-studio/`.

## Co vyzkoušet

| Kde | Co |
|---|---|
| Hlavička | Rychlý záznam (Q) · QR (stav skenování) · Hlas (poslech / zpracování) · Hledat (Ctrl K nebo /) · Oznámení · Profil · kajman |
| Živý pás | pomalé krokování, pauza myší / tlačítkem / na neaktivní kartě, priorita „po termínu“ |
| Úkoly & péče → Plánovač | HOTOVO / ODLOŽIT / VYNECHAT / DETAIL · skupiny „KRMENÍ ×3 · HOTOVO VŠE · ROZBALIT“ · Zpět v toastu · ROZŠÍŘENÝ HARMONOGRAM |
| Přehled → UPRAVIT PŘEHLED | + PŘIDAT WIDGET, knihovna podle kategorií, přesun (tažení / ← →), velikost S–W, akcent, rám, hustota, ikona |
| Zvířata | Mřížka / Tabulka, hover OTEVŘÍT / RYCHLÝ ZÁZNAM, karta se sekcemi a pásem akcí (NAKRMIT jedním klepnutím) |
| Nástroje | 14 nástrojů; nákupní seznamy, poznámky a checklisty ve více instancích |
| Mobil (≤ 820 px) | spodní navigace DOMŮ / ZVÍŘATA / + / ÚKOLY / VÍCE, list Více (akordeon), sticky DNES · FILTR · + · TEĎ |

Klávesy: `Q` záznam · `/` nebo `Ctrl K` hledat · `N` nový v kontextu · `T` nástroje · `G` + písmeno navigace · `Ctrl Z` zpět · `?` nápověda.

## Struktura

```
index.html
css/   tokens · base · shell · components · planner · widgets · modules · mobile
js/    main.js (router) · nav.js
       core/    dom, store (undo, persist), time (čeština), icons, overlay
       data/    species, fixtures (koherentní ukázková sbírka)
       engine/  ops, timeline, actions, notify  — jediné místo, které mění data
       ui/      shell, live, global (QR, hlas, hledání, oznámení, Více), quickrecord, timeline, components, feedback
       widgets/ registry, workspace, tools, wsstore
       views/   prehled, ukoly, zvirata, zdravi, ubikace, reprodukce, sklad, finance, adresar, nastroje, nastaveni
assets/ ir/ (ikony, sprite, KPI fotky, kajman z /app-manager/) · img/ · fonts/
screenshots/  desktop-*, mobile-*, detail-*, current/ (současná aplikace)
tests/  interact.cjs (49 interakcí) · routes.cjs (chyby + přetečení) · shots.cjs (screenshoty)
```

Dokumentace: `DESIGN_EVOLUTION.md`, `CURRENT_VS_EVOLUTION.md`, `DYNAMIC_UI_SYSTEM.md`, `UX_DECISIONS.md`, `PREVIEW_TEST_REPORT.md`.

# PREVIEW TEST REPORT

**Environment:** Chromium (Playwright 1.56, headless, `--disable-gpu`), static server `python3 -m http.server`,
timezone Europe/Prague, clock fixed to **Tue 29 Sep 2026 10:40** so that the demo shows a realistic working day
(the preview itself always uses the real clock). Fresh browser profile per run (clean localStorage).

Scripts are in `tests/` (`PLAYWRIGHT_PATH` can point to a global Playwright install):

| Script | What it does |
|---|---|
| `tests/routes.cjs <w> <h> <outdir> <routes…>` | Visits each route, collects page errors / console errors / HTTP ≥ 400, detects horizontal overflow, screenshots |
| `tests/interact.cjs` | 49 real interactions with assertions (desktop 1440×900 + mobile 390×844) |
| `tests/shots.cjs <outdir>` | Produces the delivered screenshots |

## 1. Route sweep — errors and overflow

42 routes (every module, every sub-tab, animal/cycle/clutch/enclosure/contact detail, tools, settings) at
**1440×900, 1024×768, 430×932, 390×844, 360×780**:

| Width | JS errors | Console errors | HTTP errors | Horizontal overflow |
|---|---|---|---|---|
| 1440 | 0 | 0 | 0 | 0 |
| 1024 | 0 | 0 | 0 | 0 |
| 430 | 0 | 0 | 0 | 0 |
| 390 | 0 | 0 | 0 | 0 |
| 360 | 0 | 0 | 0 | 0 |

Issues found and fixed during testing: KPI image path resolution, grid items without `min-width: 0` (3 overflows),
spark charts stretching in list rows, workspace widgets too narrow inside side columns (now container queries),
timeline cards cramped in ~740 px blocks (container query stacks actions), mobile group card overlap, long stock
lists in timeline meta, a select in health chips at 390 px.

## 2. Interaction test — 49 / 49 PASS

| Area | Checks |
|---|---|
| Header | order Rychlý záznam → QR → Hlas → Hledat → Oznámení → Profil → kajman |
| Live strip | next message, pause state |
| Planner | completion motion class, toast “Zapsáno: …”, item leaves overdue, **Zpět** restores, ODLOŽIT menu (5 presets + vlastní) and toast, VYNECHAT toast, DETAIL panel, group ROZBALIT, **HOTOVO VŠE** (“Zapsáno: 3× krmení”), ROZŠÍŘENÝ HARMONOGRAM (6 cycles) |
| Quick Record | opens with 10 actions, target step (11 due candidates), detail step, save → “Zapsáno: krmení” |
| Search | Ctrl K, grouped results (Zvířata, Reprodukce), Enter navigates to the animal |
| Profile | NAKRMIT (completes scheduled feeding, or opens pre-filled Quick Record when nothing is due) |
| Notifications | categories PO TERMÍNU · ZDRAVÍ · INKUBACE · REPRODUKCE · SKLAD · UBIKACE, direct NAKRMIT/HOTOVO action |
| QR / Voice | scanning state on/off, listening state (panel + header), processing state, command parsed (“Krmení · PR-02”) |
| Widgets | edit mode, library with PŘEHLED/PÉČE/REPRODUKCE/ZDRAVÍ/SKLAD/FINANCE/NÁSTROJE, search, add, resize (L), move (←), accent blue + frame strip, layout persists after reload |
| Personal tools | shopping list add (“Cvrčci 300 ks 1,1” parsed), check item, notes autosave to storage, calculator 12×3 = 36 |
| Mobile | bottom nav 76 px, labels Domů/Zvířata/Úkoly/Více, “+” opens Quick Record sheet, Více sheet, accordion opens without navigation, sub-link navigates, planner sticky bar (4 buttons) |
| Errors | 0 page errors desktop, 0 mobile |

Bugs found by this test and fixed: links inside sheets/panels marked `data-close` did not navigate (overlay called
`preventDefault`); voice panel had no listening class; inconsistent toast wording (“Krmení zapsáno” → “Zapsáno: krmení”).

## 3. Performance (1440×900, planner)

* Route switch Přehled → Plánovač (render + 2 frames): **≈ 75 ms**; DOM ≈ 3 750 nodes on the planner.
* Idle running animations: `livePulse` (live dot), `nowBreath` (TEĎ dot), `winGlow` (only because a hatch window is open) —
  all opacity/transform/box-shadow on tiny elements. No other loops.
* Assets: JS 512 KB unminified source (lazy-loaded per module), CSS 160 KB, images/icons/fonts 2.8 MB (WebP + WOFF2).

## 4. Reduced motion

Verified manually in code and via the in-app switch (`html[data-motion=off]`): transitions/animations disabled, live strip
does not auto-step, completion skips its 280 ms delay, smooth scroll becomes instant. `prefers-reduced-motion` has the same effect.

## 5. Screenshots (from the running preview)

Desktop 1440×900: `desktop-01…32` (Přehled, Plánovač, rozšířený harmonogram, Úkoly dnes, Zvířata mřížka + hover,
tabulka, karta, karta chov, Reprodukce, Inkubace, Zdraví, Ubikace, Sklad, Finance, Adresář, Nástroje, nákupní seznam,
UPRAVIT PŘEHLED, knihovna widgetů, knihovna Nástroje, vzhled widgetu, osobní widgety, Rychlý záznam ×3, globální hledání,
oznámení, QR, hlas, profil, dokončení (mid-motion), toast Zapsáno·Zpět).
Details @2×: `detail-hlavicka`, `detail-zivy-pas`, `detail-zivy-pas-2`, `detail-sidebar`.
Mobile 390×844 @2×: `mobile-01…13` (Přehled, Zvířata, Karta, Karta akce, Úkoly, Plánovač, Rychlý záznam ×2, Více,
Reprodukce, Inkubace, Sklad, Nákupní seznam, Nástroje, Oznámení).
Current app: `screenshots/current/`.

## 6. Known limitations (preview scope)

* Data lives in localStorage only; there is no backend, sync or multi-user conflict handling.
* Speech recognition depends on the browser (Chrome/Edge); elsewhere the typed fallback is used.
* The QR scanner is simulated (code entry + demo codes); no camera access.
* “Odhlásit”, label printing and file attachments are demonstrative.
* Habitat Studio is linked, not embedded.

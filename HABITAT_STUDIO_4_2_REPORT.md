# Habitat Studio 4.2 — Room Evolution + Tech Plan + Extended Catalog

Výchozí stav: schválený MASTER Habitat Studio 4.1 (commit `15deb74`). Build 4.1 jsme rozšířili, nic jsme nepřepisovali od nuly.
Zůstaly Planner, Showcase, Enclosure Designer, Tetris Assembly Builder, hierarchie ROOM → ASSEMBLY → ENCLOSURE → ANIMAL
i konvence rozměrů **ŠÍŘKA × HLOUBKA × VÝŠKA (W × D × H)**. Staré místnosti (dokument v1 a v2) se načtou beze ztráty.
ID, rozměry ani sestavy se nemění.

Spuštění: `npx serve .` nebo `python3 -m http.server` v kořeni projektu, pak `index.html`
(`?mode=planner` · `?mode=showcase` · `?mode=techplan`).

---

## 1. Co bylo implementováno

| Oblast | Stav |
|---|---|
| **Volná kamera** | orbit, pan, zoom ke kurzoru a fokus dvojklikem. **Reset camera** (0), **Fit room** (9), **Fit selection** (F). Předvolby: přední (2), levý roh (7), pravý roh (8), horní (1), izometrie (5) a čelní pohled na vybranou sestavu (tlačítko v HUD). Klávesy WASD posouvají, Q/E otáčejí |
| **Bez stropu** | Planner ani Showcase nekreslí strop, stropní panely ani svítidla. Osvětlení scény zůstává: v Planneru malované světelné skvrny, v Showcase světla na původních pozicích panelů |
| **Stěny podle kamery** | AUTO (výchozí), ALL WALLS, CUTAWAY, WALL FOOTPRINT, HIDE WALLS. Přepíná se tlačítkem v HUD, klávesou V nebo v panelu místnosti. Přechody jsou animované |
| **Povrchy stěn** | Nastavují se pro každou stěnu zvlášť. Barvy: bílá, světle šedá, teplá šedá, tmavě šedá, antracit, béžová, vlastní barva; povrch hladký nebo jemná omítka. Obklady: černý laminát, dub, světlý dub, tmavé dřevo, ořech, dřevěné lamely (skutečný reliéf), dekorativní panel, černý technický panel. Obklad jde i jako sokl do zvolené výšky. Tlačítko „Accent wall“ a „Apply to all walls“ |
| **Podlahy a detaily** | Beton, šedá dlažba, tmavá dlažba, světlé dřevo, dub, vinyl, antracit, technická podlaha, s volitelným odstínem. Soklové lišty (žádné / černé / bílé / dřevo / ocel) a rohové lišty. Zárubně dveří a rámy oken jsou součástí modelů |
| **Okno a žaluzie (oprava chyby)** | Planner i Showcase kreslí **stejný** procedurální model okna. Nastavuje se šířka, výška, parapet, sklo (čiré / matné / tónované), rám (bílý / černý / antracit / dřevo / ocel) a žaluzie: None / Venetian / Roller, zapnuto, pozice, míra otevření, úhel lamel, vnitřní / vnější. **NONE nekreslí žaluzie nikde** |
| **Dveře** | Klasické interiérové, plné technické, ocelové s průhledem, černé, bílé, dřevěné, prosklené a posuvné (na kolejnici). Nastavení: pravé / levé, otevřené / zavřené, šířka, výška, barva nebo dekor, rám. Dveře sedí ve stěně a vyřezávají otvor |
| **Stoly** | Rovný, dlouhý, technický (se spodní policí), rohový L s editovatelnými rozměry obou ramen, psací stůl se skříňkou. Mění se W/D/H, dekor desky a rámu |
| **Úložné prvky** | Nástěnná police jednoduchá / dvojitá / vícepatrová, police nad stolem (s LED), závěsná skříňka, vysoká skříň, nízká komoda, technická skříň. Všechny mění velikost, police se montují na stěnu |
| **Rostliny** | Monstera, Pothos (převislá), Philodendron, Ficus, palma, kapradina, Sansevieria, stolní rostlinka. Velikost small / medium / large, květináč černý / antracit / bílý / terakota |
| **Technická zařízení** | 34 nových zařízení (plus 5 technických typů z 4.1) ve skupinách **WATER** (RO nádrž, sud, nádrž, čerpadlo, filtr, regulátor tlaku, průtokoměr), **MISTING** (mlžicí čerpadlo, filtr, regulátor, rozdělovač, solenoid, tryska), **DRAINAGE** (odtokový bod, trubka, přepad, sifon, podlahová vpust), **ELECTRICAL** (rozvaděč, zásuvka, prodlužovačka, řídicí jednotka, reléový modul, Raspberry Pi / obecný kontrolér, kabelový žlab), **SENSORS** (teplotní a vlhkostní čidlo, čidlo teploty a vlhkosti, čidlo hladiny, detektor úniku) a **BREEDING** (inkubátor bílý / **BLACK**, zimoviště **BLACK** a bílé, zimoviště ve stylu lednice, lednice / mraznička) |
| **TECH PLAN** | Třetí režim nad stejnými daty. Místnost se ztlumí a technika zvýrazní: zdroj → rozvod → zařízení → konkrétní terárium |
| **Vrstvy** | ROOM, ENCLOSURES, WATER, MISTING, DRAINAGE, ELECTRICAL, SENSORS |
| **Porty** | MIST_IN, WATER_IN, DRAIN_OUT, OVERFLOW_OUT, POWER, TEMP_SENSOR, HUM_SENSOR a porty zařízení. Stabilní `deviceId` a `portId`, připraveno pro Home Assistant (HA samotný implementován není) |
| **Okruhy** | Název, ID (C1…), zdroj, cíle, poznámka, zapnuto. „Generate routes“ vytvoří trasu do každého terária |
| **Režimy tras** | VISIBLE (trubka ve všech pohledech), IN WALL (vede ve zdi, zvýrazněná jen v Tech Planu), HIDDEN |
| **Odvodnění** | Větve z více terárií do jednoho odtokového bodu, vedené podél zdi nebo ve zdi. Šipky ukazují směr toku |
| **Editor tras** | + Route → typ a režim → zdrojový port (klik na svítící port nebo výběr v panelu) → cílový port → automatická trasa podél stěn. Body trasy jde táhnout, přidávat (dvojklik, tlačítko) i mazat (Del, ×). Přichytávají se ke stěně a vodorovně / svisle k sousedním bodům; Shift táhne svisle, Alt vypne přichytávání |
| **Referenční zvíře** | V Enclosure Designeru: had, ještěr, gekon, chameleon, želva, žába, pavouk / sklípkan, štír, hmyz. Jde zobrazit / skrýt a nastavit velikost (délka, rozpětí nohou, délka krunýře) s pravítkem. Ukládá se jen do nastavení designeru, **nikdy do šablony ani kolizí** |
| **Profil podkrovní stěny** | FULL HEIGHT, LOW SIDE, SLOPED TOP (např. 150 → 250 cm) pro každou stěnu. Mění jen obrys stěny v obou rendererech, strop se nevrací. Otvory se profilu přizpůsobí |
| **Katalog** | 90 položek ve 14 kategoriích. Vyhledávání v názvu, popisu, štítcích (včetně českých) a barvách („pump“, „black“, „zimoviště“), filtr kategorie, filtry Ports / Wall / Floor, náhledy všech položek, odznak s počtem portů |
| **Panel vlastností** | Pozice, rotace, W/D/H a navíc sada voleb pro daný typ (materiál, barva, varianta, montáž). Ukazuje se jen to, co k typu patří: rostlina nemá porty, čerpadlo ano a vlastní porty jde přidat. U okna s žaluziemi NONE chybí posuvník otevření |

## 2. Změněné a nové soubory

Nové:

| Soubor | Obsah |
|---|---|
| `src/model/Surfaces.js` | katalog povrchů stěn a podlah, lišty, profil stěny `wallTopAt` |
| `src/scene/WallGeometry.js` | společný obrys stěny pro oba renderery (profil, dveřní zářezy, okenní otvory) |
| `src/scene/WallVisibility.js` | stěny podle kamery (výšky ořezu, režimy, animace) |
| `src/planner/extendedModels.js` | procedurální modely rozšířeného katalogu |
| `src/tech/Network.js` | logika sítě: druhy tras, porty, normalizace, automatické trasování, přichytávání, okruhy |
| `src/tech/TechLayer.js` | vykreslení sítě: trubky, šipky toku, zvýraznění ve zdi, porty, body trasy, popisky |
| `src/tech/TechController.js` | režim TECH PLAN, vrstvy, operace s trasami a okruhy, editor v 3D, ukázková síť |
| `src/ui/TechPanel.js` | panel Tech Planu |
| `src/enclosures/AnimalReference.js` | referenční postavy zvířat |
| `HABITAT_STUDIO_4_2_REPORT.md` | tato zpráva |

Upravené:

* **Model**
  * `src/model/RoomDocument.js`: v3, migrace, `tech` u zařízení, `network`
  * `src/editor/Editor.js`: příkazy pro síť, merge povrchů, nové `deviceId` u duplikátu
  * `src/objects/catalog.js`: kategorie, 64 nových typů, volby, porty, `propsOf`, vyhledávání
* **Scéna a renderery**
  * `src/planner/PlannerShell.js`: bez stropu, povrchy, ořez, patky stěn
  * `src/scene/RoomShell.js`: Showcase bez stropu, povrchy, clipping planes
  * `src/planner/PaintedMaterials.js`: `uTech` a `uClipY`
  * `src/planner/stylizedModels.js`: klíč modelu obsahuje props, napojení nových modelů
  * `src/objects/ObjectLayer.js`: skrývání prvků na snížených stěnách, filtr vrstev
  * `src/modes/PlannerMode.js`, `src/modes/ShowcaseMode.js`: stěny podle kamery
* **App a ovládání**
  * `src/App.js`: režim techplan, stěny, kamera
  * `src/camera/CameraRig.js`: rohy, fit room, pan a orbit z klávesnice
  * `src/interaction/Keyboard.js`, `src/interaction/PointerController.js`: klávesy a editor tras
* **UI**
  * `src/ui/Inspector.js`: volby podle typu, porty, editor povrchů
  * `src/ui/LibraryPanel.js`, `src/ui/LibraryImages.js`: hledání, filtry, procedurální náhledy
  * `src/ui/Hud.js`, `src/ui/Toolbar.js`, `src/ui/icons.js`, `src/styles/app.css`
  * `src/enclosures/EnclosureDesigner.js`: referenční zvíře
* **Assety a nástroje**
  * `assets/planner/atlas.webp` a `.json`: +7 dlaždic (omítka, prkna, lamely, dlažba, dekor panel, listy monstery a palmy); indexy původních dlaždic se nezměnily
  * `assets/thumbnails/*.png`: 70 náhledů procedurálních typů
  * `tools/asset-pipeline/build-planner-atlas.mjs`, `tools/build-thumbnails.mjs`
  * `schema/habitat-room.schema.json`: v3
* **Testy a dokumentace**
  * `tests/run-e2e.mjs`: 20 nových testů
  * `README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`

## 3. Jak funguje systém stěn a kamery

* **Bez stropu.** Místnost je podlaha a čtyři stěny. Výška místnosti je výška plné stěny. Světelné pozice pro osvětlení zůstaly, ale nekreslí se žádná geometrie.
* **Výška ořezu stěny.** Každý snímek, kdy se kamera hýbe, spočítá `WallVisibility.update(room, camera, target)` pro každou stěnu výšku ořezu:
  * **AUTO**
    * kamera uvnitř ve výšce očí: všechny stěny plné
    * pohled shora (sklon přes 70°): plné
    * vzdálené a protější stěny: plné
    * boční stěny: plynule podle úhlu (koeficient natočení k normále stěny)
    * stěna mezi kamerou a místností: klesne na **patku stěny 18 cm** (tedy v rozmezí 10–30 cm), takže je vidět, kudy vede, ale nic nezakrývá
  * **ALL WALLS**: všechny plné
  * **CUTAWAY**: stěny, za kterými je kamera, zmizí
  * **WALL FOOTPRINT**: všechny jako 18cm patky (čtení půdorysu)
  * **HIDE WALLS**: jen čára na podlaze
* **Animace.** Výšky se exponenciálně přibližují k cíli (τ ≈ 70 ms, ustálí se za zhruba 220 ms). Smyčka vykresluje, dokud se stěny hýbou, pak se vrátí do idle.
* **Bez přestavby geometrie.**
  * Planner: každá stěna má vlastní sadu materiálů (`mats.clipped('wall-X')`) se sdíleným shaderem a uniformem `uClipY`, který zahazuje fragmenty nad ořezem.
  * Showcase: každá stěna má svou `THREE.Plane` v `material.clippingPlanes`.
  * V obou se na výšku ořezu posune „cap“: horní hrana zdi se světlou linkou.
  * Předměty na stěně (okna, police, rozvaděč) se skryjí, když je stěna snížená pod ně (`ObjectLayer.setWallClips`).
* **Profil stěny.** `wallTopAt()` vrací výšku horní hrany v každém bodě stěny (plná / nízká / šikmá). Obrys z `WallGeometry.wallShapeGeometry` je společný pro tělo stěny i obklad, takže otvory i šikmina sedí v obou rendererech.
* **Kamera.** OrbitControls s tlumením, zoom ke kurzoru, cíl omezený na místnost.
  * Nové pohledy `corner_left` / `corner_right` jsou šikmé pohledy z vnějšího rohu, v AUTO se tedy sníží obě blízké stěny.
  * `fitRoom()` vejde celou místnost do záběru z aktuálního směru.
  * `focusSelected()` zaostří výběr; `viewAssembly()` ukáže čelní pohled na vybranou sestavu.
  * Klávesy WASD / QE plynule animují.

## 4. Jak funguje TECH PLAN

* TECH PLAN je **Planner renderer plus technická vrstva** nad stejným dokumentem, kamerou i výběrem, ne třetí renderer. Přepnutí dokument nemění (ověřeno testem).
* Uniform `uTech = 1` převede malovanou místnost do tlumené šedé. Filtr objektů podle vrstev skryje, co je vypnuté (ROOM skryje i stěny a podlahu).
* **TechLayer** kreslí pro každou trasu:
  * trubku o poloměru podle druhu trasy (voda 12 mm, mlžení 6 mm, odpad 20 mm, elektro 6 mm, signál 4 mm)
  * **šipky toku** každých 35 cm ve směru `from → to`
  * klouby v lomech
* Trasy **IN WALL** se kreslí bez depth testu se světlým „halo“, takže prosvítají zdí. **HIDDEN** trasy jsou poloprůhledné, vypnuté šedé, vybraná trasa oranžová.
* Porty jsou instancované koule v barvě druhu. Při výběru zdroje nebo cíle se zvětší porty, které typem a směrem pasují. Popisky mají zařízení a terária, která jsou v nějaké trase.
* V běžném **PLANNERU / SHOWCASE** zůstanou jen trasy VISIBLE jako klidné neutrální trubky, bez šipek, portů a popisků. IN WALL ani HIDDEN tam nerozptylují.
* Panel Tech Planu obsahuje:
  * vrstvy
  * nová trasa: typ, režim, výběr portů
  * seznam tras s editorem: název, typ, režim, from / to, okruh, zapnuto, body X/Y/Z, auto route, poznámka, smazat
  * okruhy: ID, název, typ, zdroj, cíle jako checkboxy, poznámka, zapnuto, „Generate routes“
  * „Load example network“ postaví celý řetězec RO TANK → PUMP → FILTER → (ve zdi) → MANIFOLD → SOLENOID → okruh → terária a odvodnění z terárií ve zdi do odtokového bodu, včetně napájení z řídicí jednotky a čidla

## 5. Datový model zařízení, portů a tras

Podrobně v `DATA_MODEL.md` (sekce Version 3), schéma je v `schema/habitat-room.schema.json`.

* **Zařízení**
  * Každý technický objekt má `tech: { deviceId: "dev_<id>", ports: [uživatelské porty] }`.
  * Porty z katalogu definuje typ (`ports: { NAME: { kind, dir, at, label } }`).
  * `deviceId` se nikdy nemění; duplikát dostane nové.
* **Porty**
  * Adresují se `{ owner, port }`. `owner` je id objektu (zařízení, katalogové terárium), nebo **id instance**, jde-li o vlastní terárium či člen sestavy (fyzické terárium, nezávisle na umístění sestavy).
  * Globální `portId = deviceId:PORT`, což je klíč pro budoucí napojení IR Manageru nebo Home Assistantu.
* **Trasy**: `network.routes[] = { id, kind: water|mist|drain|power|signal, name, from, to, points[{x,y,z}], mode: visible|in_wall|hidden, circuitId, note, enabled }`.
  * Konce trasy vždy sledují porty; posun zařízení tedy trasu nerozpojí.
  * `points` jsou pouze body mezi porty.
* **Okruhy**: `network.circuits[] = { id, code: "C1", name, kind, source, destinations[ownerId], note, enabled }`.
* **Oddělení vrstev.** Síť je samostatná vrstva vedle ROOM → ASSEMBLY → ENCLOSURE → ANIMAL. Na zařízení a terária jen odkazuje přes id, nic do nich nevkládá.

## 6. Oprava okna a žaluzií

* **Příčina.** V 4.1 kreslil Showcase okno z GLB (`window_unit.glb`) s napevno zapečenými žaluziemi, kdežto Planner měl vlastní malovaný model. Žaluzie proto byly v Showcase vždy, bez ohledu na data.
* **Oprava.** Okna i dveře jsou teď `parametric`. Oba režimy kreslí stejný procedurální builder `extendedModels.window` přes `PlannerView`. Klíč geometrie obsahuje všechny props okna, takže každá změna (NONE ↔ Venetian ↔ Roller, míra otevření, úhel lamel, vnitřní / vnější, sklo, rám) přestaví model v obou režimech.
* **Pravidlo pro NONE.** Když `blinds === 'none'` nebo `blindsEnabled === false`, nevznikne ani jeden trojúhelník žaluzií.
* **Test.** Stejný klíč modelu v Planneru i Showcase a menší počet trojúhelníků u NONE. Přepnutí na NONE v Showcase odstraní žaluzie.
* **Staré soubory.** Okna ze 4.1 bez props dostanou výchozí hodnoty typu (matné sklo + venetian), takže vypadají jako dřív.

## 7. Nové položky katalogu

64 nových typů (celkem 90 viditelných položek), všechny procedurální:

* **Dveře**: interior, solid technical, black, wood, glazed, sliding. Původní `door` je nyní „Steel door“ s volbami.
* **Okna**: clear, s roletou, vysoké tónované. Původní `window` má volby.
* **Nábytek**: table, long table, technical table, corner table L, desk with cabinet.
* **Úložné prvky**: wall shelf, double wall shelf, multi-tier wall shelf, shelf above desk, hanging cabinet, tall cabinet, low cabinet, technical cabinet.
* **Dekorace**: wall picture, wall clock.
* **Rostliny**: monstera, pothos, philodendron, ficus, palm, Boston fern, sansevieria, table plant. Původní tři rostliny jsou procedurální s volbou květináče.
* **Chov**: incubator BLACK, wintering chamber BLACK, wintering chamber (bílé), wintering fridge, fridge / freezer. Původní inkubátor má volbu barvy.
* **Voda**: RO tank, storage barrel, water tank, water pump, filter, pressure regulator, flow meter.
* **Mlžení**: misting pump, misting filter, misting pressure regulator, manifold, solenoid valve, misting nozzle.
* **Odvodnění**: drain point, drain pipe, overflow, trap, floor drain.
* **Elektro**: power strip, controller, relay module, Raspberry Pi / generic controller, a navíc existující electrical panel, outlet a cable tray.
* **Čidla**: temperature probe, humidity probe, temp / humidity sensor, water level sensor, leak sensor, a navíc existující climate sensor.

## 8. Výsledky testů

Sada `tests/run-e2e.mjs` (Playwright, Chromium se softwarovým rendererem SwiftShader, bez GPU) má 49 testů
z verze 4.1 a 20 nových testů pro 4.2. Samotné nové testy spustíte `ONLY='^4\.2' node tests/run-e2e.mjs`.

**Výsledek finálního běhu: 69 / 69 testů prošlo** (49 regresních testů 4.1 + 20 nových testů 4.2), bez chyb v konzoli. Log: `tests/last-run-4_2.txt`, JSON: `tests/last-run.json`.

Nové testy 4.2:

* ✓ 4.2 new room + resize; no ceiling in Planner and Showcase (scene lighting stays)
* ✓ 4.2 free camera: fit room, fit selection, corner presets, assembly view, reset
* ✓ 4.2 camera-aware walls: AUTO lowers the near walls to a footprint; ALL / CUTAWAY / FOOTPRINT / HIDE
* ✓ 4.2 per-wall surfaces (paint, cladding, accent), floor and skirting via the Properties panel
* ✓ 4.2 doors: interior / sliding / glazed sit in the wall, hinge + open state
* ✓ 4.2 window + blinds NONE / Venetian / Roller: Planner and Showcase draw the SAME window
* ✓ 4.2 furniture: corner table arms, table resize, wall shelves, plants, incubator BLACK, wintering BLACK
* ✓ 4.2 catalog UX: 14 categories, search "pump" / "black" / "zimoviště", filters, thumbnails
* ✓ 4.2 technical device: stable deviceId, catalogue ports, create a user port in the Properties panel
* ✓ 4.2 TECH PLAN: MIST / WATER / DRAIN / IN-WALL routes to a specific enclosure; layers toggle
* ✓ 4.2 route editor: add route in the UI (type → source → destination), waypoints add / drag / snap / delete
* ✓ 4.2 misting circuit: SOLENOID → circuit → enclosures (name, ID, source, destinations, note, enabled)
* ✓ 4.2 clean normal views: Planner / Showcase show only VISIBLE routes (no in-wall, hidden, arrows or ports)
* ✓ 4.2 save / reload: routes, circuits, device ports, surfaces and new objects restored
* ✓ 4.2 export / import JSON keeps the network (version 3)
* ✓ 4.2 compatibility: a 4.1 (v2) room loads with safe defaults — ids, sizes and objects unchanged
* ✓ 4.2 modes & editors: Planner ↔ Showcase ↔ Tech Plan keep the document; Assembly Builder and Enclosure Designer open
* ✓ 4.2 Enclosure Designer: animal reference Snake / Lizard / Spider — adjustable, not saved, no collisions
* ✓ 4.2 undo / redo: surfaces, routes and procedural props
* ✓ 4.2 performance: Planner / Tech Plan / Showcase with the extended catalogue + network

Pokrytí zadání: nová místnost, změna rozměrů, volná kamera, AUTO cutaway, bez stropu, povrch jednotlivých stěn, podlaha · dveře, okno, žaluzie NONE / Venetian / Roller, shoda okna v Planneru a Showcase · rohový stůl, změna velikosti stolu, nástěnné police, několik rostlin, inkubátor BLACK, zimoviště BLACK · technické zařízení, vytvoření portu, trasy MIST / WATER / DRAIN / IN WALL, přepínání vrstev, trasa ke konkrétnímu teráriu, uložení / znovunačtení / všechny trasy zpět · Planner, Showcase, Tech Plan, Assembly Builder, Enclosure Designer · zvíře Snake, Lizard, Spider · undo / redo · regrese 4.1.

Úpravy testů 4.1 byly nutné kvůli záměrným změnám:

* **GLB loading.** Procedurální typy (dveře, okno, inkubátor, rostliny) nejsou GLB, takže se ve Showcase nepočítají mezi „unbound GLB meshes“. Test je přeskočí a hlídá GLB objekty dál.
* **JSON export.** Dokument má verzi 3, test nyní vyžaduje `version >= 2` a pole `network.routes`.

Kvůli testům 4.1 se nesnižovala žádná jiná kontrola.

Během regresního běhu se našly a opravily tři chyby:

1. **Dokončovací snímek ve Showcase.** Animace stěn spouštěla plnohodnotné snímky a na pomalém HW se Showcase neustálil. Nyní se stěny animují interaktivním profilem podle reálného času.
2. **Počet materiálů v Planneru.** Místo samostatné sady materiálů na každou stěnu je teď jedna sdílená sada, jejíž materiály se vytvářejí až při použití (výšky všech stěn ve `vec4`). Materiálů je tak méně než 10, jak vyžaduje test 4.1.
3. **Latentní chyba 4.1 v Assembly Builderu.** Snímek naplánovaný přes `requestAnimationFrame` se vykreslil po zavření dialogu. Nyní se po zavření zruší.

Screenshoty: `docs/screenshots/4.2/`
* 01–03: Planner, stěny podle kamery a režim footprint
* 04–05: Tech Plan a editor tras
* 06: Showcase
* 07–08: stejné okno ve Showcase a Planneru (bez žaluzií / venetian / roleta)
* 09: hledání v katalogu
* 10: referenční zvíře

## 9. Výkon Planner / Showcase / Tech Plan

Měřeno v e2e testu „performance“ na scéně 9 × 7 m s 59 objekty (všechny procedurální podlahové typy katalogu
plus ukázková síť: 16 tras, 2 okruhy). Používá se softwarový rasterizér SwiftShader na CPU, takže **FPS nejsou
reprezentativní** pro skutečnou GPU. Směrodatné jsou draw cally a trojúhelníky:

| Režim | Draw calls | Trojúhelníky | Poznámka |
|---|---|---|---|
| PLANNER | 27 | 45 288 | statický batching: všechny procedurální objekty se slijí do ≤ 5 materiálových bucketů; bez světel, stínů a postprocessingu; viditelné trasy 1 mesh na trasu |
| TECH PLAN | 45 | 74 572 | Planner + 1 mesh na trasu (trubka, šipky, klouby sloučené) + instancované porty (1 draw na druh) + body trasy |
| SHOWCASE | 136 | 184 188 | PBR, stíny, GTAO, bloom; procedurální typy sdílejí geometrii s Plannerem |

* **Sdílení.** Geometrie procedurálních modelů se cachuje podle klíče (typ, rozměr, props), takže identické objekty sdílejí jednu sadu. Materiály jsou sdílené (5 painted shaderů v Planneru, 1 materiál na druh trasy).
* **Lazy loading.** Showcase se stáhne až při prvním přepnutí (test 4.1 „Planner starts without loading the realistic pipeline“ prochází).
* **Náhledy katalogu** jsou předrenderované PNG. Chybějící náhled se dogeneruje živě stejným builderem.
* **Stěny podle kamery** mění jen uniform nebo clipping plane, geometrii nepřestavují; během orbitu se nic nepřepočítává.
* Atlas Planneru má 80 dlaždic v jedné textuře.

## 10. Co bylo vědomě odloženo

* **Home Assistant.** Datový model je připraven (stabilní `deviceId` / `portId`), integrace samotná se podle zadání neimplementuje.
* **Fyzikální kontrola tras.** Trasy se vedou automaticky podél stěn a přichytávají se ke stěnám a osám, ale nekontroluje se průchod skrz nábytek, spád odpadu ani dimenzování potrubí. Směr toku je dán pořadím from → to.
* **Stěny podle kamery ve Showcase pro procedurální objekty na stěně.** Když je stěna nižší než objekt, objekt se skryje celý (stejné pravidlo jako ve 4.1), neořezává se po částech.
* **Šikmý profil stěny** mění jen obrys stěn. Strop ani šikmá střecha se nekreslí (zadání: strop se nesmí vrátit). Otvory vyšší než šikmina se zkrátí.
* **Referenční zvíře** se ukládá jen do nastavení designeru v prohlížeči (`prefs.animalRef`), ne do šablony. Je to záměr, aby nikdy neovlivnilo data ani kolize.
* **LOD pro procedurální modely** zatím není. Nejdetailnější objekty (žaluzie, rostliny) mají stovky trojúhelníků a díky batchingu je Planner nepotřebuje. Pro velmi velké místnosti by šlo přidat zjednodušené varianty.
* **Náhledy v katalogu** jsou pro procedurální typy renderované stylizovaným rendererem, ne realistickým Showcase.

IR MANAGER ENTERPRISE — HABITAT STUDIO RENDERER V2 / VISUAL QUALITY PROOF
27. 9. 2026

ÚČEL
Tento balík je první skutečný runtime quality-gate nového rendereru. Není to obrázkový mockup.
V Habitat Studio > Místnosti přidává přepínač mezi současným Rendererem V1 a novým Rendererem V2 PROOF.

CO V2 MĚNÍ
- V1 zůstává dostupný jako okamžitý fallback.
- V2 používá samostatný renderer soubor a samostatnou V2 asset vrstvu.
- Nové PBR textury: omítka, dlažba, substrát a kartáčovaný kov (albedo/normal/roughness).
- Nové zpracování skleněných terárií: samostatné skleněné plochy, posuvná čelní skla, kolejnice, úchyty, ventilační zóny, servisní pás, substrát, korková zadní stěna, větve, kameny a vegetace.
- Obsazená terária mají fyzicky působící teplé vnitřní světlo.
- Paludárium má samostatnou vodní část.
- Rack box, inkubační a karanténní box mají vlastní konstrukci.
- V2 verze pracovního stolu, dřezu, regálu/skříně a rostliny.
- Upravená expozice, prostředí a materiálová odezva místnosti.

CO SE NEMĚNÍ
- databáze a SQL,
- room layout data,
- x/y/rotation,
- serverová kolizní logika,
- drag/drop,
- ukládání místnosti,
- Planner, Reprodukce, Genetics ani ostatní moduly.

JAK SPUSTIT
1. Zálohuj současný /app-manager/.
2. Nahraj obsah app-manager/ z tohoto ZIPu přes stejné cesty. Složku předem nemaž.
3. Zachovej svůj config.local.php a uploads/.
4. SQL se NEIMPORTUJE.
5. Ctrl+F5.
6. Ubikace > Habitat Studio > Místnosti.
7. V horním toolbaru klikni „Spustit V2 PROOF“.
8. Pro návrat klikni „Vrátit V1“.

QUALITY GATE
Tato fáze má odpovědět pouze na otázku, zda nový skutečný WebGL renderer míří graficky správným směrem.
Pokud ano, další fáze přesune zbývající vybavení do V2 asset pipeline a následně se doplní samostatná GLB/glTF knihovna pro nejdetailnější modely.

OVĚŘENÍ PŘED ZABALENÍM
- php -l: 69/69 PHP souborů bez chyby.
- node syntax: 18/18 JS/MJS souborů bez chyby.
- Genetics: 33 passed, 0 failed.
- DB MIGRATION: NONE.

Poznámka: v tomto build prostředí nebyl dostupný funkční WebGL/EGL backend pro pořízení automatického headless screenshotu. Vizuální quality gate je proto nutné provést v reálném prohlížeči na hostingu; statická syntax/regresní kontrola byla provedena.

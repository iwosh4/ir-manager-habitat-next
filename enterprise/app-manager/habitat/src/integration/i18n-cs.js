/**
 * Czech UI for Habitat Studio inside IR Manager.
 * The studio code keeps its English source strings; this layer translates what reaches the screen:
 * text nodes, title / placeholder / aria-label attributes, toasts and confirm/alert dialogs.
 * Exact phrases first, then patterns for strings with values. Unknown strings stay untouched.
 */
const T = {
  // toolbar / modes / camera
  'Planner': 'Plánovač', 'Showcase': 'Prezentace', 'Tech plan': 'Technický plán', 'TECH PLAN': 'TECHNICKÝ PLÁN',
  'Render mode — same room, two renderers': 'Režim zobrazení — stejná místnost, dva renderery',
  'Planner — stylised hand-painted renderer, fast on any GPU': 'Plánovač — stylizované ručně malované zobrazení, rychlé na každém GPU',
  'Showcase — realistic renderer (loads on first use)': 'Prezentace — realistické zobrazení (načte se při prvním použití)',
  'Tech plan — water, misting, drainage, electrical and sensor networks (T)': 'Technický plán — voda, mlžení, odpady, elektro a senzory (T)',
  'New empty room': 'Nová prázdná místnost', 'Import room JSON (Ctrl+O)': 'Import místnosti z JSON (Ctrl+O)', 'Export room JSON (Ctrl+S)': 'Export místnosti do JSON (Ctrl+S)',
  'Load demonstration room': 'Načíst ukázkovou místnost', 'Undo (Ctrl+Z)': 'Zpět (Ctrl+Z)', 'Redo (Ctrl+Y)': 'Znovu (Ctrl+Y)',
  'Snapping on/off (G)': 'Přichytávání zap/vyp (G)', 'Grid step': 'Krok mřížky', 'Dimensions & clearances (M)': 'Rozměry a odstupy (M)',
  'Daylight': 'Denní světlo', 'Day': 'Den', 'Evening': 'Večer', 'Night': 'Noc', 'Evening — dimmed room light': 'Večer — tlumené světlo v místnosti', 'Night — enclosure lighting only': 'Noc — jen osvětlení terárií',
  'Render quality': 'Kvalita zobrazení', 'Quality': 'Kvalita', 'Toggle object library ([)': 'Knihovna objektů ([)', 'Toggle properties ( ] )': 'Vlastnosti ( ] )', 'Fullscreen (F11)': 'Celá obrazovka (F11)',
  'Auto': 'Auto', 'Auto (recommended)': 'Auto (doporučeno)', 'Fast': 'Rychlá', 'Balanced': 'Vyvážená', 'High': 'Vysoká', 'Ultra': 'Ultra',
  'Top (1)': 'Shora (1)', 'Front (2)': 'Zepředu (2)', 'Left (3)': 'Zleva (3)', 'Right (4)': 'Zprava (4)', 'Isometric (5)': 'Izometrie (5)', 'Eye level, inside the room (6)': 'V úrovni očí v místnosti (6)',
  'Left corner (7)': 'Levý roh (7)', 'Right corner (8)': 'Pravý roh (8)', 'Fit room (9)': 'Celá místnost (9)', 'Reset camera (0)': 'Výchozí kamera (0)', 'Fit selection (F)': 'Zaměřit výběr (F)', 'Focus (F)': 'Zaměřit (F)', 'Fit workspace': 'Celá pracovní plocha',
  'Walls: camera-aware (V)': 'Stěny: podle kamery (V)', 'AUTO — camera-aware': 'AUTO — podle kamery', 'ALL WALLS': 'VŠECHNY STĚNY', 'All walls': 'Všechny stěny', 'Cutaway': 'Řez', 'WALL FOOTPRINT': 'PŮDORYS STĚN', 'Wall footprint': 'Půdorys stěn', 'HIDE WALLS': 'SKRÝT STĚNY', 'Hide walls': 'Skrýt stěny', 'Walls in view': 'Stěny v záběru',
  'Click an object to select · drag empty space to orbit · right-drag to pan · wheel to zoom': 'Klikněte na objekt pro výběr · tažením prázdného místa otáčíte · pravým tlačítkem posouváte · kolečkem přibližujete',
  'Magnetic snapping (G) — hold Alt to place freely': 'Magnetické přichytávání (G) — s klávesou Alt volně',
  'Moving — snapping to grid, walls & neighbours (hold Alt to disable)': 'Přesun — přichytává se k mřížce, stěnám a sousedům (Alt vypne)',
  'Renderer diagnostics — click (or press I) for details': 'Diagnostika rendereru — klikněte (nebo I) pro detaily', 'Renderer diagnostics': 'Diagnostika rendereru', 'Compare Showcase ↔ Planner': 'Porovnat Prezentace ↔ Plánovač', 'Render this camera with both renderers and compare': 'Vykreslit tento pohled oběma renderery a porovnat', 'Compare': 'Porovnat', 'Download report (JSON)': 'Stáhnout report (JSON)',
  // loading / status
  'Initialising…': 'Spouštím…', 'Starting renderer': 'Spouštím renderer', 'Opening room': 'Otevírám místnost', 'Compiling shaders': 'Připravuji shadery', 'Ready': 'Připraveno', 'Loading 3D models': 'Načítám 3D modely', 'Loading painted atlas': 'Načítám malované textury', 'Loading materials & environment': 'Načítám materiály a prostředí', 'Loading Showcase renderer…': 'Načítám renderer Prezentace…', 'Starting Showcase renderer': 'Spouštím renderer Prezentace',
  'Showcase renderer unavailable': 'Renderer Prezentace není dostupný', 'WebGL 2 is not available in this browser. Please use a current Chrome, Edge, Firefox or Safari.': 'Tento prohlížeč nepodporuje WebGL 2. Použijte aktuální Chrome, Edge, Firefox nebo Safari.',
  'Restored your last session (autosave)': 'Obnovena poslední relace', 'Room exported as JSON': 'Místnost exportována do JSON', 'New empty room': 'Nová prázdná místnost', 'New room': 'Nová místnost', 'Reptile room A': 'Chovatelská místnost A',
  'Demo room loaded': 'Ukázková místnost načtena', 'Demo room unavailable — started an empty room': 'Ukázková místnost není k dispozici — otevřena prázdná místnost',
  'Start a new empty room? Unsaved changes stay in undo history only.': 'Založit novou prázdnou místnost? Aktuální místnost zůstane uložená v IR Manageru.',
  'Replace the current room with the demonstration room?': 'Nahradit aktuální místnost ukázkovou?', 'The file is not valid JSON.': 'Soubor není platný JSON.', 'File does not contain a JSON object.': 'Soubor neobsahuje objekt JSON.',
  // library
  'Search — e.g. pump, black, zimoviště…': 'Hledat — např. čerpadlo, černá, zimoviště…', 'My enclosures': 'Moje ubikace', 'From MY ENCLOSURES': 'Z MÝCH UBIKACÍ', 'From MY ASSEMBLIES': 'Z MÝCH SESTAV', 'Physical enclosures': 'Fyzické ubikace', 'Enclosures (starting templates)': 'Ubikace (výchozí šablony)',
  '+ Create enclosure': '+ Vytvořit ubikaci', 'Create enclosure (Enclosure Designer)': 'Vytvořit ubikaci (Návrhář ubikací)', 'Create assembly (Assembly Builder)': 'Vytvořit sestavu (Stavitel sestav)', 'CREATE FROM TEMPLATE': 'VYTVOŘIT ZE ŠABLONY',
  'Create from template: change dimensions, doors, ventilation, interior — save to My Enclosures': 'Vytvořit ze šablony: rozměry, dvířka, větrání, interiér — uloží se do Mých ubikací',
  'Click to place in the room, or drag it into the viewport': 'Klikněte pro umístění do místnosti, nebo přetáhněte do pohledu', 'Drag into the workspace': 'Přetáhněte na pracovní plochu',
  'Enclosures': 'Ubikace', 'Enclosure': 'Ubikace', 'Furniture': 'Nábytek', 'Storage': 'Úložné prostory', 'Plants': 'Rostliny', 'Technology': 'Technika', 'Breeding': 'Chov', 'Wall-mounted / openings': 'Na stěnu / otvory', 'Doors': 'Dveře', 'Windows': 'Okna', 'Special': 'Speciální', 'Room build': 'Stavba místnosti', 'Technical devices with ports': 'Technická zařízení s porty', 'Category': 'Kategorie',
  // inspector
  'Dimensions': 'Rozměry', 'Width': 'Šířka', 'Depth': 'Hloubka', 'Height': 'Výška', 'Size': 'Velikost', 'Position': 'Poloha', 'Rotation': 'Otočení', 'Elevation': 'Výška nad podlahou', 'Rotate': 'Otočit', 'Rotate +90° (R)': 'Otočit +90° (R)', 'Rotate −90° (Shift+R)': 'Otočit −90° (Shift+R)',
  'Duplicate (Ctrl+D)': 'Duplikovat (Ctrl+D)', 'Delete (Del)': 'Smazat (Del)', 'Lock position': 'Zamknout polohu', 'Label': 'Popisek', 'Colour': 'Barva', 'Colour / decor': 'Barva / dekor', 'Custom colour': 'Vlastní barva', 'Finish': 'Povrch', 'Surface': 'Povrch', 'Profile': 'Profil', 'Mounting': 'Montáž', 'Offset': 'Odsazení', 'Wall': 'Stěna', 'Walls': 'Stěny', 'Room': 'Místnost', 'Edit': 'Upravit', 'Rename': 'Přejmenovat', 'Remove': 'Odebrat', 'Enter': 'Vstoupit', 'Escape': 'Opustit', 'Open': 'Otevřít', 'Move': 'Přesunout', 'Nudge': 'Posunout', 'Mode': 'Režim',
  'Room / enclosure top': 'Místnost / horní hrana ubikace', 'Wall profile': 'Profil stěny', 'Full height': 'Plná výška', 'Low side (knee wall)': 'Nízká strana (nadezdívka)', 'Sloped top': 'Šikmý strop', 'Skirting': 'Soklová lišta', 'Corner trims': 'Rohové lišty', 'Wall colour above': 'Barva stěny nad obkladem', 'Paint': 'Malba', 'Cladding · decor': 'Obklad · dekor', 'Smooth paint': 'Hladká malba', 'Fine plaster': 'Jemná omítka', 'White paint': 'Bílá malba', 'Warm grey (classic)': 'Teplá šedá (klasická)', 'Wood slats (lamellas)': 'Dřevěné lamely', 'Polished concrete': 'Leštěný beton', 'Grey vinyl': 'Šedé vinyl', 'Grey tiles 60×60': 'Šedá dlažba 60×60', 'Dark tiles 60×60': 'Tmavá dlažba 60×60', 'Oak planks': 'Dubová prkna', 'Oak boards': 'Dubové desky', 'Technical floor': 'Technická podlaha',
  'Door': 'Dveře', 'Door type': 'Typ dveří', 'Window': 'Okno', 'Sill': 'Parapet', 'Hinge side': 'Strana pantů', 'Open amount': 'Míra otevření', 'Blinds': 'Žaluzie', 'Blinds enabled': 'Žaluzie zapnuté', 'Blinds position': 'Poloha žaluzií', 'Slat angle': 'Úhel lamel', 'Venetian (horizontal)': 'Horizontální žaluzie', 'Roller': 'Roleta', 'Clear': 'Čiré', 'Frosted': 'Matné', 'Tinted': 'Tónované', 'Glazed': 'Prosklené', 'Sliding': 'Posuvné',
  'Interior door': 'Interiérové dveře', 'Solid technical door': 'Plné technické dveře', 'Black door': 'Černé dveře', 'Wooden door': 'Dřevěné dveře', 'Glazed door': 'Prosklené dveře', 'Sliding door': 'Posuvné dveře', 'Steel door': 'Ocelové dveře', 'Glass door': 'Skleněné dveře', 'Window with roller blind': 'Okno s roletou', 'Tall window': 'Vysoké okno',
  'Left': 'Vlevo', 'Right': 'Vpravo', 'Top': 'Nahoře', 'Bottom': 'Dole', 'Rear': 'Zadní', 'Left side': 'Levá strana', 'Right side': 'Pravá strana', 'North': 'Sever', 'Inside (room side)': 'Uvnitř (ze strany místnosti)', 'Outside': 'Venku', 'In wall': 'Ve stěně', 'inside the wall': 've stěně', 'Visible': 'Viditelné', 'Hidden': 'Skryté', 'Hide': 'Skrýt', 'None': 'Žádné', 'Small': 'Malá', 'Medium': 'Střední', 'Large': 'Velká', 'Compact': 'Kompaktní',
  'Black': 'Černá', 'White': 'Bílá', 'Grey': 'Šedá', 'Light grey': 'Světle šedá', 'Dark grey': 'Tmavě šedá', 'Anthracite': 'Antracit', 'Beige': 'Béžová', 'Oak': 'Dub', 'Light oak': 'Světlý dub', 'Walnut': 'Ořech', 'Dark wood': 'Tmavé dřevo', 'Light wood': 'Světlé dřevo', 'Wood': 'Dřevo', 'Steel': 'Ocel', 'Glass': 'Sklo', 'Terracotta': 'Terakota', 'Black laminate': 'Černý laminát', 'Black (premium)': 'Černá (prémiová)', 'Mixed / custom': 'Smíšené / vlastní',
  // enclosure designer
  'New enclosure': 'Nová ubikace', 'Enclosure code': 'Kód ubikace', 'Enclosure edited': 'Ubikace upravena', 'Delete enclosure': 'Smazat ubikaci', 'Edit enclosure instance': 'Upravit fyzickou ubikaci', 'Code': 'Kód', 'Occupied': 'Obsazeno', 'Species': 'Druh', 'Animal / ID': 'Zvíře / ID',
  'e.g. Python regius': 'např. Python regius', 'e.g. PR-01': 'např. PR-01', 'e.g. Dendrobates tinctorius': 'např. Dendrobates tinctorius', 'e.g. DT-02': 'např. DT-02', 'e.g. Basking spot': 'např. výhřevné místo',
  'Frame': 'Rám', 'Ventilation': 'Větrání', 'Background': 'Pozadí', 'Interior': 'Interiér', 'Substrate': 'Substrát', 'Front': 'Přední strana', 'Doors & front': 'Dvířka a čelo', 'Sliding glass doors': 'Posuvná skleněná dvířka', 'Fixed glass front': 'Pevné skleněné čelo', 'Single hinged door': 'Jedna otočná dvířka', 'Double hinged doors': 'Dvoje otočná dvířka', 'Mesh door': 'Síťová dvířka', 'Tub / drawer': 'Box / šuplík', 'Open / custom': 'Otevřené / vlastní',
  'Front (top strip)': 'Čelo (horní pás)', 'Front (bottom strip)': 'Čelo (spodní pás)', 'Coverage of the available length': 'Pokrytí dostupné délky', 'Sandstone relief': 'Pískovcový reliéf', 'Cork': 'Korek', 'Dark rock': 'Tmavý kámen', 'Plain foam': 'Hladká pěna', 'Empty (paper & hide)': 'Prázdné (papír a úkryt)', 'Arid': 'Pouštní', 'Tropical': 'Tropické', 'Paludarium': 'Paludárium', 'Custom (items only)': 'Vlastní (jen prvky)',
  'Sand': 'Písek', 'Bioactive soil': 'Bioaktivní substrát', 'Gravel': 'Štěrk', 'Paper': 'Papír', 'Water': 'Voda', 'Water width': 'Šířka vodní části', 'Level': 'Hladina', 'Branch': 'Větev', 'Rock': 'Kámen', 'Plant': 'Rostlina', 'Cork tube': 'Korková trubka', 'Water bowl': 'Miska s vodou', 'Moss cushion': 'Polštář mechu',
  'Heat': 'Topení', 'Heat cable': 'Topný kabel', 'Heat panel': 'Topný panel', 'Basking lamp': 'Výhřevná lampa', 'UVB fixture': 'UVB osvětlení', 'LED / light strip': 'LED pásek', 'Temperature sensor': 'Teplotní čidlo', 'Humidity sensor': 'Vlhkostní čidlo', 'Mist': 'Mlžení', 'Misting nozzle': 'Mlžicí tryska', 'Fan': 'Ventilátor', 'Add device': 'Přidat zařízení', 'Remove device': 'Odebrat zařízení', 'Remove item': 'Odebrat prvek',
  'No extra components — the preset diorama is used.': 'Bez dalších prvků — použije se přednastavená výbava.', 'Outer (incl. frame)': 'Vnější (včetně rámu)', 'incl. frame': 'včetně rámu', ' incl. frame': ' včetně rámu',
  'Glass terrarium': 'Skleněné terárium', 'Tropical terrarium': 'Tropické terárium', 'Mesh enclosure': 'Síťová ubikace', 'PVC enclosure': 'PVC ubikace', 'Rack box / tub': 'Rack box / box', 'Enclosure rack': 'Regál s ubikacemi', 'Tub rack system': 'Rack systém s boxy', 'Quarantine unit': 'Karanténní ubikace', 'Incubator': 'Inkubátor', 'Incubator box': 'Inkubační box', 'Terrarium stand': 'Stojan pod terárium',
  'Chameleon': 'Chameleon', 'Gecko': 'Gekon', 'Snake': 'Had', 'Lizard': 'Ještěr', 'Frog': 'Žába', 'Turtle': 'Želva', 'Scorpion': 'Štír', 'Spider / tarantula': 'Pavouk / sklípkan', 'Insect': 'Hmyz', 'body length': 'délka těla', 'carapace length': 'délka krunýře', 'leg span': 'rozpětí nohou', 'total length': 'celková délka', 'animal present': 'zvíře přítomno',
  // assembly builder
  'Assembly': 'Sestava', 'ASSEMBLY': 'SESTAVA', 'New assembly': 'Nová sestava', 'Assembly name': 'Název sestavy', 'Assembly settings': 'Nastavení sestavy', 'Exit assembly (Esc)': 'Opustit sestavu (Esc)', 'Removed from assembly': 'Odebráno ze sestavy', 'The assembly is empty': 'Sestava je prázdná',
  'Discard the changes to this assembly?': 'Zahodit změny této sestavy?', 'Selected assembly — frontal view': 'Vybraná sestava — čelní pohled', 'Reserved': 'Rezervováno', 'Resize reserved': 'Změnit rezervovaný prostor', 'Resize module': 'Změnit modul', 'Move component': 'Přesunout díl', 'Match the width of the structure': 'Podle šířky konstrukce', 'Full width': 'Plná šířka',
  'That enclosure does not fit in this position': 'Ubikace se na tuto pozici nevejde', 'That size would overlap a neighbour': 'Tato velikost by zasahovala do souseda', 'Outside the maximum size of the assembly': 'Mimo maximální velikost sestavy', 'Position occupied': 'Pozice je obsazená', 'No free position next to it': 'Vedle není volné místo', 'Overlaps — moved back': 'Překryv — vráceno zpět',
  'FLOOR — drop below it to insert under the structure': 'PODLAHA — pusťte pod ni pro vložení pod konstrukci', 'next to / above': 'vedle / nad', 'Cabinet': 'Skříňka', 'Shelf': 'Police', 'Lower shelf': 'Spodní police', 'Legs / frame': 'Nohy / rám', 'Technical compartment': 'Technický prostor',
  // tech plan
  'Water': 'Voda', 'Misting': 'Mlžení', 'Drainage': 'Odpady', 'Electrical': 'Elektro', 'Sensors': 'Senzory', 'Power': 'Napájení', 'Signal': 'Signál', 'Circuit': 'Okruh', 'No circuits yet.': 'Zatím žádné okruhy.', 'Edit circuit': 'Upravit okruh', 'Delete circuit': 'Smazat okruh', 'Edit route': 'Upravit trasu', 'Delete route': 'Smazat trasu', 'Move waypoint': 'Přesunout bod trasy', 'Edit device ports': 'Upravit porty zařízení', 'Technical ports': 'Technické porty',
  'Now click the DESTINATION port': 'Nyní klikněte na CÍLOVÝ port', '1 · Source port': '1 · Zdrojový port', '2 · Destination port': '2 · Cílový port', 'Route created — drag the white waypoints, double-click the route to add one': 'Trasa vytvořena — táhněte bílé body, dvojklikem na trasu přidáte další',
  'Create a route from the source to every destination not yet connected': 'Vytvořit trasu ze zdroje ke všem dosud nepřipojeným cílům', 'Branches along the walls to the drain point': 'Větve podél stěn k odpadu', 'RO → pump → filter → manifold → solenoid → enclosures': 'RO → čerpadlo → filtr → rozdělovač → ventil → ubikace',
  'Adds RO tank → misting pump → filter → manifold → solenoid → misting circuit, drainage to a drain point, power and a sensor': 'Přidá RO nádrž → mlžicí čerpadlo → filtr → rozdělovač → ventil → mlžicí okruh, odpad do vpusti, napájení a senzor',
  'In': 'Vstup', 'Out': 'Výstup', 'Water in': 'Přívod vody', 'Water out': 'Odvod vody', 'Mist in': 'Vstup mlžení', 'Misting in': 'Vstup mlžení', 'Drain in': 'Odpad vstup', 'Drain out': 'Odpad výstup', 'Mains in': 'Síťový přívod', 'Pressure out': 'Tlakový výstup', 'High-pressure out': 'Vysokotlaký výstup', 'Overflow out': 'Přepad výstup', 'Control in': 'Řízení vstup', 'Supply': 'Přívod', 'Suction': 'Sání',
  'RO tank': 'RO nádrž', 'Storage barrel': 'Zásobní sud', 'Water tank': 'Nádrž na vodu', 'Water pump': 'Čerpadlo', 'Filter': 'Filtr', 'Pressure regulator': 'Regulátor tlaku', 'Flow meter': 'Průtokoměr', 'Misting pump': 'Mlžicí čerpadlo', 'Misting filter': 'Mlžicí filtr', 'Misting pressure regulator': 'Regulátor tlaku mlžení', 'Manifold': 'Rozdělovač', 'Solenoid valve': 'Elektromagnetický ventil',
  'Drain point': 'Odpadní bod', 'Drain pipe': 'Odpadní potrubí', 'Overflow': 'Přepad', 'Trap (siphon)': 'Sifon', 'Floor drain': 'Podlahová vpusť', 'Power strip': 'Prodlužovací lišta', 'Controller': 'Řídicí jednotka', 'Relay module': 'Reléový modul', 'Raspberry Pi / controller': 'Raspberry Pi / řídicí jednotka', 'Temperature probe': 'Teplotní sonda', 'Humidity probe': 'Vlhkostní sonda', 'Temp / humidity sensor': 'Čidlo teploty / vlhkosti', 'Water level sensor': 'Hladinové čidlo', 'Leak sensor': 'Čidlo úniku vody',
  'Distribution board': 'Rozvaděč', 'Electrical panel': 'Elektrorozvaděč', 'Power outlet': 'Zásuvka', 'Double socket': 'Dvojzásuvka', 'Cable tray': 'Kabelový žlab', 'Sensor': 'Senzor', 'Climate sensor': 'Klimatické čidlo', 'Thermostat / timer': 'Termostat / časovač', 'Dehumidifier': 'Odvlhčovač', 'Air conditioner': 'Klimatizace', 'Leak alarm': 'Alarm úniku vody',
  // furniture & objects
  'Table': 'Stůl', 'Long table': 'Dlouhý stůl', 'Technical table': 'Technický stůl', 'Corner table (L)': 'Rohový stůl (L)', 'Desk with cabinet': 'Stůl se skříňkou', 'Wall shelf': 'Nástěnná police', 'Double wall shelf': 'Dvojitá nástěnná police', 'Multi-tier wall shelf': 'Víceúrovňová police', 'Shelf above desk': 'Police nad stolem',
  'Hanging cabinet': 'Závěsná skříňka', 'Tall cabinet': 'Vysoká skříň', 'Low cabinet': 'Nízká skříňka', 'Technical cabinet': 'Technická skříň', 'Storage cabinet': 'Úložná skříň', 'Supply shelving': 'Regál na zásoby', 'Workbench': 'Pracovní stůl', 'Sink unit': 'Dřez', 'Wall picture': 'Obraz', 'Wall clock': 'Nástěnné hodiny', 'Framed print': 'Obraz v rámu', 'Husbandry whiteboard': 'Chovatelská tabule', 'Schedule board': 'Tabule s plánem',
  'Incubator BLACK': 'Inkubátor BLACK', 'Wintering chamber BLACK': 'Zimoviště BLACK', 'Wintering chamber': 'Zimoviště', 'Wintering fridge': 'Zimovací lednice', 'Fridge / freezer': 'Lednice / mraznička', 'Feeder storage': 'Chov krmného hmyzu', 'Fire extinguisher': 'Hasicí přístroj', 'Exit sign': 'Značka úniku',
  'Fern': 'Kapradina', 'Boston fern': 'Kapradina (Nephrolepis)', 'Monstera': 'Monstera', 'Pothos': 'Potos', 'Ficus': 'Fíkus', 'Palm': 'Palma', 'Succulent': 'Sukulent', 'Bromeliad': 'Bromélie', 'Philodendron': 'Filodendron', 'Sansevieria': 'Tchýnin jazyk', 'Small tree': 'Malý strom', 'Table plant': 'Stolní květina', 'Large planter': 'Velký květináč', 'Pot': 'Květináč', 'Terracotta pot': 'Terakotový květináč', 'Grass tuft': 'Trs trávy',

  // panels & sections (harvested from the running studio)
  'Library': 'Knihovna', 'Properties': 'Vlastnosti', 'Summary': 'Souhrn', 'Shortcuts': 'Zkratky', 'Details': 'Detaily', 'Floor': 'Podlaha', 'Tint': 'Odstín', 'East': 'Východ', 'South': 'Jih', 'West': 'Západ', 'Side': 'Bok', 'Camera': 'Kamera', 'Views': 'Pohledy', 'Keys': 'Klávesy', 'Layers': 'Vrstvy', 'Routes': 'Trasy', 'Circuits': 'Okruhy', 'Ports': 'Porty', 'Modules': 'Moduly', 'Structure': 'Konstrukce', 'Construction': 'Konstrukce', 'Decor': 'Dekor', 'Place': 'Umístit', 'Snap': 'Přichytit', 'Snapping': 'Přichytávání', 'Focus': 'Zaměřit', 'Duplicate': 'Duplikovat',
  'MY ASSEMBLIES': 'MOJE SESTAVY', 'My assemblies': 'Moje sestavy', 'MY ENCLOSURES': 'MOJE UBIKACE', '+ Create': '+ Vytvořit', 'in room': 'v místnosti', 'All categories': 'Všechny kategorie', 'ASSEMBLY BUILDER': 'STAVITEL SESTAV', 'ENCLOSURE DESIGNER': 'NÁVRHÁŘ UBIKACÍ', 'Assembly Builder': 'Stavitel sestav', 'Enclosure Designer': 'Návrhář ubikací',
  'Nothing selected — room properties': 'Nic není vybráno — vlastnosti místnosti', 'ROOM DIMENSIONS': 'ROZMĚRY MÍSTNOSTI', 'Room dimensions': 'Rozměry místnosti', 'Apply to all walls': 'Použít na všechny stěny', 'Accent wall (black laminate)': 'Akcentní stěna (černý laminát)', 'inner room corners': 'vnitřní rohy místnosti', 'Orbit / pan / zoom': 'Otáčení / posun / zoom', 'Pan · zoom': 'Posun · zoom', 'Undo · redo': 'Zpět · znovu', 'Duplicate · delete': 'Duplikovat · smazat',
  'Click an item, then click in the room — or drag it into the viewport.': 'Klikněte na položku a pak do místnosti — nebo ji přetáhněte do pohledu.',
  'Drag enclosures from the left into the workspace — they snap to each other like building blocks': 'Přetáhněte ubikace zleva na pracovní plochu — přichytávají se k sobě jako stavebnice',
  'All sizes: W × D × H (width × depth × height). Sizes of modules and reserved spaces can be edited after placing.': 'Všechny rozměry: Š × H × V (šířka × hloubka × výška). Velikost modulů a rezervovaných prostor lze upravit po umístění.',
  'In the room the assembly moves, rotates and collides as ONE structure. Enter it (double-click / Enter) to select individual enclosures.': 'V místnosti se sestava pohybuje, otáčí a koliduje jako JEDEN celek. Vstupte do ní (dvojklik / Enter) pro výběr jednotlivých ubikací.',
  'Every device slot has a stable id. Physical enclosures get stable device ids (instance:slot) for later IR Manager / Home Assistant binding.': 'Každá pozice zařízení má stabilní ID. Fyzické ubikace dostanou stabilní ID zařízení (instance:pozice) pro pozdější napojení v IR Manageru.',
  'None yet — drag this enclosure into an assembly or the room to create physical enclosures (each gets its own id).': 'Zatím žádné — přetáhněte ubikaci do sestavy nebo do místnosti a vzniknou fyzické ubikace (každá s vlastním ID).',
  'Rebuilt parametrically — profiles, glass, vents and substrate follow; handles, locks and labels keep their size.': 'Parametrická úprava — profily, skla, větrání a substrát se přizpůsobí; úchyty, zámky a štítky si drží velikost.',
  'Visual aid only — not saved in the enclosure, not exported, never collides.': 'Jen vizuální pomůcka — neukládá se do ubikace, neexportuje se a nekoliduje.',
  'Slot pitch is physical: a longer strip gets more slots.': 'Rozteč pozic je fyzická: delší lišta má více pozic.',
  'Orbit: drag · Zoom: wheel · Drag interior items and devices directly in 3D': 'Otáčení: tažení · Zoom: kolečko · Prvky interiéru a zařízení táhněte přímo ve 3D',
  'Save to My Enclosures': 'Uložit do Mých ubikací', 'Save to My Assemblies': 'Uložit do Mých sestav', 'Edit in Assembly Builder': 'Upravit ve Staviteli sestav', 'Create a physical copy and place it in the room': 'Vytvořit fyzickou kopii a umístit ji do místnosti', 'Duplicate (new physical enclosures)': 'Duplikovat (nové fyzické ubikace)',
  'Instance code prefix': 'Předpona kódu ubikace', 'Maximum physical size': 'Maximální fyzická velikost', 'Front / doors': 'Čelo / dvířka', 'Lock / latch': 'Zámek / západka', 'Leaf colour / decor': 'Barva / dekor křídla', 'Construction notes…': 'Poznámky ke konstrukci…', 'Outer · W × D × H': 'Vnější · Š × H × V', 'Room W × D × H': 'Místnost Š × H × V', 'Size — total length': 'Velikost — celková délka',
  'No routes on the active layers.': 'Na aktivních vrstvách nejsou trasy.', 'Load example network': 'Načíst ukázkovou síť', 'Walls · Tech plan': 'Stěny · Technický plán', 'Walls: AUTO (V to cycle)': 'Stěny: AUTO (V přepíná)', 'CUTAWAY': 'ŘEZ', 'Assembly · From MY ASSEMBLIES': 'Sestava · Z MÝCH SESTAV',
  'V cycle wall mode · T tech plan': 'V přepíná stěny · T technický plán', 'WASD pan · Q/E orbit · wheel zoom': 'WASD posun · Q/E otáčení · kolečko zoom', 'G toggle · Alt bypass': 'G zap/vyp · Alt obejít', 'F · double-click': 'F · dvojklik', 'LMB · RMB · wheel': 'LTM · PTM · kolečko',
  '1 top · 2 front · 3/4 sides · 5 iso · 6 interior · 7/8 corners · 9 fit room · 0 reset': '1 shora · 2 zepředu · 3/4 boky · 5 izometrie · 6 interiér · 7/8 rohy · 9 celá místnost · 0 výchozí',
  'Stable slot id': 'Stabilní ID pozice', 'Logical record (exported JSON)': 'Logický záznam (exportovaný JSON)',
  // catalogue sub-descriptions & parts (composites are translated part by part)
  'Classic': 'Klasické', 'white': 'bílá', 'black': 'černá', 'Interior': 'Interiér', 'Anthracite': 'Antracit', 'no glass': 'bez skla', 'Full glass panel': 'Celoskleněná výplň', 'Oak decor': 'Dubový dekor', 'Surface-mounted rail': 'Kolejnice na stěnu', 'Clear glass': 'Čiré sklo', 'no blinds': 'bez žaluzií', 'venetian blinds': 'horizontální žaluzie', 'Anthracite frame': 'Antracitový rám', 'Black frame': 'Černý rám', 'tinted': 'tónované',
  'Straight': 'Rovný', '4 legs': '4 nohy', '2.4 m': '2,4 m', '6 legs': '6 nohou', 'Steel frame': 'Ocelový rám', 'lower shelf': 'spodní police', 'Two editable arms': 'Dvě upravitelná ramena', 'Drawer pedestal': 'Kontejner se zásuvkami', 'Single board': 'Jedna deska', 'Two boards': 'Dvě desky', '4 boards': '4 desky', 'rails': 'lišty', 'with LED strip': 's LED páskem', '2 doors': '2 dvířka', '5 shelves': '5 polic', 'Sideboard': 'Komoda', 'supports tanks': 'unese nádrže', 'Vented': 'Větraná', 'cable glands': 'kabelové průchodky', 'Framed print': 'Obraz v rámu', 'Ø 30 cm': 'Ø 30 cm',
  'Premium': 'Prémiový', 'glass door': 'skleněná dvířka', '4 shelves': '4 police', 'Fridge-style': 'Lednicového typu', 'thermostat': 'termostat', 'Reverse osmosis': 'Reverzní osmóza', '12 l': '12 l', '60 l': '60 l', 'blue': 'modrý', '120 l': '120 l', 'rectangular': 'obdélníková', 'Transfer': 'Přečerpávací', '230 V': '230 V', 'Inline cartridge': 'Průtoková vložka', 'With gauge': 'S manometrem', 'Hall sensor': 'Hallovo čidlo', 'pulse': 'impulzy', 'High pressure': 'Vysoký tlak', '24 V': '24 V', 'Pre-filter 5 µm': 'Předfiltr 5 µm', 'Gauge 0–16 bar': 'Manometr 0–16 bar', '4 outputs': '4 výstupy', 'NC': 'NC',
  'Room / enclosure top': 'Místnost / horní strana ubikace', 'Wall outlet Ø 50': 'Stěnový odpad Ø 50', 'Ø 40': 'Ø 40', 'wall run': 'vedení po stěně', 'Tank overflow fitting': 'Přepadová tvarovka', 'Odour trap': 'Zápachová uzávěra', 'Stainless grate': 'Nerezová mřížka', '5 sockets': '5 zásuvek', 'switch': 'vypínač', '4 channels': '4 kanály', 'DIN': 'DIN', 'Generic automation board': 'Univerzální automatizační deska', 'Capacitive RH': 'Kapacitní RH', 'DS18B20': 'DS18B20', 'cable': 'kabel', 'Temp / RH display': 'Displej teploty / vlhkosti', 'display': 'displej', 'Float switch': 'Plovákový spínač', 'Floor puck': 'Podlahové čidlo', 'Distribution board': 'Rozvaděč',
  'Split': 'Split', 'wall unit': 'nástěnná jednotka', 'Floor unit': 'Podlahová jednotka', 'Thermostat probe': 'Sonda termostatu', 'Double socket': 'Dvojzásuvka', 'Perforated': 'Perforovaný', 'with drops': 's výpustmi', 'CO₂': 'CO₂', 'wall bracket': 'nástěnný držák', 'Illuminated': 'Podsvícená', 'Husbandry whiteboard': 'Chovatelská tabule', 'Feeder storage': 'Krmný hmyz', 'Stainless': 'Nerez', 'splashback': 'zástěna', 'Oak top': 'Dubová deska', 'pegboard': 'děrovaná stěna', 'Steel': 'Ocel', '5 levels': '5 úrovní', '6 glass tanks': '6 skleněných nádrží', 'lockable': 'uzamykatelná', 'vision panel': 'průhled', 'Technical': 'Technické',
  'Arid': 'Pouštní', 'sliding doors': 'posuvná dvířka', 'Bioactive': 'Bioaktivní', 'hinged doors': 'otočná dvířka', 'Rimless': 'Bez rámu', 'on cabinet': 'na skříňce', 'PVC': 'PVC', 'stainless trolley': 'nerezový vozík', '14 tubs': '14 boxů', 'heat tape': 'topný pás', 'Cabinet': 'Skříňka',
  'Split leaves': 'Dělené listy', 'Heart leaves': 'Srdčité listy', 'medium': 'střední', 'Large planter': 'Velký truhlík', 'Trailing': 'Převislý', 'hanging pot': 'závěsný květináč', 'Areca': 'Areka', 'fronds': 'vějíře', 'Bushy fronds': 'Husté listy', 'Terracotta pot': 'Terakotový květináč', 'Small tree': 'Malý strom', 'Compact': 'Kompaktní', 'Snake plant': 'Tchýnin jazyk', 'tall planter': 'vysoký květináč', 'Small': 'Malá', 'desk': 'stolní', 'Philodendron': 'Filodendron', 'Monstera': 'Monstera', 'Sansevieria': 'Sansevierie', 'Palm': 'Palma',
  'Tall window': 'Vysoké okno', 'Window with roller blind': 'Okno s roletou', 'Wall picture': 'Obraz', 'Wall clock': 'Nástěnné hodiny', 'Schedule board': 'Tabule s plánem', 'Exit sign': 'Značka úniku', 'Fire extinguisher': 'Hasicí přístroj', 'Terrarium stand': 'Stojan pod terárium', 'Wood / board': 'Dřevo / deska', 'Floor-standing': 'Na podlahu', 'Sensor / signal': 'Senzor / signál', 'Leak sensor': 'Čidlo úniku vody', 'Cable / service entry': 'Kabelový / servisní vstup', 'Route': 'Trasa', 'circuit': 'okruh', 'Thermostat / timer': 'Termostat / časovač', 'Temp / humidity sensor': 'Čidlo teploty / vlhkosti',
  'drag from the left': 'přetáhněte zleva', 'drag object · arrows': 'tažení objektu · šipky', 'drag · arrows (Shift ×10)': 'tažení · šipky (Shift ×10)', 'enclosures': 'ubikace', 'modules': 'moduly', 'rack boxes': 'rack boxy', 'reserved': 'rezervováno', 'objects': 'objekty', 'occupied': 'obsazeno', 'm² floor': 'm² podlahy',
  'hold Alt': 'podržte Alt', 'max depth cm': 'max. hloubka cm', 'outer, cm · W × D × H': 'vnější, cm · Š × H × V', 'per wall': 'pro každou stěnu', 'right-drag · wheel': 'pravé tažení · kolečko', 'ring handle · R / Shift+R': 'kruhový úchyt · R / Shift+R', 'same camera · same RoomDocument': 'stejná kamera · stejný dokument místnosti', 'scale check': 'kontrola měřítka', 'show the leaf open': 'zobrazit otevřené křídlo',
  'total height cm': 'celková výška cm', 'total width cm': 'celková šířka cm', 'Black technical panel': 'Černý technický panel', 'Chameleon': 'Chameleon',
  'glass': 'sklo', 'wood': 'dřevo', 'pvc': 'PVC', 'mesh': 'síť', 'open': 'otevřené', 'solid': 'plné', 'alu': 'hliník', 'graphite': 'grafit', 'light': 'světlé', 'profile': 'profil',
  'enclosure · glass': 'ubikace · sklo', 'enclosure · wood': 'ubikace · dřevo', 'enclosure · pvc': 'ubikace · PVC', 'enclosure · mesh': 'ubikace · síť', 'rack box · rack': 'rack box · rack',
  // generic
  'Close (Esc)': 'Zavřít (Esc)', 'Delete': 'Smazat', 'Save': 'Uložit', 'Cancel': 'Zrušit', 'Done': 'Hotovo', 'Apply': 'Použít', 'Reset': 'Obnovit', 'Name': 'Název', 'Notes': 'Poznámky', 'Type': 'Typ', 'Start': 'Začátek', 'Light': 'Světlo', 'Lighting': 'Osvětlení', 'Temperature': 'Teplota', 'Humidity': 'Vlhkost', 'Renderer': 'Renderer',
  'Technical demo': 'Technická ukázka', 'Room': 'Místnost', 'Enter assembly': 'Vstoupit do sestavy', 'Customize…': 'Upravit…',
};
const P = [
  [/^(.+) selected — drag to move, ring to rotate, Del to delete$/, '$1 vybráno — tažením přesunete, kruhem otočíte, Del smaže'],
  [/^Placing (.+) — click to place, R to rotate, Esc to cancel$/, 'Umisťujete $1 — kliknutím umístíte, R otočí, Esc zruší'],
  [/^Entered (.+) — click an enclosure · Esc to exit$/, 'Uvnitř sestavy $1 — klikněte na ubikaci · Esc pro odchod'],
  [/^Create enclosure (.+)$/, 'Vytvořena ubikace $1'], [/^Edit enclosure (.+)$/, 'Upravena ubikace $1'], [/^Create assembly (.+)$/, 'Vytvořena sestava $1'], [/^Edit assembly (.+)$/, 'Upravena sestava $1'], [/^Delete assembly (.+)$/, 'Smazána sestava $1'], [/^Duplicate assembly (.+)$/, 'Duplikována sestava $1'],
  [/^Add circuit (.+)$/, 'Přidán okruh $1'], [/^From template: (.+)$/, 'Ze šablony: $1'], [/^Replace with (.+)$/, 'Nahradit za $1'],
  [/^Missing asset: (.+) — using placeholder$/, 'Chybí soubor $1 — použita náhrada'], [/^Import failed: (.+)$/, 'Import selhal: $1'], [/^Failed to start: (.+)$/, 'Spuštění selhalo: $1'], [/^Showcase renderer unavailable: (.+)$/, 'Renderer Prezentace není dostupný: $1'],
  [/^Imported “(.+)” — (\d+) objects(.*)$/, 'Importováno „$1“ — $2 objektů$3'],
  [/^Delete assembly “(.+)”( \(also removes it from the room\))? and its enclosure instances\?$/, (m, a, b) => `Smazat sestavu „${a}“${b ? ' (odebere ji i z místnosti)' : ''} včetně jejích ubikací?`],
  [/^Remove (.+) from (.+)\?$/, 'Odebrat $1 ze sestavy $2?'],
  [/^(\d+) enclosures?$/, (m, n) => `${n} ${n === '1' ? 'ubikace' : (+n < 5 && +n > 1 ? 'ubikace' : 'ubikací')}`],
  [/^(\d+) technical ports?$/, (m, n) => `${n} ${n === '1' ? 'technický port' : (+n < 5 && +n > 1 ? 'technické porty' : 'technických portů')}`],
  [/^(\d+) routes? · (\d+) circuits?$/, '$1 tras · $2 okruhů'],
  [/^(\d+) enclosures · (\d+) rack boxes$/, '$1 ubikací · $2 rack boxů'],
  [/^(\d+) enclosures · (\d+) rack boxes · (\d+) modules · (\d+) reserved\s+(.*)\(W × D × H\)$/, '$1 ubikací · $2 rack boxů · $3 modulů · $4 rezervováno   $5(Š × H × V)'],
  [/^Stable slot id \(devices of physical enclosures are (.+)\)$/, 'Stabilní ID pozice (zařízení fyzických ubikací jsou $1)'],
  [/^enclosure · (\w+) · (\d+) built$/, (m, t, n) => `ubikace · ${({ glass: 'sklo', pvc: 'PVC', wood: 'dřevo', mesh: 'síť', rack: 'rack' })[t] || t} · ${n} ks`],
  [/^rack box · (\w+) · (\d+) built$/, 'rack box · $1 · $2 ks'],
  [/^(\d+) objects?$/, (m, n) => `${n} ${n === '1' ? 'objekt' : (+n < 5 && +n > 1 ? 'objekty' : 'objektů')}`],
];

function lookup(core) {
  if (Object.prototype.hasOwnProperty.call(T, core)) return T[core];
  for (const [re, rep] of P) if (re.test(core)) return core.replace(re, rep);
  return null;
}
/** Composite labels ("Label — Sub · detail", "+ Item") are translated part by part. */
function composite(core) {
  if (core.startsWith('+ ')) { const r = lookup(core.slice(2)) ?? composite(core.slice(2)); return r ? '+ ' + r : null; }
  const parts = core.split(/( — | · )/);
  if (parts.length < 3) return null;
  let changed = false;
  const out = parts.map((x) => { if (x === ' — ' || x === ' · ') return x; const r = lookup(x.trim()); if (r !== null) { changed = true; return x.replace(x.trim(), r); } return x; });
  return changed ? out.join('') : null;
}
function tr(s) {
  if (!s) return s;
  const core = s.trim(); if (!core) return s;
  const out = lookup(core) ?? composite(core);
  return out === null ? s : s.replace(core, out);
}
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
function translateNode(n) {
  if (n.nodeType === 3) { const v = n.nodeValue; const t = tr(v); if (t !== v) n.nodeValue = t; return; }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'CANVAS') return;
  for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
  if ((n.tagName === 'INPUT' || n.tagName === 'BUTTON') && (n.type === 'button' || n.type === 'submit') && n.value) { const t = tr(n.value); if (t !== n.value) n.value = t; }
  for (const c of n.childNodes) translateNode(c);
}

export function installCzech(root = document.body) {
  document.documentElement.lang = 'cs';
  translateNode(root);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); const t = tr(v); if (t !== v) m.target.setAttribute(m.attributeName, t); }
      else for (const n of m.addedNodes) translateNode(n);
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const c = window.confirm.bind(window), a = window.alert.bind(window), p = window.prompt.bind(window);
  window.confirm = (msg) => c(tr(String(msg)));
  window.alert = (msg) => a(tr(String(msg)));
  window.prompt = (msg, d) => p(tr(String(msg)), d);
  return { tr };
}
export { tr };

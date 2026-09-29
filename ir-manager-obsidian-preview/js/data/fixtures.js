// Coherent demo breeding collection for Concept B. Generated once (anchored to the first run's date) and then
// persisted locally — the same animals appear in Animals, Planner, Tasks, Health, Reproduction, Enclosures,
// Inventory and Finance. All people and companies are fictional.
import { SPECIES } from './species.js';
import { DAY, HOUR, MIN, startOfDay, atTime } from '../core/time.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function generateDemo(nowTs = Date.now()) {
  const R = rng(20260928);
  const T0 = startOfDay(nowTs);
  const d = (n, h = 12, m = 0) => atTime(T0 + n * DAY, h, m);
  const db = {
    version: 1, createdAt: nowTs,
    user: { name: 'Iwosh', role: 'Chovatel · Chovná místnost A', initials: 'IW' },
    prefs: { theme: 'dark', lang: 'cs', density: 'comfortable', weightUnit: 'g', tempUnit: 'C', startView: 'dashboard', notify: { overdue: true, incubation: true, health: true, stock: true, repro: true }, quietHours: [22, 7] },
    animals: [], enclosures: [], assemblies: [], plans: [], occ: {}, records: [], tasks: [], cycles: [], clutches: [], health: [], meds: [],
    inventory: [], stock: [], finance: [], contacts: [], sales: [], genetics: [], documents: [], recent: { animals: [], enclosures: [] }, favorites: [], readNotifications: [], activityCfg: null,
  };

  // ---------------------------------------------------------------- contacts (fictional)
  db.contacts = [
    { id: 'c_vet1', kind: 'veterinář', name: 'MVDr. Jana Horáková', org: 'Exotic Vet Clinic Vinohrady', city: 'Praha', country: 'CZ', phone: '+420 602 118 440', email: 'ordinace@exovet-demo.cz', tags: ['plazi', 'obojživelníci', 'laboratoř'], notes: 'Endoskopie a RTG na místě. Pohotovost so 9–12.', rating: 5 },
    { id: 'c_vet2', kind: 'veterinář', name: 'MVDr. Petr Veselý', org: 'Herpetovet Brno', city: 'Brno', country: 'CZ', phone: '+420 731 440 902', email: 'vesely@herpetovet-demo.cz', tags: ['plazi', 'chirurgie'], notes: 'Druhý názor, chirurgie.', rating: 4 },
    { id: 'c_sup1', kind: 'supplier', name: 'FeederFarm CZ', org: 'FeederFarm s.r.o.', city: 'Kolín', country: 'CZ', phone: '+420 321 777 120', email: 'orders@feederfarm-demo.cz', tags: ['živá potrava', 'dubia', 'cvrčci', 'drosophila'], notes: 'Objednávky do út 12:00 expedují ve st. Doprava zdarma nad 1 500 Kč.', rating: 5 },
    { id: 'c_sup2', kind: 'supplier', name: 'ColdChain Rodents', org: 'ColdChain Feed a.s.', city: 'Plzeň', country: 'CZ', phone: '+420 377 210 330', email: 'shop@coldchain-demo.cz', tags: ['mražené', 'myši', 'potkani'], notes: 'Mražené zboží ve čt. Min. objednávka 2 000 Kč.', rating: 4 },
    { id: 'c_sup3', kind: 'supplier', name: 'TerraTech Supply', org: 'TerraTech Supply', city: 'Ostrava', country: 'CZ', phone: '+420 596 330 811', email: 'info@terratech-demo.cz', tags: ['UVB', 'rosení', 'čidla'], notes: 'UVB T5 trubice, trysky, náhradní čidla.', rating: 4 },
    { id: 'c_br1', kind: 'breeder', name: 'Martin Dvořák', org: 'Dvořák Dendrobates', city: 'Hradec Králové', country: 'CZ', phone: '+420 604 555 210', email: 'martin@dendro-demo.cz', tags: ['Dendrobates', 'obchod'], notes: 'Původ skupiny AZ-01 (F1). Spolehlivý, dobré doklady.', rating: 5 },
    { id: 'c_br2', kind: 'breeder', name: 'Lucie Nováková', org: 'Pythons of Bohemia', city: 'České Budějovice', country: 'CZ', phone: '+420 777 902 118', email: 'lucie@pob-demo.cz', tags: ['Python regius', 'morfy'], notes: 'Linie Clown & Pied. PR-02 z její snůšky 2023.', rating: 5 },
    { id: 'c_br3', kind: 'breeder', name: 'Stefan Maier', org: 'Maier Chameleons', city: 'Regensburg', country: 'DE', phone: '+49 941 330 7780', email: 'stefan@maiercham-demo.de', tags: ['Furcifer pardalis', 'Ambilobe', 'Nosy Be'], notes: 'Setkání na burze Hamm. Zálohy převodem.', rating: 4 },
    { id: 'c_cu1', kind: 'contact', name: 'Jakub Černý', org: '', city: 'Praha', country: 'CZ', phone: '+420 608 330 772', email: 'jakub.c@mail-demo.cz', tags: ['zákazník'], notes: 'Koupil CC-06 (2025). Zájem o samici Dalmatian.', rating: 0 },
    { id: 'c_cu2', kind: 'contact', name: 'Anna Horvátová', org: '', city: 'Bratislava', country: 'SK', phone: '+421 905 120 330', email: 'anna.h@mail-demo.sk', tags: ['zákazník', 'rezervace'], notes: 'Rezervace PR-H3 (záloha zaplacena).', rating: 0 },
    { id: 'c_expo', kind: 'contact', name: 'Terraristika Expo Praha', org: 'Pořadatel burzy', city: 'Praha', country: 'CZ', phone: '+420 222 330 000', email: 'stoly@expo-demo.cz', tags: ['burza'], notes: 'Stoly rezervovány na 18. 10. (2 stoly).', rating: 0 },
  ];

  // ---------------------------------------------------------------- enclosures & assemblies (dimensions W × D × H cm)
  const enc = (id, code, name, type, w, dd, h, extra = {}) => ({ id, code, name, type, dims: { w, d: dd, h }, status: 'ok', tech: [], readings: null, ...extra });
  db.enclosures = [
    enc('e_fw1', 'FW-1', 'Žabí stěna · box 1', 'glass', 45, 45, 60, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fw2', 'FW-2', 'Žabí stěna · box 2', 'glass', 45, 45, 60, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fw3', 'FW-3', 'Žabí stěna · box 3', 'glass', 45, 45, 60, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fw4', 'FW-4', 'Žabí stěna · box 4', 'glass', 45, 45, 60, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fw5', 'FW-5', 'Žabí stěna · box 5', 'glass', 45, 45, 45, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fw6', 'FW-6', 'Žabí stěna · box 6', 'glass', 45, 45, 45, { assemblyId: 'as_fw', img: 'rack-glass' }),
    enc('e_fr1', 'FR-1', 'Rack pro žabky · A', 'tub', 40, 30, 20, { assemblyId: 'as_fr', img: 'rack-tubs' }),
    enc('e_fr2', 'FR-2', 'Rack pro žabky · B', 'tub', 40, 30, 20, { assemblyId: 'as_fr', img: 'rack-tubs' }),
    enc('e_t01', 'T-01', 'Tropické 60 · pagekoni', 'glass', 60, 45, 90, { img: 'tropical-terrarium' }),
    enc('e_t02', 'T-02', 'Tropické 45 · pagekoni', 'glass', 45, 45, 60, { img: 'tropical-terrarium' }),
    enc('e_t03', 'T-03', 'Tropické 45 · mláďata', 'glass', 45, 45, 45, { img: 'tropical-terrarium' }),
    enc('e_ch1', 'CH-1', 'Síťové 60 · chameleon', 'mesh', 60, 60, 120, { img: 'tropical-terrarium' }),
    enc('e_ch2', 'CH-2', 'Síťové 60 · chameleon', 'mesh', 60, 60, 120, { img: 'tropical-terrarium' }),
    enc('e_ch3', 'CH-3', 'Skleněné 45 · chameleon', 'glass', 45, 45, 90, { img: 'tropical-terrarium' }),
    enc('e_p01', 'P-01', 'PVC 120 · krajta kobercová', 'pvc', 120, 60, 60, { img: 'glass-terrarium' }),
    enc('e_p02', 'P-02', 'PVC 120 · krajta kobercová', 'pvc', 120, 60, 60, { img: 'glass-terrarium' }),
    enc('e_r1', 'R-1', 'Rack krajty královské · 1', 'tub', 58, 60, 22, { assemblyId: 'as_bp', img: 'rack-tubs' }),
    enc('e_r2', 'R-2', 'Rack krajty královské · 2', 'tub', 58, 60, 22, { assemblyId: 'as_bp', img: 'rack-tubs' }),
    enc('e_r3', 'R-3', 'Rack krajty královské · 3', 'tub', 58, 60, 22, { assemblyId: 'as_bp', img: 'rack-tubs' }),
    enc('e_r4', 'R-4', 'Rack krajty královské · 4', 'tub', 58, 60, 22, { assemblyId: 'as_bp', img: 'rack-tubs' }),
    enc('e_r5', 'R-5', 'Rack mláďat · 5', 'tub', 40, 30, 14, { assemblyId: 'as_bp', img: 'rack-tubs' }),
    enc('e_v1', 'V-1', 'Stromový had 60', 'glass', 60, 45, 90, { img: 'tropical-terrarium', venomous: true }),
    enc('e_v2', 'V-2', 'Stromový had 45', 'glass', 45, 45, 60, { img: 'tropical-terrarium', venomous: true }),
    enc('e_c1', 'C-1', 'Užovky 100', 'glass', 100, 50, 50, { img: 'glass-terrarium' }),
    enc('e_c2', 'C-2', 'Užovky 100', 'glass', 100, 50, 50, { img: 'glass-terrarium' }),
    enc('e_q1', 'Q-1', 'Karanténní box', 'pvc', 90, 50, 60, { img: 'quarantine' }),
    enc('e_inc', 'INC-1', 'Inkubátor · vejce plazů', 'incubator', 62, 60, 125, { img: 'incubator' }),
    enc('e_pal', 'PAL-1', 'Paludárium 120 (expozice)', 'glass', 120, 50, 60, { img: 'paludarium' }),
  ];
  db.assemblies = [
    { id: 'as_fw', name: 'Žabí stěna A', kind: 'rack', members: ['e_fw1', 'e_fw2', 'e_fw3', 'e_fw4', 'e_fw5', 'e_fw6'], dims: { w: 186, d: 60, h: 241 }, frame: 'rám auto · 3 cm', habitat: 'CHOVNÁ STĚNA' },
    { id: 'as_fr', name: 'Rack pro žabky', kind: 'box rack', members: ['e_fr1', 'e_fr2'], dims: { w: 42, d: 32, h: 60 }, frame: 'ocelový regál' },
    { id: 'as_bp', name: 'Rack krajty královské', kind: 'box rack', members: ['e_r1', 'e_r2', 'e_r3', 'e_r4', 'e_r5'], dims: { w: 122, d: 62, h: 178 }, frame: 'rack s topným páskem' },
  ];
  // technical state per enclosure
  const tech = (kind, label, installedDaysAgo, lifeDays) => ({ kind, label, installed: T0 - installedDaysAgo * DAY, lifeDays });
  for (const e of db.enclosures) {
    const humid = /fw|fr|t0|ch|v|pal/.test(e.id);
    const base = { t: 24 + R() * 3, rh: humid ? 78 + R() * 16 : 52 + R() * 12 };
    e.readings = { t: +base.t.toFixed(1), rh: Math.round(base.rh), at: nowTs - (5 + R() * 40) * MIN, tMin: +(base.t - 3.5).toFixed(1), tMax: +(base.t + 2.2).toFixed(1) };
    if (e.type === 'glass' || e.type === 'mesh') e.tech.push(tech('led', 'LED 6500 K', 300, 1800));
    if (/ch|v|c|p0|t0/.test(e.id)) e.tech.push(tech('uvb', 'UVB T5 6 %', e.id === 'e_ch1' ? 338 : 120 + Math.round(R() * 150), 365));
    if (/ch|p0|c/.test(e.id)) e.tech.push(tech('bask', 'Výhřevná lampa 50 W', 90, 240));
    if (/fw|ch|v|pal/.test(e.id)) e.tech.push(tech('mist', 'Mlžicí tryska', 200, 540));
    if (e.type === 'tub' || e.id === 'e_inc') e.tech.push(tech('heat', e.id === 'e_inc' ? 'Topení inkubátoru' : 'Topný pásek 28 W', 400, 2000));
    e.tech.push(tech('sensor', 'Čidlo T/RH', 150, 900));
  }
  db.enclosures.find((e) => e.id === 'e_ch1').status = 'attention';
  db.enclosures.find((e) => e.id === 'e_inc').readings = { t: 31.6, rh: 88, at: nowTs - 6 * MIN, tMin: 31.3, tMax: 31.9 };

  // ---------------------------------------------------------------- animals
  const A = (o) => ({ status: 'active', tags: [], genetics: [], favorite: false, notes: '', kind: 'individual', breeding: 'resting', ...o });
  const born = (days) => T0 - days * DAY;
  db.animals = [
    // Dendrobates — group husbandry (one card per group)
    A({ id: 'a_az01', code: 'AZ-01', name: 'Chovná skupina azureus', species: 'dendrobates-tinctorius-azureus', kind: 'group', count: 4, sexes: { m: 2, f: 2, u: 0 }, enclosureId: 'e_fw1', born: born(1180), origin: { type: 'captive-bred', from: 'c_br1', gen: 'F1' }, breeding: 'breeding', favorite: true, imgVariant: 0,
      members: [{ id: 'a_az01_1', code: 'AZ-01/1', sex: 'm', note: 'velké přilnavé polštářky' }, { id: 'a_az01_2', code: 'AZ-01/2', sex: 'm', note: 'volá za úsvitu' }, { id: 'a_az01_3', code: 'AZ-01/3', sex: 'f', note: 'dominantní samice' }, { id: 'a_az01_4', code: 'AZ-01/4', sex: 'f', note: '' }],
      description: 'Skupina F1 od Dvořák Dendrobates. Pár 1/3 pravidelně klade v levém kokosu.' }),
    A({ id: 'a_az02', code: 'AZ-02', name: 'Mláďata azureus', species: 'dendrobates-tinctorius-azureus', kind: 'group', count: 6, sexes: { m: 0, f: 0, u: 6 }, enclosureId: 'e_fw2', born: born(160), origin: { type: 'own-breeding', clutch: 'LEU' }, imgVariant: 1, status: 'active',
      members: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `a_az02_${i}`, code: `AZ-02/${i}`, sex: 'u', note: '' })), description: 'Vlastní odchov (2026), odchovná skupina.' }),
    A({ id: 'a_az03', code: 'AZ-03', name: 'Pár azureus', species: 'dendrobates-tinctorius-azureus', kind: 'group', count: 2, sexes: { m: 1, f: 1, u: 0 }, enclosureId: 'e_fw3', born: born(900), origin: { type: 'captive-bred', from: 'c_br1' }, imgVariant: 2, breeding: 'paired',
      members: [{ id: 'a_az03_1', code: 'AZ-03/1', sex: 'm', note: '' }, { id: 'a_az03_2', code: 'AZ-03/2', sex: 'f', note: '' }] }),
    A({ id: 'a_az04', code: 'AZ-04', name: 'Žabky azureus', species: 'dendrobates-tinctorius-azureus', kind: 'group', count: 5, sexes: { m: 0, f: 0, u: 5 }, enclosureId: 'e_fr1', born: born(48), origin: { type: 'own-breeding' }, imgVariant: 3,
      members: [1, 2, 3, 4, 5].map((i) => ({ id: `a_az04_${i}`, code: `AZ-04/${i}`, sex: 'u', note: '' })) }),
    A({ id: 'a_leu01', code: 'LEU-01', name: 'Samci leucomelas', species: 'dendrobates-leucomelas', kind: 'group', count: 3, sexes: { m: 3, f: 0, u: 0 }, enclosureId: 'e_fw4', born: born(1400), origin: { type: 'captive-bred', from: 'c_br1' }, imgVariant: 0,
      members: [1, 2, 3].map((i) => ({ id: `a_leu01_${i}`, code: `LEU-01/${i}`, sex: 'm', note: '' })), description: 'Tři samci společně — volající skupina pro rotaci párování.' }),
    A({ id: 'a_leu02', code: 'LEU-02', name: 'Pár leucomelas', species: 'dendrobates-leucomelas', kind: 'group', count: 2, sexes: { m: 1, f: 1, u: 0 }, enclosureId: 'e_fw5', born: born(1100), origin: { type: 'captive-bred', from: 'c_br1' }, imgVariant: 1, breeding: 'breeding', favorite: true,
      members: [{ id: 'a_leu02_1', code: 'LEU-02/1', sex: 'm', note: '' }, { id: 'a_leu02_2', code: 'LEU-02/2', sex: 'f', note: 'klade na Petriho misku pod listem' }] }),
    A({ id: 'a_leu03', code: 'LEU-03', name: 'Mláďata leucomelas', species: 'dendrobates-leucomelas', kind: 'group', count: 4, sexes: { m: 0, f: 0, u: 4 }, enclosureId: 'e_fw6', born: born(210), origin: { type: 'own-breeding' }, imgVariant: 2,
      members: [1, 2, 3, 4].map((i) => ({ id: `a_leu03_${i}`, code: `LEU-03/${i}`, sex: 'u', note: '' })) }),
    A({ id: 'a_leu04', code: 'LEU-04', name: 'Žabky leucomelas', species: 'dendrobates-leucomelas', kind: 'group', count: 3, sexes: { m: 0, f: 0, u: 3 }, enclosureId: 'e_fr2', born: born(30), origin: { type: 'own-breeding' }, imgVariant: 3,
      members: [1, 2, 3].map((i) => ({ id: `a_leu04_${i}`, code: `LEU-04/${i}`, sex: 'u', note: '' })) }),
    // Crested geckos
    A({ id: 'a_cc01', code: 'CC-01', name: 'Mango', species: 'correlophus-ciliatus', sex: 'f', enclosureId: 'e_t01', born: born(1500), morph: 'Harlequin', weightG: 48, origin: { type: 'captive-bred' }, breeding: 'gravid', favorite: true, imgVariant: 0, description: 'Osvědčená samice, 3. sezóna. Klade každých 30–35 dní do snáškového boxu (vlevo).' }),
    A({ id: 'a_cc02', code: 'CC-02', name: 'Ember', species: 'correlophus-ciliatus', sex: 'm', enclosureId: 'e_t02', born: born(1300), morph: 'Red flame', weightG: 44, origin: { type: 'captive-bred' }, breeding: 'resting', imgVariant: 2 }),
    A({ id: 'a_cc03', code: 'CC-03', name: 'Pepper', species: 'correlophus-ciliatus', sex: 'f', enclosureId: 'e_t02', born: born(700), morph: 'Dalmatian', weightG: 36, origin: { type: 'own-breeding' }, status: 'for-sale', price: 3200, imgVariant: 1, notes: 'Ztráta ocasu 2025 — zahojeno. Cena tomu odpovídá.' }),
    A({ id: 'a_cc04', code: 'CC-04', name: '', species: 'correlophus-ciliatus', sex: 'u', enclosureId: 'e_t03', born: born(150), morph: 'Harlequin', weightG: 9, origin: { type: 'own-breeding' }, status: 'for-sale', price: 1800, imgVariant: 4 }),
    A({ id: 'a_cc05', code: 'CC-05', name: '', species: 'correlophus-ciliatus', sex: 'u', enclosureId: 'e_t03', born: born(46), morph: 'Olive', weightG: 2.1, origin: { type: 'own-breeding', clutch: 'cl_cc02' }, imgVariant: 3 }),
    // Panther chameleons
    A({ id: 'a_fp01', code: 'FP-01', name: 'Rubin', species: 'furcifer-pardalis', sex: 'm', enclosureId: 'e_ch1', born: born(760), morph: 'Ambilobe', weightG: 158, origin: { type: 'captive-bred', from: 'c_br3' }, favorite: true, imgVariant: 0, breeding: 'resting' }),
    A({ id: 'a_fp02', code: 'FP-02', name: 'Zara', species: 'furcifer-pardalis', sex: 'f', enclosureId: 'e_ch2', born: born(520), morph: 'Ambilobe', weightG: 71, origin: { type: 'captive-bred', from: 'c_br3' }, imgVariant: 2, breeding: 'resting' }),
    A({ id: 'a_fp03', code: 'FP-03', name: 'Azul', species: 'furcifer-pardalis', sex: 'm', enclosureId: 'e_ch3', born: born(300), morph: 'Nosy Be', weightG: 96, origin: { type: 'captive-bred', from: 'c_br3' }, status: 'reserved', price: 6500, imgVariant: 1 }),
    // Carpet pythons
    A({ id: 'a_msp01', code: 'MSP-01', name: 'Kobalt', species: 'morelia-spilota', sex: 'm', enclosureId: 'e_p01', born: born(2200), morph: 'Coastal', weightG: 2360, origin: { type: 'captive-bred' }, imgVariant: 0, breeding: 'resting' }),
    A({ id: 'a_msp02', code: 'MSP-02', name: 'Opál', species: 'morelia-spilota', sex: 'f', enclosureId: 'e_p02', born: born(2000), morph: 'Jungle × Coastal', weightG: 2910, origin: { type: 'captive-bred' }, imgVariant: 1, breeding: 'post-lay', favorite: true }),
    A({ id: 'a_msp04', code: 'MSP-04', name: 'Sépie', species: 'morelia-spilota', sex: 'f', enclosureId: 'e_q1', born: born(420), morph: 'Coastal', weightG: 1820, origin: { type: 'import', from: 'c_br2' }, status: 'quarantine', imgVariant: 3, notes: 'Karanténa 60 dní od příjezdu. Čeká se na rozbor trusu.' }),
    // Ball pythons
    A({ id: 'a_pr01', code: 'PR-01', name: 'Clownfish', species: 'python-regius', sex: 'm', enclosureId: 'e_r1', born: born(1650), morph: 'Clown', genetics: [{ gene: 'Clown', zyg: 'visual' }], weightG: 1180, origin: { type: 'captive-bred', from: 'c_br2' }, imgVariant: 0, breeding: 'paired' }),
    A({ id: 'a_pr02', code: 'PR-02', name: 'Tessa', species: 'python-regius', sex: 'f', enclosureId: 'e_r2', born: born(1300), morph: 'Pastel het Clown', genetics: [{ gene: 'Pastel', zyg: 'het' }, { gene: 'Clown', zyg: 'het' }], weightG: 1740, origin: { type: 'captive-bred', from: 'c_br2' }, imgVariant: 1, breeding: 'gravid', favorite: true, description: 'Letos ovulovala — sledujeme předsnůškový svlek.' }),
    A({ id: 'a_pr03', code: 'PR-03', name: 'Domino', species: 'python-regius', sex: 'm', enclosureId: 'e_r3', born: born(1100), morph: 'Piebald', genetics: [{ gene: 'Piebald', zyg: 'visual' }], weightG: 990, origin: { type: 'captive-bred', from: 'c_br2' }, imgVariant: 2 }),
    A({ id: 'a_pr04', code: 'PR-04', name: 'Maple', species: 'python-regius', sex: 'f', enclosureId: 'e_r4', born: born(1200), morph: 'Normal het Piebald', genetics: [{ gene: 'Piebald', zyg: 'het' }], weightG: 1520, origin: { type: 'captive-bred', from: 'c_br2' }, imgVariant: 3, breeding: 'cycling' }),
    A({ id: 'a_prh3', code: 'PR-H3', name: '', species: 'python-regius', sex: 'f', enclosureId: 'e_r5', born: born(95), morph: 'Pastel 66% het Clown', genetics: [{ gene: 'Pastel', zyg: 'het' }, { gene: 'Clown', zyg: 'poss-het 66%' }], weightG: 118, origin: { type: 'own-breeding' }, status: 'reserved', price: 2800, imgVariant: 4 }),
    A({ id: 'a_prh4', code: 'PR-H4', name: '', species: 'python-regius', sex: 'm', enclosureId: 'e_r5', born: born(95), morph: 'Normal 66% het Clown', genetics: [{ gene: 'Clown', zyg: 'poss-het 66%' }], weightG: 104, origin: { type: 'own-breeding' }, status: 'for-sale', price: 1500, imgVariant: 5 }),
    // Atheris
    A({ id: 'a_as01', code: 'AS-01', name: 'Jade', species: 'atheris-squamigera', sex: 'm', enclosureId: 'e_v1', born: born(1400), weightG: 64, origin: { type: 'captive-bred' }, imgVariant: 0, tags: ['venomous'], notes: 'JEDOVATÝ — pouze hák a tuba.' }),
    A({ id: 'a_as02', code: 'AS-02', name: 'Olea', species: 'atheris-squamigera', sex: 'f', enclosureId: 'e_v2', born: born(1250), weightG: 82, origin: { type: 'captive-bred' }, imgVariant: 2, tags: ['venomous'], breeding: 'gravid', notes: 'JEDOVATÝ. Podezření na březost — omezit manipulaci.' }),
    // Texas rat snakes
    A({ id: 'a_pl01', code: 'PL-01', name: 'Tex', species: 'pantherophis-obsoletus-lindheimeri', sex: 'm', enclosureId: 'e_c1', born: born(1600), morph: 'Normal', weightG: 840, origin: { type: 'captive-bred' }, imgVariant: 0, breeding: 'pre-brumation' }),
    A({ id: 'a_pl02', code: 'PL-02', name: 'Snowdrop', species: 'pantherophis-obsoletus-lindheimeri', sex: 'f', enclosureId: 'e_c2', born: born(1450), morph: 'Leucistic', weightG: 910, origin: { type: 'captive-bred' }, imgVariant: 2, breeding: 'pre-brumation', favorite: true }),
    // archive
    A({ id: 'a_cc06', code: 'CC-06', name: 'Biscuit', species: 'correlophus-ciliatus', sex: 'm', enclosureId: null, born: born(900), morph: 'Harlequin', weightG: 41, status: 'sold', price: 2600, soldTo: 'c_cu1', soldAt: T0 - 140 * DAY, imgVariant: 5 }),
    A({ id: 'a_pr05', code: 'PR-05', name: 'Nutmeg', species: 'python-regius', sex: 'f', enclosureId: null, born: born(1900), morph: 'Normal', weightG: 1610, status: 'deceased', diedAt: T0 - 210 * DAY, notes: 'Uhynula 2026 — podezření na zadržená vejce, pitva MVDr. Horáková.', imgVariant: 5 }),
    A({ id: 'a_leu05', code: 'LEU-05', name: 'Žabky leucomelas (2025)', species: 'dendrobates-leucomelas', kind: 'group', count: 6, sexes: { m: 0, f: 0, u: 6 }, enclosureId: null, born: T0 - 400 * DAY, status: 'sold', price: 5400, soldTo: 'c_br1', soldAt: T0 - 60 * DAY, imgVariant: 4 }),
  ];

  // ---------------------------------------------------------------- care plans (generate the operational timeline)
  const frogs = ['a_az01', 'a_az02', 'a_az03', 'a_az04', 'a_leu01', 'a_leu02', 'a_leu03', 'a_leu04'];
  const plan = (o) => ({ active: true, origin: 'care-plan', times: [[12, 0]], every: 1, anchor: T0 - 30 * DAY, ...o });
  for (const [i, id] of frogs.entries()) {
    const a = db.animals.find((x) => x.id === id), sp = SPECIES[a.species];
    db.plans.push(plan({ id: `p_feed_${id}`, type: 'feeding', subject: id, every: 1, times: [[18, 0]], feeder: sp.feeding.feeder, qty: a.born > T0 - 70 * DAY ? 'chvostoskoci + D. melanogaster' : sp.feeding.qty, rotation: sp.feeding.rotation, protocol: 'Protokol krmení dospělých pralesniček', group: 'dendro-feed' }));
    db.plans.push(plan({ id: `p_mist_${id}`, type: 'misting', subject: id, every: 1, times: [[8, 0], [16, 0]], protocol: 'Rosení deštný les · 2× denně', group: 'mist', auto: i < 6 ? 'MistKing zóna A' : null }));
  }
  for (const id of ['a_fp01', 'a_fp02', 'a_fp03', 'a_as01']) db.plans.push(plan({ id: `p_mist_${id}`, type: 'misting', subject: id, every: 1, times: [[8, 0], [16, 0]], protocol: 'Rosení stromových druhů · 2× denně', group: 'mist' }));
  for (const id of ['a_cc01', 'a_cc02', 'a_cc03', 'a_cc04', 'a_cc05']) db.plans.push(plan({ id: `p_feed_${id}`, type: 'feeding', subject: id, every: 2, anchor: T0 - 31 * DAY, times: [[19, 30]], feeder: 'CGD (kompletní krmivo)', qty: '1 miska', rotation: ['—'], protocol: 'Pagekon CGD · každé 2 dny', group: 'cgd' }));
  for (const id of ['a_fp01', 'a_fp02', 'a_fp03']) db.plans.push(plan({ id: `p_feed_${id}`, type: 'feeding', subject: id, every: 2, anchor: T0 - 30 * DAY, times: [[10, 0]], feeder: 'Dubia (M)', qty: id === 'a_fp02' ? '3 ks' : '4 ks', qtyN: id === 'a_fp02' ? 3 : 4, stockItem: 'i_dubia', rotation: ['Calcium + D3', 'Calcium + D3', 'Multivit'], protocol: 'Krmení chameleonů · každé 2 dny', group: 'cham-feed' }));
  db.plans.push(plan({ id: 'p_feed_a_msp01', type: 'feeding', subject: 'a_msp01', every: 14, anchor: T0 - 13 * DAY, times: [[19, 0]], feeder: 'Potkan (odstav, mraž.)', qty: '1 ks', qtyN: 1, stockItem: 'i_rat', rotation: ['—'], protocol: 'Protokol krmení dospělých · 14 dní' }));
  db.plans.push(plan({ id: 'p_feed_a_msp04', type: 'feeding', subject: 'a_msp04', every: 10, anchor: T0 - 9 * DAY, times: [[19, 0]], feeder: 'Potkan (odstav, mraž.)', qty: '1 ks', qtyN: 1, stockItem: 'i_rat', rotation: ['—'], protocol: 'Krmení v karanténě · 10 dní' }));
  for (const [id, every, feeder, off] of [['a_pr01', 10, 'Myš (adult, mraž.)', 0], ['a_pr03', 10, 'Myš (adult, mraž.)', 3], ['a_pr04', 10, 'Myš (adult, mraž.)', 5], ['a_prh3', 7, 'Myš (hopper, mraž.)', 1], ['a_prh4', 7, 'Myš (hopper, mraž.)', 1], ['a_pl01', 7, 'Myš (adult, mraž.)', 2], ['a_pl02', 7, 'Myš (adult, mraž.)', 2], ['a_as01', 10, 'Myš (fuzzy, mraž.)', 4], ['a_as02', 10, 'Myš (fuzzy, mraž.)', 6]]) {
    db.plans.push(plan({ id: `p_feed_${id}`, type: 'feeding', subject: id, every, anchor: T0 - 30 * DAY + off * DAY, times: [[19, 0]], feeder, qty: '1 ks', qtyN: 1, stockItem: feeder.includes('hopper') ? 'i_mhop' : feeder.includes('fuzzy') ? 'i_mfuz' : 'i_madult', rotation: ['—'], protocol: `Protokol krmení dospělých · ${every} dní`, group: every === 7 ? 'snake-7' : 'snake-10' }));
  }
  // water
  for (const id of ['a_cc01', 'a_cc02', 'a_cc03', 'a_cc04', 'a_cc05', 'a_msp01', 'a_msp02', 'a_msp04', 'a_pr01', 'a_pr02', 'a_pr03', 'a_pr04', 'a_prh3', 'a_prh4', 'a_pl01', 'a_pl02']) db.plans.push(plan({ id: `p_water_${id}`, type: 'water', subject: id, every: 3, anchor: T0 - 30 * DAY + (id.length % 3) * DAY, times: [[9, 0]], protocol: 'Čerstvá voda · každé 3 dny', group: 'water' }));
  // weights (monthly), cleaning (weekly spot clean), enclosure maintenance
  for (const [i, id] of ['a_cc01', 'a_cc02', 'a_cc03', 'a_cc04', 'a_cc05', 'a_fp01', 'a_fp02', 'a_fp03', 'a_msp01', 'a_msp02', 'a_msp04', 'a_pr01', 'a_pr02', 'a_pr03', 'a_pr04', 'a_prh3', 'a_prh4', 'a_pl01', 'a_pl02'].entries()) db.plans.push(plan({ id: `p_weight_${id}`, type: 'weight', subject: id, every: 30, anchor: T0 - 30 * DAY + (i % 9) * DAY - DAY, times: [[20, 0]], protocol: 'Měsíční vážení' }));
  for (const [i, e] of db.enclosures.filter((x) => x.type !== 'incubator').entries()) db.plans.push(plan({ id: `p_clean_${e.id}`, type: 'cleaning', subject: e.id, subjectKind: 'enclosure', every: 7, anchor: T0 - 28 * DAY + (i % 7) * DAY, times: [[11, 0]], protocol: 'Týdenní úklid a skla' }));
  db.plans.push(plan({ id: 'p_maint_mist', type: 'maintenance', title: 'Vyčistit nádrž rosení a trysky', subject: 'as_fw', subjectKind: 'assembly', every: 14, anchor: T0 - 13 * DAY, times: [[10, 30]], protocol: 'Údržba rosení · 14 dní' }));
  db.plans.push(plan({ id: 'p_maint_sens', type: 'maintenance', title: 'Kalibrace čidel T/RH', subject: 'as_bp', subjectKind: 'assembly', every: 30, anchor: T0 - 26 * DAY, times: [[10, 0]], protocol: 'Kalibrace čidel · měsíčně' }));

  // ---------------------------------------------------------------- manual tasks
  const task = (o) => ({ id: 'k_' + Math.random().toString(36).slice(2, 8), type: 'task', status: 'open', priority: 'normal', origin: 'manual', created: T0 - 3 * DAY, ...o });
  db.tasks = [
    task({ id: 'k_uvb', title: 'Výměna UVB T5 zářivky', subject: 'e_ch1', subjectKind: 'enclosure', due: d(0, 11, 0), priority: 'high', note: 'Zářivka 338 z 365 dní. Náhradní ve skříni s technikou (TerraTech #4412).' }),
    task({ id: 'k_order', title: 'Objednat Dendrocare + Calcium D3', due: d(1, 12, 0), priority: 'normal', note: 'FeederFarm — spojit s objednávkou Dubia do út 12:00.', subject: null }),
    task({ id: 'k_expo', title: 'Připravit transportní boxy na burzu', due: d(4, 17, 0), priority: 'normal', note: '8 kelímků + 2 boxy na žáby, štítky vytištěné.' }),
    task({ id: 'k_vetq', title: 'Zavolat MVDr. Horákové — výsledek trusu MSP-04', subject: 'a_msp04', due: d(-1, 15, 0), priority: 'high', note: 'Laboratoř č. 26-0917.' }),
    task({ id: 'k_petri', title: 'Přesunout snůšku LEU-02 do inkubátoru', subject: 'a_leu02', due: d(0, 20, 0), priority: 'normal', origin: 'reproduction' }),
    task({ id: 'k_invent', title: 'Inventura — mrazák', due: d(2, 18, 0), priority: 'low' }),
    task({ id: 'k_done1', title: 'Nafotit CC-04 do inzerátu', subject: 'a_cc04', due: d(-2, 18, 0), status: 'done', doneAt: d(-2, 18, 40) }),
  ];

  // ---------------------------------------------------------------- reproduction
  const ph = (key, label, start, end, o = {}) => ({ key, label, start, end, ...o });
  db.cycles = [
    { id: 'cy_pr02', name: 'Tessa × Clownfish 2026', species: 'python-regius', female: 'a_pr02', male: 'a_pr01', status: 'active', season: 2026, goal: 'Pastel het Clown × Clown (50 % Pastel, 50 % het Clown / vizuální Clown)',
      phases: [ph('cycling', 'Cyklování (noční pokles 22 °C)', d(-92), d(-60)), ph('pairing', 'Párování', d(-60), d(-24)), ph('ovulation', 'Ovulace', d(-19), d(-19), { milestone: true, observed: true }), ph('prelay', 'Okno předsnůškového svleku', d(-1), d(6), { expected: true, basis: '18–25 dní po ovulaci' }), ph('lay', 'Očekávaná snůška', d(24), d(41), { expected: true, basis: '25–35 dní po předsnůškovém svleku' }), ph('incubation', 'Inkubace', d(41), d(101), { expected: true, basis: '55–60 dní při 31,5–32 °C' })],
      events: [{ t: d(-58, 20), type: 'pairing', label: 'Párování — přidán PR-01' }, { t: d(-54, 22), type: 'mating', label: 'Pozorované páření (6 h)' }, { t: d(-47, 21), type: 'mating', label: 'Pozorované páření' }, { t: d(-40, 23), type: 'mating', label: 'Pozorované páření' }, { t: d(-19, 21), type: 'ovulation', label: 'Pozorovaná ovulace (zduření těla)' }],
      next: { label: 'Sledovat předsnůškový svlek', due: d(1, 20) } },
    { id: 'cy_msp02', name: 'Opál × Kobalt 2026', species: 'morelia-spilota', female: 'a_msp02', male: 'a_msp01', status: 'active', season: 2026, clutch: 'cl_msp',
      phases: [ph('brumation', 'Ochlazování', d(-190), d(-140)), ph('pairing', 'Párování', d(-140), d(-110)), ph('clutch', 'Snůška', d(-49), d(-49), { milestone: true, observed: true }), ph('incubation', 'Inkubace', d(-49), d(11), { expected: [52, 60] }), ph('hatch', 'Očekávané okno líhnutí', d(3), d(11), { expected: true, basis: '52–60 dní při 31,5 °C' })],
      events: [{ t: d(-138, 21), type: 'pairing', label: 'Zahájeno párování' }, { t: d(-126, 22), type: 'mating', label: 'Pozorované páření' }, { t: d(-49, 7), type: 'clutch', label: 'Snůška — 14 vajec (13 oplozených)' }], next: { label: 'Otevírá se okno líhnutí', due: d(3, 9) } },
    { id: 'cy_cc01', name: 'Mango × Ember 2026', species: 'correlophus-ciliatus', female: 'a_cc01', male: 'a_cc02', status: 'active', season: 2026, clutch: 'cl_cc03',
      phases: [ph('pairing', 'Párování', d(-210), d(-200)), ph('clutch', 'Snůška 1', d(-120), d(-120), { milestone: true, observed: true }), ph('clutch', 'Snůška 2', d(-88), d(-88), { milestone: true, observed: true }), ph('clutch', 'Snůška 3', d(-42), d(-42), { milestone: true, observed: true }), ph('incubation', 'Inkubace · snůška 3', d(-42), d(48), { expected: [60, 90] }), ph('lay', 'Očekávaná další snůška', d(-8), d(2), { expected: true, basis: 'každých 30–35 dní' })],
      events: [{ t: d(-120, 8), type: 'clutch', label: 'Snůška 1 — 2 vejce' }, { t: d(-88, 8), type: 'clutch', label: 'Snůška 2 — 2 vejce' }, { t: d(-42, 7), type: 'clutch', label: 'Snůška 3 — 2 vejce' }, { t: d(-46, 10), type: 'hatch', label: 'CL-2026-02 vylíhnuto → CC-05' }], next: { label: 'Zkontrolovat snáškový box (snůška 4)', due: d(0, 20) } },
    { id: 'cy_fp02', name: 'Zara × Rubin 2026', species: 'furcifer-pardalis', female: 'a_fp02', male: 'a_fp01', status: 'active', season: 2026, clutch: 'cl_fp',
      phases: [ph('pairing', 'Párování', d(-180), d(-176)), ph('gravid', 'Březost', d(-176), d(-142)), ph('clutch', 'Snůška', d(-142), d(-142), { milestone: true, observed: true }), ph('incubation', 'Inkubace', d(-142), d(128), { expected: [180, 270] }), ph('hatch', 'Očekávané okno líhnutí', d(38), d(128), { expected: true, basis: '180–270 dní při 24–27 °C' })],
      events: [{ t: d(-179, 10), type: 'mating', label: 'Pozorované páření (receptivní zbarvení)' }, { t: d(-142, 14), type: 'clutch', label: 'Snůška — 28 vajec (26 oplozených)' }], next: { label: 'Kontrola inkubace', due: d(1, 9, 30) } },
    { id: 'cy_leu02', name: 'LEU-02 série snůšek', species: 'dendrobates-leucomelas', female: 'a_leu02', male: 'a_leu02', status: 'active', season: 2026, group: true,
      phases: [ph('calling', 'Volání / námluvy', d(-40), d(0)), ph('clutch', 'Snůška 7 na misce', d(-9), d(-9), { milestone: true, observed: true }), ph('develop', 'Vývoj vajec', d(-9), d(6), { expected: [12, 18] }), ph('tadpole', 'Stádium pulce (očekáváno)', d(6), d(78), { expected: true, basis: '60–90 dní do metamorfózy' })],
      events: [{ t: d(-9, 8), type: 'clutch', label: 'Snůška 7 — 6 vajec na Petriho misce' }, { t: d(-3, 9), type: 'check', label: 'Kontrola — 5 se vyvíjí, 1 plesnivé (odstraněno)' }], next: { label: 'Přesunout misku do inkubátoru', due: d(0, 20) } },
    { id: 'cy_pl', name: 'Snowdrop × Tex 2026/27', species: 'pantherophis-obsoletus-lindheimeri', female: 'a_pl02', male: 'a_pl01', status: 'active', season: 2027,
      phases: [ph('fasting', 'Půst před brumací', d(-5), d(9)), ph('brumation', 'Brumace 12 °C (plán)', d(9), d(79), { planned: true }), ph('pairing', 'Párování (plán)', d(90), d(110), { planned: true })],
      events: [{ t: d(-5, 19), type: 'note', label: 'Poslední krmení před půstem' }], next: { label: 'Zahájit ochlazování na 12 °C', due: d(9, 10) } },
    { id: 'cy_done', name: 'Mango × Ember — snůška 2 (2026)', species: 'correlophus-ciliatus', female: 'a_cc01', male: 'a_cc02', status: 'done', season: 2026, clutch: 'cl_cc02',
      phases: [ph('clutch', 'Snůška', d(-121), d(-121), { milestone: true, observed: true }), ph('incubation', 'Inkubace', d(-121), d(-46)), ph('hatch', 'Vylíhnuto', d(-46), d(-46), { milestone: true, observed: true })], events: [{ t: d(-46, 10), type: 'hatch', label: 'Vylíhnuto 1/2 → CC-05 (1 neoplozené)' }] },
  ];
  db.clutches = [
    { id: 'cl_msp', code: 'CL-2026-04', cycleId: 'cy_msp02', species: 'morelia-spilota', female: 'a_msp02', male: 'a_msp01', laid: d(-49, 7), eggs: 14, fertile: 13, slugs: 1, incubator: 'e_inc', temp: 31.5, rh: 90, expected: [52, 60], checkEvery: 2, lastCheck: d(-1, 9, 30), status: 'incubating', img: 'clutch-python', notes: '5 dní inkubace samicí, pak umělá. 1 neoplozené odstraněno 6. den.' },
    { id: 'cl_fp', code: 'CL-2026-01', cycleId: 'cy_fp02', species: 'furcifer-pardalis', female: 'a_fp02', male: 'a_fp01', laid: d(-142, 14), eggs: 28, fertile: 26, slugs: 2, incubator: 'e_inc', temp: 25.5, rh: 85, expected: [180, 270], checkEvery: 7, lastCheck: d(-5, 9, 30), status: 'incubating', img: 'clutch-chameleon', notes: 'Protokol bez diapauzy (stálých 25,5 °C). Vejce ve vermikulitu 1:1.' },
    { id: 'cl_cc03', code: 'CL-2026-03', cycleId: 'cy_cc01', species: 'correlophus-ciliatus', female: 'a_cc01', male: 'a_cc02', laid: d(-42, 7), eggs: 2, fertile: 2, slugs: 0, incubator: 'e_inc', temp: 23.5, rh: 80, expected: [60, 90], checkEvery: 7, lastCheck: d(-2, 9, 30), status: 'incubating', img: 'clutch-gecko', notes: 'Police s pokojovou teplotou v inkubátoru (23–24 °C).' },
    { id: 'cl_cc02', code: 'CL-2026-02', cycleId: 'cy_done', species: 'correlophus-ciliatus', female: 'a_cc01', male: 'a_cc02', laid: d(-121, 8), eggs: 2, fertile: 1, slugs: 1, incubator: 'e_inc', temp: 23.5, rh: 80, expected: [60, 90], checkEvery: 7, lastCheck: d(-46), status: 'hatched', hatched: 1, hatchedAt: d(-46, 10), offspring: ['a_cc05'], img: 'clutch-gecko', notes: 'Vylíhnuto 75. den.' },
  ];

  // ---------------------------------------------------------------- health
  const doc = (name, kind, src) => ({ name, kind, src });
  db.health = [
    { id: 'h1', t: d(-2, 18), animal: 'a_as01', kind: 'pozorování', title: 'Zadržená oční čepička (levá)', severity: 'watch', notes: 'Po svleku před 3 dny. Vlhkost zvýšena na 85 %. Kontrola za 3 dny.', followUp: d(1, 18), resolved: false },
    { id: 'h2', t: d(-12, 10), animal: 'a_msp04', kind: 'laboratoř', title: 'Flotace trusu + kultivace (karanténa)', severity: 'watch', vet: 'c_vet1', lab: [{ test: 'Flotace trusu', result: 'Negativní', ref: 'neg' }, { test: 'Přímý nátěr', result: 'Málo bičíkovců', ref: 'žádné–málo' }, { test: 'PCR Cryptosporidium', result: 'Čeká se', ref: 'neg' }], notes: 'Laboratoř č. 26-0917. Výsledek PCR tento týden.', followUp: d(-1, 15), resolved: false, attachments: [doc('Laboratorní zpráva 26-0917.pdf', 'pdf', 'lab-26-0917')] },
    { id: 'h3', t: d(-35, 11), animal: 'a_fp01', kind: 'veterinář', title: 'Roční prohlídka — hydratace a kondice', severity: 'info', vet: 'c_vet1', diagnosis: 'Zdravý. Mírné známky dehydratace — ranní rosení +60 s.', notes: 'Hmotnost 156 g. Přilba a oči v pořádku.', resolved: true, attachments: [doc('FP-01 boční RTG', 'image', 'xray')] },
    { id: 'h4', t: d(-70, 9), animal: 'a_pr04', kind: 'diagnóza', title: 'Infekce horních cest dýchacích', severity: 'alert', vet: 'c_vet1', diagnosis: 'Infekce HCD — hlen, dýchání otevřenou tlamou. Kultivace: Pseudomonas sp.', notes: 'Výhřevné místo zvýšeno na 32 °C.', resolved: true },
    { id: 'h5', t: d(-7, 20), animal: 'a_az01', kind: 'prevence', title: 'Skupinový rozbor trusu', severity: 'info', notes: 'Směsný vzorek — parazité negativní.', resolved: true },
    { id: 'h6', t: d(-1, 19), animal: 'a_cc03', kind: 'pozorování', title: 'Vynechala 2 krmení CGD', severity: 'watch', notes: 'V noci aktivní, zatím bez úbytku hmotnosti. Sledovat apetit.', followUp: d(3, 19), resolved: false },
    { id: 'h7', t: d(-340, 10), animal: 'a_cc03', kind: 'pozorování', title: 'Autotomie ocasu', severity: 'info', notes: 'Odhodila ocas v transportním boxu. Zahojeno.', resolved: true },
  ];
  db.meds = [
    { id: 'm1', animal: 'a_pr04', drug: 'Enrofloxacin (Baytril 2,5 %)', dose: '10 mg/kg', amount: '0.6 ml', route: 'IM', everyH: 48, from: d(-70, 20), count: 7, done: 7, vet: 'c_vet1', note: 'Kúra dokončena; infekce vyřešena.' },
    { id: 'm2', animal: 'a_as01', drug: 'Oční lubrikant (hypromelóza)', dose: '1 kapka', amount: '1 kapka', route: 'lokálně', everyH: 24, from: d(-2, 19), count: 5, done: 2, vet: null, note: 'Změkčit zadrženou čepičku; netahat.' },
  ];

  // ---------------------------------------------------------------- inventory
  const item = (id, name, cat, unit, qty, min, reorder, price, supplier, img, extra = {}) => ({ id, name, cat, unit, qty, min, reorder, price, supplier, img, ...extra });
  db.inventory = [
    item('i_dubia', 'Dubia (M)', 'live', 'ks', 118, 150, 500, 1.6, 'c_sup1', 'feeders/dubia.webp', { note: 'Chov + nákup' }),
    item('i_crick', 'Cvrčci (Acheta, M)', 'live', 'ks', 260, 200, 500, 1.1, 'c_sup1', 'feeders/cricket.webp'),
    item('i_dhyd', 'Kultura Drosophila hydei', 'live', 'kultury', 14, 10, 12, 45, 'c_sup1', null, { icon: 'bug' }),
    item('i_dmel', 'Kultura Drosophila melanogaster', 'live', 'kultury', 5, 6, 8, 40, 'c_sup1', null, { icon: 'bug' }),
    item('i_spring', 'Kultura chvostoskoků', 'live', 'kultury', 3, 3, 4, 90, 'c_sup1', null, { icon: 'sprout' }),
    item('i_madult', 'Myš adult (mraž.)', 'frozen', 'ks', 46, 20, 100, 14, 'c_sup2', null, { icon: 'snowflake' }),
    item('i_mhop', 'Myš hopper (mraž.)', 'frozen', 'ks', 12, 15, 50, 9, 'c_sup2', null, { icon: 'snowflake' }),
    item('i_mfuz', 'Myš fuzzy (mraž.)', 'frozen', 'ks', 22, 10, 30, 7, 'c_sup2', null, { icon: 'snowflake' }),
    item('i_rat', 'Potkan odstav (mraž.)', 'frozen', 'ks', 9, 6, 20, 32, 'c_sup2', null, { icon: 'snowflake' }),
    item('i_cgd', 'CGD kompletní krmivo (Mango)', 'supplement', 'g', 180, 250, 500, 0.9, 'c_sup1', null, { icon: 'flask' }),
    item('s_dendro', 'Dendrocare', 'supplement', 'dóza', 1, 2, 2, 420, 'c_sup1', 'feeders/jar-dendrocare.webp', { lowNote: 'Dochází' }),
    item('s_calc', 'Calcium + D3', 'supplement', 'dóza', 2, 1, 2, 180, 'c_sup1', 'feeders/jar-calcium.webp'),
    item('s_multi', 'Multivit', 'supplement', 'dóza', 1, 1, 1, 260, 'c_sup1', 'feeders/jar-multivit.webp'),
    item('s_pollen', 'Včelí pyl', 'supplement', 'dóza', 1, 1, 1, 150, 'c_sup1', 'feeders/jar-pollen.webp'),
    item('q_uvb', 'UVB T5 6 % 54 W', 'equipment', 'ks', 1, 2, 3, 690, 'c_sup3', null, { icon: 'sun', lowNote: 'Brzy vyměnit' }),
    item('q_noz', 'Mlžicí tryska (MistKing)', 'equipment', 'ks', 5, 3, 6, 240, 'c_sup3', null, { icon: 'mist' }),
    item('q_hose', 'PVC hadička 4 mm', 'equipment', 'm', 10, 5, 20, 18, 'c_sup3', null, { icon: 'plug' }),
    item('q_sens', 'Čidlo T/RH (BLE)', 'equipment', 'ks', 2, 2, 3, 520, 'c_sup3', null, { icon: 'thermo' }),
    item('q_deli', 'Kelímky 32 oz', 'equipment', 'ks', 40, 30, 100, 6, 'c_sup3', null, { icon: 'box3d' }),
    item('u_coco', 'Kokosová cihla', 'substrate', 'ks', 3, 4, 10, 45, 'c_sup3', null, { icon: 'leaf' }),
    item('u_verm', 'Vermikulit (inkubace)', 'substrate', 'l', 12, 10, 20, 12, 'c_sup3', null, { icon: 'layers' }),
    item('u_leaf', 'Listí (dub)', 'substrate', 'l', 25, 10, 20, 8, 'c_sup3', null, { icon: 'leaf' }),
  ];
  const mv = (daysAgo, itemId, delta, reason) => ({ id: 's' + Math.random().toString(36).slice(2, 9), t: d(-daysAgo, 11 + (daysAgo % 6)), item: itemId, delta, reason });
  db.stock = [mv(1, 'i_dubia', -12, 'Krmení · chameleoni'), mv(1, 'i_madult', -3, 'Krmení · PL-01, PL-02, PR-01'), mv(2, 'i_crick', 500, 'Nákup · FeederFarm #8812'), mv(3, 'i_dhyd', -4, 'Krmení · žabí stěna'), mv(3, 'i_dhyd', 6, 'Založeny kultury'), mv(4, 's_dendro', -1, 'Otevřena dóza'), mv(5, 'i_rat', -2, 'Krmení · MSP-01, MSP-04'), mv(6, 'q_uvb', -1, 'Vyměněno · CH-2'), mv(8, 'i_madult', 100, 'Nákup · ColdChain #2210'), mv(9, 'i_dubia', -16, 'Krmení · chameleoni'), mv(12, 'u_verm', -4, 'Inkubační box CL-2026-04')];

  // ---------------------------------------------------------------- finance (CZK)
  const fin = (daysAgo, kind, cat, amount, note, extra = {}) => ({ id: 'f' + Math.random().toString(36).slice(2, 9), t: d(-daysAgo, 14), kind, cat, amount, note, ...extra });
  db.finance = [
    fin(2, 'expense', 'Krmivo', 1450, 'FeederFarm #8812 — cvrčci 500, D. hydei ×6', { contact: 'c_sup1' }),
    fin(4, 'deposit', 'Záloha', 1000, 'Záloha PR-H3 — A. Horvátová', { contact: 'c_cu2', animal: 'a_prh3' }),
    fin(6, 'expense', 'Technika', 690, 'UVB T5 zářivka', { contact: 'c_sup3' }),
    fin(8, 'expense', 'Krmivo', 2140, 'ColdChain #2210 — myši adult 100', { contact: 'c_sup2' }),
    fin(11, 'expense', 'Veterina', 1850, 'Laboratoř 26-0917 — trus MSP-04', { contact: 'c_vet1', animal: 'a_msp04' }),
    fin(15, 'income', 'Prodej', 4800, 'Burza Hamm — 2× žabky D. azureus', { contact: 'c_br3' }),
    fin(19, 'deposit', 'Záloha', 2000, 'Záloha FP-03 — S. Maier', { contact: 'c_br3', animal: 'a_fp03' }),
    fin(24, 'expense', 'Energie', 1320, 'Elektřina — chovná místnost (srpen)'),
    fin(33, 'income', 'Prodej', 5400, 'LEU-05 žabky ×6 — M. Dvořák', { contact: 'c_br1', animal: 'a_leu05' }),
    fin(40, 'expense', 'Krmivo', 980, 'FeederFarm #8640'),
    fin(52, 'expense', 'Technika', 3400, 'Rozšíření MistKing zóna B', { contact: 'c_sup3' }),
    fin(55, 'expense', 'Energie', 1280, 'Elektřina — chovná místnost (červenec)'),
    fin(61, 'income', 'Prodej', 2900, 'Mládě CC — J. Černý'),
    fin(74, 'expense', 'Veterina', 1200, 'PR-04 léčba infekce HCD', { contact: 'c_vet1', animal: 'a_pr04' }),
    fin(85, 'expense', 'Energie', 1240, 'Elektřina (červen)'),
    fin(90, 'expense', 'Krmivo', 1700, 'FeederFarm #8411'),
    fin(96, 'income', 'Prodej', 7800, 'Burza Praha — 3× CC, 1× PR'),
    fin(118, 'expense', 'Energie', 1190, 'Elektřina (květen)'),
    fin(126, 'expense', 'Krmivo', 2300, 'ColdChain #1982'),
    fin(140, 'income', 'Prodej', 2600, 'CC-06 Biscuit — J. Černý', { animal: 'a_cc06', contact: 'c_cu1' }),
    fin(150, 'expense', 'Burzy', 900, 'Stůl na burze Praha'),
    fin(170, 'income', 'Prodej', 3600, 'Žabky D. leucomelas ×4'),
    fin(180, 'expense', 'Krmivo', 1900, 'FeederFarm #8102'),
    fin(200, 'expense', 'Technika', 5200, 'Topný pásek + termostat pro rack'),
    fin(230, 'income', 'Prodej', 9800, 'Burza Hamm — mláďata FP ×3'),
    fin(260, 'expense', 'Krmivo', 2100, 'ColdChain #1733'),
    fin(300, 'income', 'Prodej', 4200, 'Mládě PR (Pastel)'),
    fin(330, 'expense', 'Veterina', 900, 'Roční prohlídky'),
  ];
  db.sales = [
    { id: 'sl1', animal: 'a_cc03', status: 'for-sale', price: 3200, listed: d(-12), channel: 'Burza + web' },
    { id: 'sl2', animal: 'a_cc04', status: 'for-sale', price: 1800, listed: d(-2), channel: 'Web' },
    { id: 'sl3', animal: 'a_prh4', status: 'for-sale', price: 1500, listed: d(-6), channel: 'Burzy' },
    { id: 'sl4', animal: 'a_prh3', status: 'reserved', price: 2800, listed: d(-10), buyer: 'c_cu2', deposit: 1000, pickup: d(18) },
    { id: 'sl5', animal: 'a_fp03', status: 'reserved', price: 6500, listed: d(-25), buyer: 'c_br3', deposit: 2000, pickup: d(20), note: 'Předání na Terraristika Expo 18. 10.' },
    { id: 'sl6', animal: 'a_cc06', status: 'sold', price: 2600, buyer: 'c_cu1', date: d(-140) },
    { id: 'sl7', animal: 'a_leu05', status: 'sold', price: 5400, buyer: 'c_br1', date: d(-33) },
  ];
  db.genetics = [
    { id: 'g1', name: 'Projekt Pastel Clown', species: 'python-regius', goal: 'Odchovat vizuální Pastel Clown (2027–2028)', pairs: [{ m: 'a_pr01', f: 'a_pr02', note: 'Sezóna 2026 — ovulace' }], notes: '2026: očekáváno 50 % Pastel het Clown, 50 % het Clown. Samice si ponechat na 2027.' },
    { id: 'g2', name: 'Linie Pied', species: 'python-regius', goal: 'Osvědčená samice Piebald do 2028', pairs: [{ m: 'a_pr03', f: 'a_pr04', note: 'plán 2027 — samice cykluje' }], notes: 'PR-04 het Pied × PR-03 vizuální Pied → 50 % vizuální Pied.' },
  ];
  db.geneticsSaved = [
    { id: 'gs1', t: d(-20), a: { name: 'PR-01 Clown', genes: [['Clown', 'visual']] }, b: { name: 'PR-02 Pastel het Clown', genes: [['Pastel', 'het'], ['Clown', 'het']] } },
  ];
  db.documents = [
    { id: 'doc1', name: 'CITES — Furcifer pardalis (FP-01..03)', kind: 'CITES', date: d(-300), animal: 'a_fp01', size: '220 KB' },
    { id: 'doc2', name: 'Nákupní faktura — skupina AZ-01', kind: 'Faktura', date: d(-1180), animal: 'a_az01', size: '96 KB' },
    { id: 'doc3', name: 'Laboratorní zpráva 26-0917 (MSP-04)', kind: 'Laboratoř', date: d(-12), animal: 'a_msp04', size: '140 KB' },
    { id: 'doc4', name: 'Chovatelská evidence 2026 (export)', kind: 'Evidence', date: d(-3), size: '58 KB' },
    { id: 'doc5', name: 'Kupní smlouva — FP-03 (rezervace)', kind: 'Smlouva', date: d(-19), animal: 'a_fp03', size: '74 KB' },
  ];
  db.recent = { animals: ['a_az01', 'a_pr02', 'a_cc01', 'a_msp04', 'a_fp01'], enclosures: ['e_inc', 'e_fw1', 'e_ch1'] };
  db.favorites = db.animals.filter((a) => a.favorite).map((a) => a.id);

  // weight history (monthly) for individuals
  for (const a of db.animals) {
    if (a.kind !== 'individual' || !a.weightG) continue;
    const pts = Math.min(12, Math.max(2, Math.floor((T0 - a.born) / (30 * DAY))));
    for (let k = pts; k >= 1; k--) {
      const t = T0 - k * 30 * DAY - 2 * DAY;
      const growth = a.born > T0 - 400 * DAY ? Math.pow(1 - k / (pts + 1), 1.4) : 0.85 + 0.15 * (1 - k / pts);
      const w = +(a.weightG * growth * (0.96 + R() * 0.06)).toFixed(a.weightG < 20 ? 1 : 0);
      db.records.push({ id: `r_w_${a.id}_${k}`, t: t + 20 * HOUR, type: 'weight', subject: a.id, data: { g: Math.max(0.5, w) }, source: 'history' });
    }
  }
  // shed history
  for (const [id, days] of [['a_as01', 3], ['a_msp02', 20], ['a_pl01', 12], ['a_pr01', 26], ['a_cc01', 9]]) db.records.push({ id: `r_shed_${id}`, t: d(-days, 8), type: 'shed', subject: id, data: { complete: id !== 'a_as01', note: id === 'a_as01' ? 'Zadržená oční čepička' : id === 'a_pr02' ? 'Předsnůškový svlek?' : '' }, source: 'history' });
  // reproduction & health records into history (single activity log)
  for (const cy of db.cycles) for (const e of cy.events) db.records.push({ id: `r_${cy.id}_${e.t}`, t: e.t, type: 'repro', subject: cy.female, data: { cycle: cy.id, kind: e.type, label: e.label }, source: 'history' });
  for (const h of db.health) db.records.push({ id: `r_${h.id}`, t: h.t, type: 'health', subject: h.animal, data: { health: h.id, title: h.title, severity: h.severity }, source: 'history' });
  return db;
}

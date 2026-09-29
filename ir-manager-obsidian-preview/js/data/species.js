// Species catalogue. Latin name is primary; common/Czech names are secondary.
// Biological ranges are typical literature/keeper values shown as RANGES with their basis — never as certainty.
export const SPECIES = {
  'dendrobates-tinctorius-azureus': {
    latin: 'Dendrobates tinctorius', ssp: '“azureus”', common: 'Pralesnička azurová', cz: 'Pralesnička azurová', cls: 'Amphibia', order: 'Anura', family: 'Dendrobatidae',
    group: true, img: 'dendrobates-tinctorius-azureus', tint: '#3f86e8',
    env: { day: [24, 26], night: [20, 22], rh: [80, 100], uvb: 'Ferguson zone 1' },
    feeding: { feeder: 'Drosophila hydei', every: 1, time: [18, 0], qty: '1 dávka kultury', rotation: ['Dendrocare', 'Calcium + D3', 'Dendrocare', 'Multivit', 'Dendrocare', 'Včelí pyl'] },
    repro: { kind: 'eggs', clutch: [4, 8], develop: [12, 16], tadpole: [65, 90], note: 'Vývoj vajec 12–16 dní při 22–24 °C; pulec do metamorfózy ~65–90 dní.' },
  },
  'dendrobates-leucomelas': {
    latin: 'Dendrobates leucomelas', common: 'Pralesnička žlutopásá', cz: 'Pralesnička žlutopásá', cls: 'Amphibia', order: 'Anura', family: 'Dendrobatidae',
    group: true, img: 'dendrobates-leucomelas', tint: '#f0c020',
    env: { day: [24, 27], night: [20, 22], rh: [80, 100], uvb: 'Ferguson zone 1' },
    feeding: { feeder: 'Drosophila hydei', every: 1, time: [18, 0], qty: '1 dávka kultury', rotation: ['Dendrocare', 'Calcium + D3', 'Dendrocare', 'Multivit', 'Dendrocare', 'Včelí pyl'] },
    repro: { kind: 'eggs', clutch: [4, 10], develop: [12, 18], tadpole: [60, 90], note: 'Vývoj vajec 12–18 dní; pulec do žabky ~60–90 dní (dle teploty).' },
  },
  'correlophus-ciliatus': {
    latin: 'Correlophus ciliatus', common: 'Pagekon řasnatý', cz: 'Pagekon řasnatý', cls: 'Reptilia', order: 'Squamata', family: 'Diplodactylidae',
    img: 'correlophus-ciliatus', tint: '#d9822f',
    env: { day: [22, 26], night: [18, 22], rh: [60, 80], uvb: 'Ferguson zone 1–2' },
    feeding: { feeder: 'CGD (kompletní krmivo)', every: 2, time: [19, 30], qty: '1 miska', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [2, 2], incubation: [60, 90], temp: '22–25 °C', note: 'Typická inkubace 60–90 dní při 22–25 °C; chladněji = déle.' },
  },
  'furcifer-pardalis': {
    latin: 'Furcifer pardalis', common: 'Chameleon pardálí', cz: 'Chameleon pardálí', cls: 'Reptilia', order: 'Squamata', family: 'Chamaeleonidae',
    img: 'furcifer-pardalis', tint: '#c63c2a',
    env: { day: [26, 30], basking: [32, 35], night: [18, 21], rh: [50, 80], uvb: 'Ferguson zone 3' },
    feeding: { feeder: 'Dubia (M)', every: 2, time: [10, 0], qty: '4 ks', rotation: ['Calcium + D3', 'Calcium + D3', 'Multivit'] },
    repro: { kind: 'eggs', clutch: [10, 40], incubation: [180, 270], temp: '24–27 °C', note: 'Inkubace obvykle 6–9 měsíců; silně závisí na teplotě.' },
  },
  'morelia-spilota': {
    latin: 'Morelia spilota', common: 'Krajta kobercová', cz: 'Krajta kobercová', cls: 'Reptilia', order: 'Squamata', family: 'Pythonidae',
    img: 'morelia-spilota', tint: '#9a8a3a',
    env: { day: [26, 30], basking: [32, 34], night: [22, 24], rh: [50, 70], uvb: 'Ferguson zone 2' },
    feeding: { feeder: 'Potkan (odstav, mraž.)', every: 14, time: [19, 0], qty: '1 ks', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [10, 25], incubation: [52, 60], temp: '31–32 °C', note: 'Typická inkubace 52–60 dní při 31–32 °C (samicí nebo umělá).' },
  },
  'python-regius': {
    latin: 'Python regius', common: 'Krajta královská', cz: 'Krajta královská', cls: 'Reptilia', order: 'Squamata', family: 'Pythonidae',
    img: 'python-regius', tint: '#b88838',
    env: { day: [28, 30], basking: [31, 33], night: [24, 26], rh: [55, 70] },
    feeding: { feeder: 'Myš (adult, mraž.)', every: 10, time: [19, 0], qty: '1 ks', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [4, 10], incubation: [55, 60], temp: '31.5–32 °C', preLayShed: [18, 25], layAfterShed: [25, 35], note: 'Ovulation → pre-lay shed ~18–25 d; laying ~25–35 d after the shed; incubation 55–60 d at 31.5–32 °C.' },
  },
  'atheris-squamigera': {
    latin: 'Atheris squamigera', common: 'Křovinář proměnlivý', cz: 'Křovinář proměnlivý', cls: 'Reptilia', order: 'Squamata', family: 'Viperidae',
    img: 'atheris-squamigera', tint: '#4f9a34', venomous: true,
    env: { day: [24, 27], night: [20, 22], rh: [70, 90] },
    feeding: { feeder: 'Myš (fuzzy, mraž.)', every: 10, time: [20, 0], qty: '1 ks', rotation: ['—'] },
    repro: { kind: 'live', gestation: [90, 110], note: 'Živorodá — březost se výrazně liší.' },
  },
  'pantherophis-obsoletus-lindheimeri': {
    latin: 'Pantherophis obsoletus', ssp: 'lindheimeri', common: 'Užovka texaská', cz: 'Užovka texaská', cls: 'Reptilia', order: 'Squamata', family: 'Colubridae',
    img: 'pantherophis-obsoletus-lindheimeri', tint: '#8a8472',
    env: { day: [25, 28], basking: [30, 31], night: [20, 23], rh: [40, 60], brumation: [10, 14] },
    feeding: { feeder: 'Myš (adult, mraž.)', every: 7, time: [19, 0], qty: '1 ks', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [8, 20], incubation: [55, 65], temp: '27–29 °C', brumation: [60, 90], note: 'Brumace 8–12 týdnů při 10–14 °C; inkubace 55–65 dní při 27–29 °C.' },
  },
};
export const speciesOf = (a) => SPECIES[a?.species] || null;
export const latin = (sp) => (sp ? `${sp.latin}${sp.ssp ? ` ${sp.ssp}` : ''}` : '');
export const imgFor = (a) => { const sp = speciesOf(a); if (!sp) return 'assets/img/kpi/clutch-python.webp'; const v = ((a.imgVariant ?? (hash(a.id) % 6)) % 6) + 1; return `assets/img/species/${sp.img}-${v}.webp`; };
export const macroFor = (key) => `assets/img/species/${SPECIES[key]?.img || key}-macro.webp`;
export function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const SUPPLEMENTS = {
  'Dendrocare': { color: '#d9822f', img: 'jar-dendrocare', kind: 'vitamíny · minerály' },
  'Calcium + D3': { color: '#2f6fb3', img: 'jar-calcium', kind: 'vápník' },
  'Multivit': { color: '#6b4fa3', img: 'jar-multivit', kind: 'multivitamín' },
  'Včelí pyl': { color: '#c9a227', img: 'jar-pollen', kind: 'karotenoidy' },
};

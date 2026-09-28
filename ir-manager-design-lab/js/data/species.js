// Species catalogue. Latin name is primary; common/Czech names are secondary.
// Biological ranges are typical literature/keeper values shown as RANGES with their basis — never as certainty.
export const SPECIES = {
  'dendrobates-tinctorius-azureus': {
    latin: 'Dendrobates tinctorius', ssp: '“azureus”', common: 'Blue poison dart frog', cz: 'Pralesnička azurová', cls: 'Amphibia', order: 'Anura', family: 'Dendrobatidae',
    group: true, img: 'dendrobates-tinctorius-azureus', tint: '#3f86e8',
    env: { day: [24, 26], night: [20, 22], rh: [80, 100], uvb: 'Ferguson zone 1' },
    feeding: { feeder: 'Drosophila hydei', every: 1, time: [18, 0], qty: '1 culture shake', rotation: ['Dendrocare', 'Calcium D3', 'Dendrocare', 'Multivit', 'Dendrocare', 'Bee pollen'] },
    repro: { kind: 'eggs', clutch: [4, 8], develop: [12, 16], tadpole: [65, 90], note: 'Egg development 12–16 d at 22–24 °C; tadpole to metamorphosis ~65–90 d.' },
  },
  'dendrobates-leucomelas': {
    latin: 'Dendrobates leucomelas', common: 'Yellow-banded poison dart frog', cz: 'Pralesnička žlutopásá', cls: 'Amphibia', order: 'Anura', family: 'Dendrobatidae',
    group: true, img: 'dendrobates-leucomelas', tint: '#f0c020',
    env: { day: [24, 27], night: [20, 22], rh: [80, 100], uvb: 'Ferguson zone 1' },
    feeding: { feeder: 'Drosophila hydei', every: 1, time: [18, 0], qty: '1 culture shake', rotation: ['Dendrocare', 'Calcium D3', 'Dendrocare', 'Multivit', 'Dendrocare', 'Bee pollen'] },
    repro: { kind: 'eggs', clutch: [4, 10], develop: [12, 18], tadpole: [60, 90], note: 'Egg development 12–18 d; tadpole to froglet ~60–90 d (temperature dependent).' },
  },
  'correlophus-ciliatus': {
    latin: 'Correlophus ciliatus', common: 'Crested gecko', cz: 'Gekon řasnatý', cls: 'Reptilia', order: 'Squamata', family: 'Diplodactylidae',
    img: 'correlophus-ciliatus', tint: '#d9822f',
    env: { day: [22, 26], night: [18, 22], rh: [60, 80], uvb: 'Ferguson zone 1–2' },
    feeding: { feeder: 'CGD (complete diet)', every: 2, time: [19, 30], qty: '1 dish', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [2, 2], incubation: [60, 90], temp: '22–25 °C', note: 'Typical incubation 60–90 d at 22–25 °C; cooler = longer.' },
  },
  'furcifer-pardalis': {
    latin: 'Furcifer pardalis', common: 'Panther chameleon', cz: 'Chameleon pardálí', cls: 'Reptilia', order: 'Squamata', family: 'Chamaeleonidae',
    img: 'furcifer-pardalis', tint: '#c63c2a',
    env: { day: [26, 30], basking: [32, 35], night: [18, 21], rh: [50, 80], uvb: 'Ferguson zone 3' },
    feeding: { feeder: 'Dubia roach (M)', every: 2, time: [10, 0], qty: '4 pcs', rotation: ['Calcium D3', 'Calcium D3', 'Multivit'] },
    repro: { kind: 'eggs', clutch: [10, 40], incubation: [180, 270], temp: '24–27 °C', note: 'Incubation commonly 6–9 months; strongly temperature dependent.' },
  },
  'morelia-spilota': {
    latin: 'Morelia spilota', common: 'Carpet python', cz: 'Krajta kobercová', cls: 'Reptilia', order: 'Squamata', family: 'Pythonidae',
    img: 'morelia-spilota', tint: '#9a8a3a',
    env: { day: [26, 30], basking: [32, 34], night: [22, 24], rh: [50, 70], uvb: 'Ferguson zone 2' },
    feeding: { feeder: 'Rat (weaned, F/T)', every: 14, time: [19, 0], qty: '1 pc', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [10, 25], incubation: [52, 60], temp: '31–32 °C', note: 'Typical incubation 52–60 d at 31–32 °C (maternal or artificial).' },
  },
  'python-regius': {
    latin: 'Python regius', common: 'Ball python', cz: 'Krajta královská', cls: 'Reptilia', order: 'Squamata', family: 'Pythonidae',
    img: 'python-regius', tint: '#b88838',
    env: { day: [28, 30], basking: [31, 33], night: [24, 26], rh: [55, 70] },
    feeding: { feeder: 'Mouse (adult, F/T)', every: 10, time: [19, 0], qty: '1 pc', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [4, 10], incubation: [55, 60], temp: '31.5–32 °C', preLayShed: [18, 25], layAfterShed: [25, 35], note: 'Ovulation → pre-lay shed ~18–25 d; laying ~25–35 d after the shed; incubation 55–60 d at 31.5–32 °C.' },
  },
  'atheris-squamigera': {
    latin: 'Atheris squamigera', common: 'Variable bush viper', cz: 'Zmije křovinná', cls: 'Reptilia', order: 'Squamata', family: 'Viperidae',
    img: 'atheris-squamigera', tint: '#4f9a34', venomous: true,
    env: { day: [24, 27], night: [20, 22], rh: [70, 90] },
    feeding: { feeder: 'Mouse (fuzzy, F/T)', every: 10, time: [20, 0], qty: '1 pc', rotation: ['—'] },
    repro: { kind: 'live', gestation: [90, 110], note: 'Viviparous — live birth; gestation varies widely.' },
  },
  'pantherophis-obsoletus-lindheimeri': {
    latin: 'Pantherophis obsoletus', ssp: 'lindheimeri', common: 'Texas rat snake', cz: 'Užovka texaská', cls: 'Reptilia', order: 'Squamata', family: 'Colubridae',
    img: 'pantherophis-obsoletus-lindheimeri', tint: '#8a8472',
    env: { day: [25, 28], basking: [30, 31], night: [20, 23], rh: [40, 60], brumation: [10, 14] },
    feeding: { feeder: 'Mouse (adult, F/T)', every: 7, time: [19, 0], qty: '1 pc', rotation: ['—'] },
    repro: { kind: 'eggs', clutch: [8, 20], incubation: [55, 65], temp: '27–29 °C', brumation: [60, 90], note: 'Brumation 8–12 weeks at 10–14 °C; incubation 55–65 d at 27–29 °C.' },
  },
};
export const speciesOf = (a) => SPECIES[a?.species] || null;
export const latin = (sp) => (sp ? `${sp.latin}${sp.ssp ? ` ${sp.ssp}` : ''}` : '');
export const imgFor = (a) => { const sp = speciesOf(a); if (!sp) return 'assets/img/kpi/clutch-python.webp'; const v = ((a.imgVariant ?? (hash(a.id) % 6)) % 6) + 1; return `assets/img/species/${sp.img}-${v}.webp`; };
export const macroFor = (key) => `assets/img/species/${SPECIES[key]?.img || key}-macro.webp`;
export function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const SUPPLEMENTS = {
  'Dendrocare': { color: '#d9822f', img: 'jar-dendrocare', kind: 'vitamin · mineral' },
  'Calcium D3': { color: '#2f6fb3', img: 'jar-calcium', kind: 'calcium' },
  'Multivit': { color: '#6b4fa3', img: 'jar-multivit', kind: 'multivitamin' },
  'Bee pollen': { color: '#c9a227', img: 'jar-pollen', kind: 'carotenoids' },
};

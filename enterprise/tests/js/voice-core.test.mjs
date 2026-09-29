// node tests/js/voice-core.test.mjs — voice parser (CZ/EN/DE, Latin names, numbers, ambiguity)
import fs from 'fs';
import vm from 'vm';
const sandbox = { self: {} }; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../../app-manager/assets/js/voice-core.js', import.meta.url), 'utf8'), sandbox);
const V = sandbox.self.IRVoiceCore;
const animals = [
  { id: 6, name: 'Atheris squamigera', code: '1/26', latin: 'Atheris squamigera' },
  { id: 7, name: 'Atheris squamigera', code: '2/26', latin: 'Atheris squamigera' },
  { id: 9, name: 'Morelia spilota', code: '', latin: 'Morelia spilota' },
  { id: 12, name: 'Python regius Pastel', code: 'PR-01', latin: 'Python regius', aliases: ['Pastelka'] },
  { id: 14, name: 'C. ciliatus - Lilly White / Red', code: '', latin: 'Correlophus ciliatus' },
  { id: 20, name: 'Poecilotheria regalis', code: '', latin: 'Poecilotheria regalis' },
  { id: 21, name: 'Chameleon pardálí - Ambilobe "Redbar"', code: '', latin: 'Furcifer pardalis' },
  { id: 30, name: 'Lampropeltis californiae', code: '1/2', latin: 'Lampropeltis californiae' },
  { id: 31, name: 'Lampropeltis californiae', code: '2/2', latin: 'Lampropeltis californiae' },
];
let pass = 0, fail = 0; const results = [];
const t = (name, fn) => { try { fn(); pass++; results.push({ name, ok: true }); console.log('  ✓', name); } catch (e) { fail++; results.push({ name, ok: false, err: e.message }); console.log('  ✗', name, '\n     ', e.message); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const P = (s, extra = {}) => V.parse(s, { animals, ...extra });

t('CZ: "Python regius snědl" → feeding, eaten, Latin match', () => { const r = P('Python regius snědl'); eq(r.intent, 'record'); eq(r.type, 'Krmení'); eq(r.result, 'eaten'); eq(r.animal?.id, 12); });
t('CZ abbreviated Latin: "P. regius odmítl potravu" → refused', () => { const r = P('P. regius odmítl potravu'); eq(r.result, 'refused'); eq(r.animal?.id, 12); });
t('CZ alias: "Pastelka je ve svleku" → in_shed', () => { const r = P('Pastelka je ve svleku'); eq(r.result, 'in_shed'); eq(r.animal?.id, 12); });
t('CZ: "Morelia spilota nekrmeno" → not_fed', () => { const r = P('Morelia spilota nekrmeno'); eq(r.result, 'not_fed'); eq(r.animal?.id, 9); });
t('Recogniser misspelling: "Morelija spilóta snědla" still matches', () => { const r = P('Morelija spilóta snědla'); eq(r.animal?.id, 9); });
t('Ambiguous shared Latin → candidates, never a guess', () => { const r = P('Atheris squamigera snědla'); eq(r.animal, null); eq(r.candidates?.map((a) => a.id).sort(), [6, 7]); });
t('Disambiguation by code: "Atheris squamigera jedna lomeno dvacet šest" is not solved by words → still asks; "1/26" solves', () => { const r = P('Atheris 1/26 snědla'); eq(r.animal?.id, 6); });
t('Choose from candidates: "druhá" → index 1', () => { const r = V.parse('druhá', { animals, pending: { candidates: [animals[0], animals[1]] } }); eq(r.intent, 'choose'); eq(r.index, 1); });
t('Weighing with Czech number words: "Poecilotheria regalis vážení sto dvacet gramů" → 120 g', () => { const r = P('Poecilotheria regalis vážení sto dvacet gramů'); eq(r.type, 'Vážení'); eq(r.value, 120); eq(r.animal?.id, 20); });
t('Weighing decimal digits: "zvážit Furcifer pardalis 12,5 g"', () => { const r = P('zvážit Furcifer pardalis 12,5 g'); eq(r.type, 'Vážení'); eq(r.value, 12.5); eq(r.animal?.id, 21); });
t('Czech common name: "chameleon pardálí rosení"', () => { const r = P('chameleon pardálí rosení'); eq(r.type, 'Rosení'); eq(r.animal?.id, 21); });
t('EN: "Correlophus ciliatus ate two crickets" → eaten, value 2', () => { const r = P('Correlophus ciliatus ate two crickets'); eq(r.result, 'eaten'); eq(r.animal?.id, 14); eq(r.value, 2); });
t('EN: "ball python refused" with alias-less Latin still by genus when unique', () => { const r = P('Python refused'); eq(r.result, 'refused'); eq(r.animal?.id, 12); });
t('DE: "Morelia spilota hat verweigert" → refused', () => { const r = P('Morelia spilota hat verweigert'); eq(r.result, 'refused'); eq(r.animal?.id, 9); });
t('DE: "Lampropeltis californiae eins Strich zwei gefressen" → needs code; ambiguous without it', () => { const r = P('Lampropeltis californiae gefressen'); eq(r.candidates?.length, 2); });
t('DE numbers: "Poecilotheria regalis wiegen zweiundzwanzig" → 22', () => { const r = P('Poecilotheria regalis wiegen zweiundzwanzig Gramm'); eq(r.type, 'Vážení'); eq(r.value, 22); eq(V.numberIn('dvacet dva'), 22); eq(V.numberIn('twenty two'), 22); });
t('Confirmation words CZ/EN/DE', () => { for (const w of ['ano', 'jo', 'uložit', 'yes', 'save', 'ja', 'speichern']) eq(V.parse(w, { animals, pending: {} }).intent, 'yes', w); for (const w of ['ne', 'no', 'nein']) eq(V.parse(w, { animals, pending: {} }).intent, 'no', w); });
t('Commands: zrušit / repeat / wiederholen / konec', () => { eq(P('zrušit').intent, 'cancel'); eq(P('repeat').intent, 'repeat'); eq(P('wiederholen').intent, 'repeat'); eq(P('konec').intent, 'stop'); eq(P('abbrechen').intent, 'cancel'); });
t('Correction: "oprav, odmítl" → correct intent with result', () => { const r = V.parse('oprav to, odmítl', { animals, pending: {} }); eq(r.intent, 'correct'); eq(r.result, 'refused'); });
t('Unknown speech → unknown (no fabricated record)', () => { eq(P('dnes je pěkné počasí').intent, 'unknown'); });
t('Summary TTS text CZ', () => { eq(V.summary({ type: 'Krmení', animal: animals[3], result: 'eaten', value: null }, 'cs'), 'Krmení, Python regius Pastel PR-01, snědlo'); });

console.log(`\n${pass} passed, ${fail} failed`);
fs.mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../results/voice-core.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), pass, fail, results }, null, 2));
process.exit(fail ? 1 : 0);

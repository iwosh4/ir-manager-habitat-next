(()=>{const root=document.querySelector('[data-voice-workbench]');if(!root)return;
const q=s=>root.querySelector(s),animals=JSON.parse(document.getElementById('voice-animals')?.textContent||'[]'),Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,on=false,wake=null,restart=0;const contextAnimalId=Number(root.dataset.contextAnimal||0)||0;
const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9\s.-]/g,' ').replace(/\s+/g,' ').trim();
const phonetic=s=>norm(s).replace(/ph/g,'f').replace(/th/g,'t').replace(/ae|oe/g,'e').replace(/qu/g,'kv').replace(/x/g,'ks').replace(/y/g,'i').replace(/w/g,'v').replace(/c(?=[aou])/g,'k').replace(/gg/g,'g');
const status=t=>q('[data-voice-status]').textContent=t;
const distance=(a,b)=>{a=norm(a);b=norm(b);if(!a||!b)return 99;const m=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length];};
const similarity=(a,b)=>{const an=norm(a),bn=norm(b),ap=phonetic(a),bp=phonetic(b);if(!an||!bn)return 0;if(an.includes(bn)||bn.includes(an))return .98;const raw=1-distance(an,bn)/Math.max(an.length,bn.length,1),phon=1-distance(ap,bp)/Math.max(ap.length,bp.length,1);return Math.max(raw,phon)};
const aliases=a=>{const vals=[a.animal_id,a.jmeno_kod,a.latinsky_nazev,a.druh,...(a.voice_aliases||[])].filter(Boolean).flatMap(v=>[norm(v),phonetic(v)]),latin=norm(a.latinsky_nazev||'');if(latin){const parts=latin.split(' ');if(parts.length>1){vals.push(parts[0]+' '+parts[1],parts[0][0]+' '+parts[1],parts[1],phonetic(parts[0]+' '+parts[1]),phonetic(parts[1]));}}return [...new Set(vals.filter(v=>v.length>1))];};
const stop=async()=>{on=false;clearTimeout(restart);try{rec?.abort()}catch{}try{await wake?.release()}catch{}wake=null;q('[data-voice-toggle]').textContent='Zapnout mikrofon';};
const actionRules=[
 ['Odmítnutí potravy',/\b(odmitl|odmitla|odmitnuti|neprijal|neprijala|nezral|nezrala|nechce zrat|nevzal potravu|refused|refuse|verweigert)\b/],
 ['Vážení',/\b(vazi|vaha|zvaz|zvazit|hmotnost|navazeno|weigh|weight|gewicht)\b/],
 ['Výměna vody',/\b(vymena vody|vymenit vodu|vymenil vodu|vymenena voda|nova voda|water change|wasserwechsel)\b/],
 ['Čištění',/\b(cisteni|vycistit|vycisteno|uklid|uklizeno|udrzba|clean|reinig)\b/],
 ['Svlek',/\b(svlek|svlekla|svlekl|svleceno|svlek v poradku|shed|shedding|haut)\b/],
 ['Rosení',/\b(roseni|oroseno|rosit|porosit|mlzeni|zamlzeno|mist|misting|spruh)\b/],
 ['Zdravotní kontrola',/\b(zdravi|kontrola zdravi|zdravotni kontrola|prohlidka|veterina|health check|gesundheitskontrolle)\b/],
 ['Krmení',/\b(nakrmen|nakrmit|nakrmil|nakrmila|krmeni|dostal potravu|sezral|sezrala|snedl|snedla|prijal potravu|vzal potravu|fed|feeding|futter|gefuttert)\b/]
];
const pickAnimal=text=>{const n=norm(text),words=n.split(' ');const scored=animals.map(a=>{let best=0;for(const alias of aliases(a)){if(n.includes(alias))best=Math.max(best,100+alias.length);for(let size=Math.min(4,words.length);size>=1;size--){for(let i=0;i<=words.length-size;i++){const chunk=words.slice(i,i+size).join(' '),sim=similarity(alias,chunk);if(sim>.72)best=Math.max(best,Math.round(sim*80)+alias.length);}}}if(new RegExp('\\bid\\s*'+a.id+'\\b').test(n))best=250;return[a,best]}).filter(x=>x[1]>=55).sort((a,b)=>b[1]-a[1]);return scored;};
const extractValue=text=>{let t=text.trim();const nums={jeden:'1',jedna:'1',jedno:'1',jednim:'1',jedním:'1',dva:'2',dve:'2',dvě:'2',tri:'3',tři:'3',ctyri:'4',čtyři:'4',pet:'5',pět:'5'};for(const[k,v]of Object.entries(nums))t=t.replace(new RegExp('\\b'+k+'\\b','giu'),v);
 let m=t.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gramu|gram|gramů|kg)\b/i);if(m)return m[1].replace(',','.')+' '+m[2];
 m=t.match(/\b(\d+)\s*(?:x|ks|kusy?|kusu)?\s*(mys(?:i|í)?|holatko|holátko|holatka|holátka|cvrcek|cvrčci|cvrcku|svab|šváb|svabi|švábi|saranče|drosophila|mouse|mice|rat)\b/i);if(m)return (m[1]||'1')+'× '+m[2];
 m=t.match(/\b(mys(?:i|í)?|holatko|holátko|cvrcek|cvrčci|svab|šváb|saranče|drosophila|mouse|mice|rat)\b/i);if(m)return m[1];
 return '';
};
const parse=text=>{const n=norm(text);let type='Poznámka';for(const [t,re] of actionRules)if(re.test(n)){type=t;break}
 const scored=pickAnimal(text),sel=q('[data-voice-animal]');sel.replaceChildren(new Option('Vyber zvíře',''));
 for(const [a] of scored.length?scored:animals)sel.add(new Option(`${a.latinsky_nazev||a.druh} · ${a.jmeno_kod||a.animal_id||'#'+a.id}`,a.id));
 if(scored.length&&(!scored[1]||scored[0][1]-scored[1][1]>=8))sel.value=scored[0][0].id;
 else if(contextAnimalId&&animals.some(a=>Number(a.id)===contextAnimalId))sel.value=String(contextAnimalId);
 const form=q('[data-voice-form]');form.elements.type.value=type;form.elements.value.value=extractValue(text);form.elements.detail.value=text.trim();form.hidden=false;
 status(sel.value?'Návrh připraven. Zkontroluj údaje a potvrď uložení.':'Návrh připraven. Vyber zvíře; latinský název nebyl rozpoznán jednoznačně.');
};
const start=async()=>{if(!Rec){status('Rozpoznávání řeči tento prohlížeč nepodporuje. Přepis můžeš napsat ručně.');return}on=true;q('[data-voice-toggle]').textContent='Vypnout mikrofon';try{wake=await navigator.wakeLock?.request('screen')}catch{}
 if(!rec){rec=new Rec();rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=5;rec.onresult=e=>{let f='',i='';for(let x=e.resultIndex;x<e.results.length;x++){const result=e.results[x],t=[...result].map(r=>r.transcript).sort((a,b)=>pickAnimal(b)[0]?.[1]-pickAnimal(a)[0]?.[1])[0]||result[0]?.transcript||'';result.isFinal?f+=t:i+=t}q('[data-voice-text]').value=f||i;if(f){const n=norm(f).trim();if(/^(ulozit|potvrdit|save|confirm)$/.test(n)&&!q('[data-voice-form]').hidden)q('[data-voice-form]').requestSubmit();else if(/^(zrusit|cancel)$/.test(n)){q('[data-voice-form]').hidden=true;status('Návrh zrušen.')}else parse(f)}};
 rec.onend=()=>{if(on&&!document.hidden)restart=setTimeout(()=>{try{rec.start()}catch{}},450)};rec.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture'].includes(e.error)){stop();status('Mikrofon není dostupný nebo nebyl povolen.')}}}
 rec.lang=q('[data-voice-lang]').value;try{rec.start();status('Poslouchám… řekni zvíře, akci a hodnotu.')}catch{}};
q('[data-voice-toggle]').onclick=()=>on?stop():start();q('[data-voice-parse]').onclick=()=>parse(q('[data-voice-text]').value);q('[data-voice-lang]').onchange=()=>{if(on){try{rec.abort()}catch{}}};
root.querySelectorAll('[data-voice-example]').forEach(b=>b.onclick=()=>{q('[data-voice-text]').value=b.dataset.voiceExample;parse(b.dataset.voiceExample)});
q('[data-voice-cancel]').onclick=()=>{q('[data-voice-form]').hidden=true;status('Návrh zrušen.')};
q('[data-voice-alias-save]')?.addEventListener('click',async()=>{const aid=q('[data-voice-alias-animal]').value,alias=q('[data-voice-alias]').value.trim();if(!aid||!alias){status('Vyber zvíře a napiš výslovnost, kterou mikrofon používá.');return;}const body=new FormData();body.set('_csrf',q('[data-voice-form] input[name="_csrf"]').value);body.set('action','alias');body.set('animal_id',aid);body.set('alias',alias);try{const r=await fetch('voice.php',{method:'POST',body,headers:{Accept:'application/json'}}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Alias se nepodařilo uložit.');const animal=animals.find(a=>String(a.id)===String(aid));if(animal){animal.voice_aliases=animal.voice_aliases||[];animal.voice_aliases.push(alias);}q('[data-voice-alias]').value='';status('Výslovnost uložena. Asistent ji použije při dalším příkazu.');}catch(err){status(err.message);}});
q('[data-voice-form]').onsubmit=async e=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;status('Ukládám…');try{const r=await fetch('voice.php',{method:'POST',body:new FormData(e.currentTarget),headers:{Accept:'application/json'}}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Zápis selhal.');q('[data-voice-history]').prepend(Object.assign(document.createElement('div'),{textContent:j.message}));q('[data-voice-form]').hidden=true;q('[data-voice-text]').value='';status(j.message+' Můžeš pokračovat.')}catch(err){status(err.message)}};

const initContext=()=>{if(!contextAnimalId)return;const a=animals.find(x=>Number(x.id)===contextAnimalId);if(!a)return;const sel=q('[data-voice-animal]');if(sel){sel.replaceChildren(new Option(`${a.latinsky_nazev||a.druh} · ${a.jmeno_kod||a.animal_id||'#'+a.id}`,a.id));sel.value=String(a.id);}const aliasSel=q('[data-voice-alias-animal]');if(aliasSel)aliasSel.value=String(a.id);};
initContext();
document.addEventListener('visibilitychange',()=>{if(document.hidden){try{rec?.abort()}catch{};wake?.release?.()}else if(on)start()});window.addEventListener('pagehide',stop)})();
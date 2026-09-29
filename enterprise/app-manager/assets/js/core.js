(() => {
  const sidebar = document.querySelector('[data-sidebar]');
  document.querySelectorAll('.nav-expand').forEach(button=>button.addEventListener('click',()=>{const open=button.closest('.nav-group').classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));}));
  sidebar?.addEventListener('focusin',e=>{if(e.target.matches(':focus-visible'))sidebar.classList.add('is-pinned');});
  sidebar?.addEventListener('focusout',e=>{if(!sidebar.contains(e.relatedTarget))sidebar.classList.remove('is-pinned');});
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
})();

;(() => {
  const hpToggle = document.querySelector('[data-header-profile-toggle]');
  const hpMenu = document.querySelector('[data-header-profile-menu]');
  const setHeaderProfileOpen = open => { if (!hpMenu) return; hpMenu.hidden = !open; hpToggle?.setAttribute('aria-expanded', String(open)); };
  hpToggle?.addEventListener('click', e => { e.stopPropagation(); setHeaderProfileOpen(hpMenu?.hidden ?? true); });
  document.addEventListener('click', e => { if (hpMenu && !hpMenu.hidden && !e.target.closest('.header-profile-wrap')) setHeaderProfileOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && hpMenu) setHeaderProfileOpen(false); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); document.querySelector('.global-search input')?.focus(); } });

  const list = document.querySelector('[data-animal-list]');
  const filter = document.querySelector('[data-animal-filter]');
  const count = document.querySelector('[data-selection-count]');
  const boxes = () => [...document.querySelectorAll('input[name="animals[]"]')];
  const refreshCount = () => { if (count) count.textContent = boxes().filter(x=>x.checked).length + ' vybráno'; };
  boxes().forEach(x=>x.addEventListener('change',refreshCount)); refreshCount();
  document.querySelector('[data-select-all]')?.addEventListener('click',()=>{ boxes().filter(x=>!x.closest('.select-animal')?.hidden).forEach(x=>x.checked=true);refreshCount(); });
  document.querySelector('[data-select-none]')?.addEventListener('click',()=>{ boxes().forEach(x=>x.checked=false);refreshCount(); });
  filter?.addEventListener('input',()=>{ const q=filter.value.trim().toLowerCase(); list?.querySelectorAll('.select-animal').forEach(el=>{ el.hidden=q!=='' && !(el.dataset.filterText||'').includes(q); }); });

  const startScan = document.querySelector('[data-start-scan]');
  const video = document.querySelector('[data-qr-video]');
  const status = document.querySelector('[data-qr-status]');
  let stream=null, timer=null;
  startScan?.addEventListener('click', async () => {
    if (!video) return;
    if (!('BarcodeDetector' in window)) { if (status) status.textContent='Tento prohlížeč nepodporuje BarcodeDetector. Použij ruční pole.'; return; }
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) throw new Error('QR není podporováno');
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      video.srcObject=stream; const detector=new BarcodeDetector({formats:['qr_code']}); if(status)status.textContent='Míř na QR kód.';
      const tick=async()=>{ try{ const codes=await detector.detect(video); if(codes[0]?.rawValue){ clearInterval(timer); stream?.getTracks().forEach(t=>t.stop()); const raw=codes[0].rawValue; if(/^https?:\/\//i.test(raw)) location.href=raw; else location.href='scan.php?code='+encodeURIComponent(raw); }}catch{} };
      timer=setInterval(tick,450);
    } catch(e) { if(status)status.textContent='Kameru se nepodařilo spustit. Použij ruční pole.'; }
  });
})();


;(() => {
  let installPrompt = null;
  const buttons = [...document.querySelectorAll('[data-pwa-install]')];
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const refresh = () => buttons.forEach(button => {
    const status=button.querySelector('[data-pwa-install-status]');
    button.classList.toggle('is-installed',installed());
    button.classList.toggle('is-ready',!!installPrompt);
    if(installed()){ if(status) status.textContent='IR Manager je nainstalovaný jako aplikace.'; button.disabled=true; }
    else if(installPrompt){ if(status) status.textContent='PWA je připravena k instalaci na toto zařízení.'; button.disabled=false; }
    else { if(status) status.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)?'Safari: Sdílet → Přidat na plochu.':'Použij tlačítko nebo volbu Nainstalovat aplikaci v prohlížeči.'; }
  });
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refresh();});
  addEventListener('appinstalled',()=>{installPrompt=null;refresh();});
  buttons.forEach(button=>button.addEventListener('click',async()=>{if(installed())return;if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;refresh();return;}const status=button.querySelector('[data-pwa-install-status]');if(status)status.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)?'Safari: Sdílet → Přidat na plochu.':'V menu prohlížeče zvol Nainstalovat aplikaci / Přidat na plochu.';}));
  refresh();
})();

;(()=>{const sidebar=document.querySelector('[data-sidebar]'),toggles=[...document.querySelectorAll('[data-mobile-nav]')];
const setState=open=>{sidebar?.classList.toggle('is-mobile-open',open);document.body.classList.toggle('mobile-menu-open',open);toggles.forEach(t=>t.setAttribute('aria-expanded',String(open)));};
const close=()=>{sidebar?.classList.remove('is-pinned');setState(false);};
toggles.forEach(toggle=>toggle.addEventListener('click',e=>{e.stopPropagation();setState(!sidebar?.classList.contains('is-mobile-open'));}));
document.addEventListener('click',e=>{if(!e.target.closest('[data-sidebar],[data-mobile-nav]'))close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
sidebar?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(matchMedia('(max-width:800px)').matches)close();}));
sidebar?.addEventListener('mouseleave',()=>{if(!matchMedia('(max-width:800px)').matches)sidebar.classList.remove('is-pinned');});
})();


/* IR Visual 48: lightweight live clock in the global action bar. */
(function(){
  const clocks=[...document.querySelectorAll('[data-live-clock]')];
  const dates=[...document.querySelectorAll('[data-live-date]')];
  if(!clocks.length && !dates.length) return;
  const pad=n=>String(n).padStart(2,'0');
  const tick=()=>{
    const d=new Date();
    clocks.forEach(clock=>clock.textContent=pad(d.getHours())+':'+pad(d.getMinutes()));
    dates.forEach(dateEl=>dateEl.textContent=pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear());
  };
  tick(); setInterval(tick,30000);
})();

;(()=>{const sidebar=document.querySelector('[data-sidebar]');if(!sidebar)return;
const desktop=()=>matchMedia('(min-width:801px)').matches;
sidebar.querySelectorAll('.nav-group').forEach(group=>{
  const main=group.querySelector(':scope > .nav-main');
  if(!main)return;
  group.addEventListener('mouseenter',()=>{if(desktop())group.classList.add('is-hover-open')});
  group.addEventListener('mouseleave',()=>group.classList.remove('is-hover-open'));
  main.addEventListener('focus',()=>{if(desktop())group.classList.add('is-hover-open')});
  group.addEventListener('focusout',e=>{if(!group.contains(e.relatedTarget))group.classList.remove('is-hover-open')});
});
})();

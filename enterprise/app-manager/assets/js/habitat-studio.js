(() => {
  'use strict';
  const root = document.querySelector('[data-hs13-root]');
  const dataNode = document.getElementById('hs13-data');
  if (!root || !dataNode) return;

  let data = {};
  try { data = JSON.parse(dataNode.textContent || '{}'); } catch (e) { console.error('Habitat Studio data error', e); return; }

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, step = 1) => Math.round(v / step) * step;
  const rectOverlap = (a,b,eps=.01) => a.x+eps < b.x+b.w && a.x+a.w-eps > b.x && a.z+eps < b.z+b.h && a.z+a.h-eps > b.z;
  const pointInPoly = (pt, poly) => {
    let inside = false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
      const hit=((yi>pt.y)!==(yj>pt.y)) && (pt.x < (xj-xi)*(pt.y-yi)/(yj-yi+1e-9)+xi);
      if(hit) inside=!inside;
    }
    return inside;
  };
  const colorByType = type => {
    const t=String(type||'').toLowerCase();
    if(t.includes('palud')) return {glass:'#17372f',glow:'#4bdd9b',frame:'#805f35'};
    if(t.includes('akva')) return {glass:'#12364b',glow:'#43b9ff',frame:'#6a7d86'};
    if(t.includes('plast')||t.includes('box')) return {glass:'#2a3135',glow:'#9aa9b1',frame:'#56616a'};
    return {glass:'#182921',glow:'#78df9d',frame:'#82623d'};
  };

  // Dialogs
  $$('[data-hs13-dialog]').forEach(btn => btn.addEventListener('click', () => {
    const dlg = $(`[data-hs13-dialog-window="${btn.dataset.hs13Dialog}"]`);
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  }));
  $$('[data-hs13-dialog-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));
  $$('.hs13-dialog').forEach(dlg => dlg.addEventListener('click', e => { if(e.target===dlg) dlg.close(); }));

  const go = params => {
    const u = new URL(location.href);
    Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
    location.href = u.toString();
  };
  $('[data-hs13-room-select]')?.addEventListener('change', e => go({mode:'room',room:e.target.value}));
  $('[data-hs13-rack-select]')?.addEventListener('change', e => go({mode:'assembly',rack:e.target.value}));

  // Room placement forms are committed only after the user chooses a position in the 2.5D room.
  const rackForm = $('[data-hs13-place-rack-form]');
  const propForm = $('[data-hs13-place-prop-form]');

  class AssemblyBuilder {
    constructor(canvas, payload) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.rackId = +(payload.selectedRackId || 0);
      this.assembly = payload.assemblies?.[this.rackId] || {id:this.rackId,name:'Sestava',w:0,h:0,d:0,blocks:[]};
      this.catalog = new Map((payload.habitats || []).map(h => [+h.id, h]));
      this.blocks = (this.assembly.blocks || []).map(b => ({...b, habitatId:+b.habitatId, x:+b.x||0, z:+b.z||0, w:+b.w||40, h:+b.h||40, d:+b.d||40}));
      this.selected = null;
      this.drag = null;
      this.snap = true;
      this.zoom = 1;
      this.layout = {scale:1,baseX:70,baseY:400,depthX:.18,depthY:.10};
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.bind();
      this.resize();
      this.updateSummary();
    }
    dims() {
      let w=0,h=0,d=0;
      this.blocks.forEach(b => {w=Math.max(w,b.x+b.w); h=Math.max(h,b.z+b.h); d=Math.max(d,b.d);});
      return {w,h,d};
    }
    resize() {
      const r=this.canvas.parentElement.getBoundingClientRect();
      const w=Math.max(500,r.width), h=Math.max(430,r.height);
      this.canvas.width=Math.floor(w*this.dpr); this.canvas.height=Math.floor(h*this.dpr);
      this.canvas.style.width=`${w}px`; this.canvas.style.height=`${h}px`;
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.render();
    }
    fitLayout() {
      const cssW=this.canvas.width/this.dpr, cssH=this.canvas.height/this.dpr;
      const d=this.dims();
      const maxW=Math.max(140,d.w||140), maxH=Math.max(120,d.h||120), maxD=Math.max(40,d.d||40);
      const sx=(cssW-150)/(maxW+maxD*.24); const sy=(cssH-125)/(maxH+maxD*.14);
      const scale=clamp(Math.min(sx,sy),.65,4.2)*this.zoom;
      this.layout={scale,baseX:80+maxD*.18*scale,baseY:cssH-62,depthX:.18,depthY:.10};
    }
    worldToScreen(b) {
      const L=this.layout, s=L.scale, ox=b.d*L.depthX*s, oy=b.d*L.depthY*s;
      const x=L.baseX+b.x*s, y=L.baseY-(b.z+b.h)*s;
      return {x,y,w:b.w*s,h:b.h*s,ox,oy};
    }
    screenToWorldDelta(dx,dy){return {x:dx/this.layout.scale,z:-dy/this.layout.scale};}
    blockRect(b){return {x:b.x,z:b.z,w:b.w,h:b.h};}
    isValid(block, ignoreId=block.habitatId){
      if(block.x < -0.01 || block.z < -0.01) return false;
      return !this.blocks.some(o => o.habitatId!==ignoreId && rectOverlap(this.blockRect(block),this.blockRect(o),.25));
    }
    snapBlock(block) {
      if(!this.snap) return block;
      const tol=12;
      let x=block.x, z=block.z;
      const xCandidates=[0], zCandidates=[0];
      this.blocks.forEach(o => {
        if(o.habitatId===block.habitatId) return;
        xCandidates.push(o.x+o.w, o.x-block.w, o.x);
        zCandidates.push(o.z+o.h, o.z-block.h, o.z);
      });
      let bx=x, bd=tol+1;
      xCandidates.forEach(v=>{const d=Math.abs(x-v);if(d<bd){bd=d;bx=v;}}); if(bd<=tol)x=bx;
      let bz=z, zd=tol+1;
      zCandidates.forEach(v=>{const d=Math.abs(z-v);if(d<zd){zd=d;bz=v;}}); if(zd<=tol)z=bz;
      block.x=Math.max(0,round(x,.5)); block.z=Math.max(0,round(z,.5));
      return block;
    }
    autoPosition(block) {
      const candidates=[{x:0,z:0}];
      this.blocks.forEach(o => {
        if(o.habitatId===block.habitatId)return;
        candidates.push({x:o.x+o.w,z:o.z},{x:o.x,z:o.z+o.h},{x:0,z:o.z+o.h},{x:o.x+o.w,z:0});
      });
      candidates.sort((a,b)=>a.z-b.z || a.x-b.x);
      for(const c of candidates){const t={...block,x:c.x,z:c.z}; if(this.isValid(t,block.habitatId)){block.x=c.x;block.z=c.z;return block;}}
      block.x=this.dims().w; block.z=0; return block;
    }
    addHabitat(id) {
      id=+id; const existing=this.blocks.find(b=>b.habitatId===id); if(existing){this.select(id);return;}
      const h=this.catalog.get(id); if(!h)return;
      if(h.assigned && +h.rackId!==this.rackId && !confirm('Tato ubikace je v jiné sestavě. Přesunout ji sem?')) return;
      const b={habitatId:id,name:h.name,type:h.type,w:+h.w,h:+h.h,d:+h.d,x:0,z:0,occupied:!!h.occupied,animal:h.animal||'',temperature:h.temperature,humidity:h.humidity};
      this.autoPosition(b); this.blocks.push(b); this.selected=id; this.updateSummary(); this.render();
    }
    addReserve(form){const dims=Object.fromEntries(['w','h','d'].map(k=>[k,Number(form.elements.namedItem(k).value)]));if(Object.values(dims).some(n=>!Number.isFinite(n)||n<1||n>2000))return;const b={...dims,habitatId:Math.min(0,...this.blocks.map(b=>b.habitatId))-1,reserved:true,name:'Rezervovaná pozice',type:'Rezerva',x:0,z:0,occupied:false};this.autoPosition(b);this.blocks.push(b);this.select(b.habitatId);this.updateSummary();}
    removeSelected(){if(!this.selected)return;this.blocks=this.blocks.filter(b=>b.habitatId!==this.selected);this.selected=null;this.updateSummary();this.render();}
    autoPack(){
      const list=[...this.blocks].sort((a,b)=>b.h-a.h || b.w-a.w);
      const area=list.reduce((s,b)=>s+b.w*b.h,0); const target=Math.max(120,Math.sqrt(area)*1.35);
      let x=0,z=0,rowH=0;
      list.forEach(b=>{if(x>0 && x+b.w>target){x=0;z+=rowH;rowH=0;}b.x=x;b.z=z;x+=b.w;rowH=Math.max(rowH,b.h);});
      this.blocks=list; this.updateSummary(); this.render();
    }
    select(id){this.selected=+id;this.updateSelected();this.render();}
    updateSelected(){
      const box=$('[data-hs13-builder-selected]'); if(!box)return;
      const b=this.blocks.find(x=>x.habitatId===this.selected);
      if(!b){box.innerHTML='<span></span><div><b>Vyber blok</b><small>Pak ho můžeš přesunout nebo odebrat.</small></div>';return;}
      box.innerHTML=`<span class="is-habitat"></span><div><b>${this.escape(b.name)}</b><small>${this.fmt(b.w)} × ${this.fmt(b.h)} × ${this.fmt(b.d)} cm · X ${this.fmt(b.x)} / Z ${this.fmt(b.z)}</small></div>`;
    }
    updateSummary(){
      const d=this.dims();
      $$('[data-hs13-assembly-w]').forEach(e=>e.textContent=`${this.fmt(d.w)} cm`);
      $$('[data-hs13-assembly-h]').forEach(e=>e.textContent=`${this.fmt(d.h)} cm`);
      $$('[data-hs13-assembly-d]').forEach(e=>e.textContent=`${this.fmt(d.d)} cm`);
      $$('[data-hs13-assembly-count]').forEach(e=>e.textContent=String(this.blocks.length));
      const depths=[...new Set(this.blocks.map(b=>Math.round(b.d*10)/10))];
      const warn=$('[data-hs13-depth-warning]'); if(warn)warn.hidden=depths.length<=1;
      const list=$('[data-hs13-block-list]');if(list){list.replaceChildren();this.blocks.forEach(b=>{const button=document.createElement('button');button.type='button';button.textContent=b.name;button.onclick=()=>this.select(b.habitatId);list.append(button);});}
      this.updateSelected(); this.drawMini();
    }
    drawMini(){
      const el=$('[data-hs13-cabinet-mini]'); if(!el)return;
      const d=this.dims(); el.innerHTML='';
      if(!d.w||!d.h)return;
      this.blocks.forEach(b=>{const i=document.createElement('i');i.className=b.occupied?'on':'';i.style.left=`${b.x/d.w*100}%`;i.style.bottom=`${b.z/d.h*100}%`;i.style.width=`${b.w/d.w*100}%`;i.style.height=`${b.h/d.h*100}%`;el.appendChild(i);});
    }
    escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    fmt(v){return (Math.round(v*10)/10).toString().replace('.',',');}
    drawBlock(ctx,b,t=0) {
      const s=this.worldToScreen(b), col=colorByType(b.type), selected=b.habitatId===this.selected;
      const invalid=this.drag?.id===b.habitatId && !this.isValid(b,b.habitatId);
      ctx.save();
      if(selected){ctx.shadowColor=`rgba(255,145,45,${.38+.18*Math.sin(t/250)})`;ctx.shadowBlur=18;}
      if(b.occupied){ctx.shadowColor='rgba(89,224,143,.22)';ctx.shadowBlur=12;}
      if(b.reserved){ctx.fillStyle='rgba(100,116,130,.12)';ctx.fillRect(s.x,s.y,s.w,s.h);ctx.strokeStyle=selected?'#ff9a38':'#91a5b5';ctx.setLineDash([6,4]);ctx.strokeRect(s.x,s.y,s.w,s.h);ctx.fillStyle='#ced7dd';ctx.font='12px system-ui';ctx.fillText('Rezervováno',s.x+8,s.y+s.h/2);ctx.restore();b._hit={x:s.x,y:s.y,w:s.w,h:s.h};return;}
      // Top
      ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+s.w,s.y);ctx.lineTo(s.x+s.w-s.ox,s.y-s.oy);ctx.lineTo(s.x-s.ox,s.y-s.oy);ctx.closePath();ctx.fillStyle='#2b3031';ctx.fill();ctx.strokeStyle=selected?'#ff962f':col.frame;ctx.lineWidth=selected?2:1;ctx.stroke();
      // Side
      ctx.beginPath();ctx.moveTo(s.x+s.w,s.y);ctx.lineTo(s.x+s.w,s.y+s.h);ctx.lineTo(s.x+s.w-s.ox,s.y+s.h-s.oy);ctx.lineTo(s.x+s.w-s.ox,s.y-s.oy);ctx.closePath();ctx.fillStyle='#151b1d';ctx.fill();ctx.stroke();
      // Front frame
      ctx.fillStyle='#070a0b';ctx.fillRect(s.x,s.y,s.w,s.h);ctx.strokeStyle=invalid?'#ff4d4d':selected?'#ff9a38':col.frame;ctx.lineWidth=selected?2.5:1.5;ctx.strokeRect(s.x,s.y,s.w,s.h);
      const pad=Math.max(4,Math.min(10,s.w*.05));
      ctx.fillStyle=col.glass;ctx.globalAlpha=b.occupied?.88:.46;ctx.fillRect(s.x+pad,s.y+pad,s.w-pad*2,s.h-pad*2);ctx.globalAlpha=1;
      // Substrate
      ctx.fillStyle='rgba(108,72,39,.72)';ctx.fillRect(s.x+pad,s.y+s.h-pad-Math.max(4,s.h*.12),s.w-pad*2,Math.max(4,s.h*.12));
      // Branch
      ctx.strokeStyle='rgba(183,137,79,.82)';ctx.lineWidth=Math.max(1.2,s.w*.012);ctx.beginPath();ctx.moveTo(s.x+pad+3,s.y+s.h-pad-6);ctx.bezierCurveTo(s.x+s.w*.35,s.y+s.h*.56,s.x+s.w*.65,s.y+s.h*.62,s.x+s.w-pad-3,s.y+pad+8);ctx.stroke();
      // Leaves
      ctx.fillStyle=b.occupied?'rgba(84,196,105,.82)':'rgba(59,111,70,.48)';
      [[.25,.35,3],[.62,.28,4],[.77,.57,3]].forEach(([xx,yy,r])=>{ctx.beginPath();ctx.ellipse(s.x+s.w*xx,s.y+s.h*yy,r*1.4,r,.5,0,Math.PI*2);ctx.fill();});
      // Glass highlight
      const grad=ctx.createLinearGradient(s.x,s.y,s.x+s.w,s.y+s.h);grad.addColorStop(0,'rgba(255,255,255,.16)');grad.addColorStop(.28,'rgba(255,255,255,.02)');grad.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=grad;ctx.fillRect(s.x+pad,s.y+pad,s.w-pad*2,s.h-pad*2);
      if(s.w>78 && s.h>42){ctx.fillStyle='#f3f5f4';ctx.font='700 11px system-ui';ctx.fillText(b.animal||b.name,s.x+pad+6,s.y+s.h-pad-10);ctx.fillStyle='#9aa7aa';ctx.font='9px system-ui';ctx.fillText(`${this.fmt(b.w)}×${this.fmt(b.h)}×${this.fmt(b.d)} cm`,s.x+pad+6,s.y+s.h-pad+3);}
      ctx.restore();
      b._hit={x:s.x,y:s.y,w:s.w,h:s.h};
    }
    render(t=0){
      const ctx=this.ctx, w=this.canvas.width/this.dpr,h=this.canvas.height/this.dpr;ctx.clearRect(0,0,w,h);this.fitLayout();
      // Background
      const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0e1518');bg.addColorStop(1,'#080d0f');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      // Workshop floor/grid
      ctx.strokeStyle='rgba(126,151,151,.08)';ctx.lineWidth=1;const step=20*this.layout.scale;for(let x=this.layout.baseX%step;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,20);ctx.lineTo(x,h-40);ctx.stroke();}for(let y=(this.layout.baseY)%step;y>20;y-=step){ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(w-25,y);ctx.stroke();}
      const d=this.dims();ctx.fillStyle='#9cacaf';ctx.font='700 11px system-ui';ctx.fillText(`AUTOMATICKÝ ROZMĚR: ${this.fmt(d.w)} × ${this.fmt(d.h)} × ${this.fmt(d.d)} cm`,30,30);
      ctx.fillStyle='#627277';ctx.font='10px system-ui';ctx.fillText('Šířka × Výška × Hloubka · rám vzniká z obálky vložených ubikací',30,48);
      [...this.blocks].sort((a,b)=>a.z-b.z || a.x-b.x).forEach(b=>this.drawBlock(ctx,b,t));
      // baseline and cabinet envelope
      if(d.w&&d.h){const L=this.layout,s=L.scale,x=L.baseX,y=L.baseY-d.h*s;ctx.save();ctx.strokeStyle='rgba(255,151,56,.32)';ctx.setLineDash([6,5]);ctx.strokeRect(x-7,y-7,d.w*s+14,d.h*s+14);ctx.restore();}
    }
    hit(pt){return [...this.blocks].reverse().find(b=>b._hit && pt.x>=b._hit.x&&pt.x<=b._hit.x+b._hit.w&&pt.y>=b._hit.y&&pt.y<=b._hit.y+b._hit.h);}
    pos(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    bind(){
      this.canvas.addEventListener('pointerdown',e=>{const p=this.pos(e),b=this.hit(p);if(!b)return;this.select(b.habitatId);this.drag={id:b.habitatId,start:p,origX:b.x,origZ:b.z};this.canvas.setPointerCapture(e.pointerId);});
      this.canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const b=this.blocks.find(x=>x.habitatId===this.drag.id);if(!b)return;const p=this.pos(e),d=this.screenToWorldDelta(p.x-this.drag.start.x,p.y-this.drag.start.y);b.x=Math.max(0,this.drag.origX+d.x);b.z=Math.max(0,this.drag.origZ+d.z);this.render(performance.now());this.updateSummary();});
      this.canvas.addEventListener('pointerup',e=>{if(!this.drag)return;const b=this.blocks.find(x=>x.habitatId===this.drag.id);if(b){this.snapBlock(b);if(!this.isValid(b,b.habitatId)){b.x=this.drag.origX;b.z=this.drag.origZ;}}this.drag=null;this.updateSummary();this.render();});
      // Kolečko myši zůstává vždy přirozenému scrollování stránky.
      $$('[data-hs13-add-habitat]').forEach(btn=>btn.addEventListener('click',()=>this.addHabitat(btn.dataset.hs13AddHabitat)));
      $('[data-hs13-reserve-form]')?.addEventListener('submit',e=>{e.preventDefault();this.addReserve(e.currentTarget);});
      $('[data-hs13-builder-snap]')?.addEventListener('change',e=>this.snap=e.target.checked);
      $('[data-hs13-builder-auto]')?.addEventListener('click',()=>this.autoPack());
      $('[data-hs13-remove-habitat]')?.addEventListener('click',()=>this.removeSelected());
      $$('[data-hs13-nudge]').forEach(btn=>btn.addEventListener('click',()=>{const b=this.blocks.find(x=>x.habitatId===this.selected);if(!b)return;const step=5;const dir=btn.dataset.hs13Nudge;if(dir==='left')b.x=Math.max(0,b.x-step);if(dir==='right')b.x+=step;if(dir==='up')b.z+=step;if(dir==='down')b.z=Math.max(0,b.z-step);if(!this.isValid(b,b.habitatId))this.autoPosition(b);this.updateSummary();this.render();}));
      $('[data-hs13-save-assembly]')?.addEventListener('click',()=>this.save());
      window.addEventListener('keydown',e=>{if(root.dataset.mode!=='assembly')return;if(e.key==='Delete'||e.key==='Backspace'){if(document.activeElement?.matches('input,textarea,select'))return;e.preventDefault();this.removeSelected();}});
    }
    save(){const f=$('[data-hs13-save-assembly-form]');if(!f)return;$('[data-hs13-assembly-json]',f).value=JSON.stringify(this.blocks.map((b,i)=>({habitatId:b.habitatId,w:b.w,h:b.h,d:b.d,reserved:!!b.reserved,x:Math.round(b.x*10)/10,z:Math.round(b.z*10)/10,order:i+1})));f.submit();}
  }


  const assemblyCanvas=$('[data-hs13-assembly-canvas]');
  if(assemblyCanvas) new AssemblyBuilder(assemblyCanvas,data);
  const roomCanvas=$('[data-hs13-room-canvas]');
  let roomStudio=null;
  const initializeRoomStudio=()=>{
    if(!roomCanvas||roomStudio||!window.HabitatRoom3D)return;
    roomStudio=new window.HabitatRoom3D(roomCanvas,data);
    window.hsActiveRoomStudio=roomStudio;
    let lastLibraryDragEnd=0;
    const activeStudio=()=>window.hsActiveRoomStudio||roomStudio;
    const bindLibraryDrag=(btn,kind)=>{
      btn.draggable=true;
      const start=()=>{const studio=activeStudio();studio.libraryDropAccepted=false;if(kind==='rack')studio.startRackPlacement(btn.dataset.hs13PlaceRack,btn);else studio.startPropPlacement(btn.dataset.hs13PlaceProp,btn);};
      btn.addEventListener('click',()=>{if(performance.now()-lastLibraryDragEnd<350)return;start();});
      btn.addEventListener('dragstart',e=>{start();root.classList.add('is-library-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',kind==='rack'?`rack:${btn.dataset.hs13PlaceRack}`:`prop:${btn.dataset.hs13PlaceProp}`);}});
      btn.addEventListener('dragend',()=>{lastLibraryDragEnd=performance.now();root.classList.remove('is-library-dragging');const studio=activeStudio();if(!studio.libraryDropAccepted)studio.clearPlacement();});
    };
    $$('[data-hs13-place-rack]').forEach(btn=>bindLibraryDrag(btn,'rack'));
    $$('[data-hs13-place-prop]').forEach(btn=>bindLibraryDrag(btn,'prop'));
  };
  initializeRoomStudio();
  window.addEventListener('habitat-room-3d-ready',initializeRoomStudio,{once:true});
  if(roomCanvas)setTimeout(()=>{
    if(roomStudio||!roomCanvas.isConnected)return;
    const error=document.createElement('div');
    error.className='hs16-webgl-error';
    error.innerHTML='<div><b>3D modul se nenačetl</b><span>Lokální Three.js modul se nepodařilo spustit. Použij 2D půdorys a zkontroluj konzoli prohlížeče.</span><button type="button" data-hs16-fallback-2d>Přejít na 2D půdorys</button></div>'; error.querySelector('[data-hs16-fallback-2d]')?.addEventListener('click',()=>document.querySelector('[data-hs15-view="top"]')?.click());
    roomCanvas.replaceWith(error);
  },15000);
})();

document.querySelector('[data-prop-category]')?.addEventListener('change',e=>document.querySelectorAll('[data-category]').forEach(b=>b.hidden=e.target.value!=='all'&&b.dataset.category!==e.target.value));

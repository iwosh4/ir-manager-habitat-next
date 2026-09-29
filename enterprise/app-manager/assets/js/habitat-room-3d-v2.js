import * as THREE from '../vendor/three/three.module.js';
import {bounds, overlaps, attachWall, wallPanels} from './room-geometry.js?v=61.0';
import {buildHabitatV2, buildAssetV2} from './habitat-renderer-v2-assets.js?v=62.0';

const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), rad=THREE.MathUtils.degToRad;

class HabitatRoom3D{
  constructor(canvas,payload){
    this.canvas=canvas;this.payload=payload;this.room={w:+payload.room?.w||500,d:+payload.room?.d||400,h:+payload.room?.h||260,grid:+payload.room?.grid||10,floor:payload.room?.floor||'wood',wall:payload.room?.wall||'light'};
    this.items=(payload.items||[]).map(i=>({...i,id:+i.id,rackId:+i.rackId||null,x:+i.x||0,y:+i.y||0,w:+i.w||40,d:+i.d||40,h:+i.h||40,elevation:+i.elevation||0,wall:i.wall||'',rotation:((+i.rotation||0)%360+360)%360}));
    this.assemblies=payload.assemblies||{};this.objects=new Map;this.mats=new Map;this.selected=null;this.drag=null;this.orbit=null;this.placement=null;this.preview=null;this.invalid=false;this.snapEnabled=true;this.showGrid=false;this.view='illustration';this.yaw=rad(-28);this.pitch=rad(52);this.distance=Math.max(this.room.w,this.room.d)*1.38;this.zoom=.82;this.target=new THREE.Vector3(this.room.w/2,Math.min(105,this.room.h*.36),this.room.d/2);this.frame=0;this.running=false;this.destroyed=false;this.lastWidth=0;this.lastHeight=0;this.lastDpr=0;this.needsRender=true;this.resizeQueued=false;
    // Snapshot of the load-time camera framing, used by the explicit "Reset" preset button.
    // Does not affect saved layout data (x_cm/y_cm/rotation stay untouched by any camera action).
    this.initialCamera={yaw:this.yaw,pitch:this.pitch,distance:this.distance,zoom:this.zoom,target:this.target.clone(),view:this.view};
    this.isFullscreenState=false;
    this.rackForm=$('[data-hs13-place-rack-form]');this.propForm=$('[data-hs13-place-prop-form]');
    try{this.init();this.bind();this.resize(true);this.animate();}catch(e){console.error('Habitat Studio Three.js:',e);this.fail('3D místnost se nepodařilo inicializovat.');}
  }
  init(){
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'high-performance',stencil:false,depth:true,preserveDrawingBuffer:false,precision:'highp',logarithmicDepthBuffer:true});this.renderer.setPixelRatio(Math.min(2.5,window.devicePixelRatio||1));this.renderer.setClearColor(0x090d0f);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.28;this.renderer.physicallyCorrectLights=true;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.setAnimationLoop(null);
    this.scene=new THREE.Scene;this.scene.background=new THREE.Color(0x080b0d);this.scene.fog=new THREE.FogExp2(0x101416,.00007);this.roomGroup=new THREE.Group;this.itemGroup=new THREE.Group;this.scene.add(this.roomGroup,this.itemGroup);
    this.camera3d=new THREE.PerspectiveCamera(42,1,1,6000);this.cameraTop=new THREE.OrthographicCamera(-300,300,300,-300,1,3000);this.cameraIllustration=new THREE.OrthographicCamera(-300,300,300,-300,1,6000);this.raycaster=new THREE.Raycaster;this.pointer=new THREE.Vector2;this.floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.scene.add(new THREE.HemisphereLight(0xdde8ed,0x302a24,.72));const sun=new THREE.DirectionalLight(0xffe3c0,2.15);sun.position.set(this.room.w*.15,this.room.h*1.7,this.room.d*1.1);sun.castShadow=true;sun.shadow.mapSize.set(Math.min(2048,this.renderer.capabilities.maxTextureSize),Math.min(2048,this.renderer.capabilities.maxTextureSize));sun.shadow.bias=-0.00015;sun.shadow.normalBias=.035;const s=Math.max(this.room.w,this.room.d)*.75;Object.assign(sun.shadow.camera,{left:-s,right:s,top:s,bottom:-s,near:10,far:1800});sun.shadow.camera.updateProjectionMatrix();sun.target.position.set(this.room.w/2,0,this.room.d/2);this.scene.add(sun,sun.target);const fill=new THREE.PointLight(0xffc47c,18,Math.max(this.room.w,this.room.d)*1.55);fill.position.set(this.room.w*.8,this.room.h*.6,this.room.d*.75);this.scene.add(fill);const rim=new THREE.DirectionalLight(0xb5d9ee,.65);rim.position.set(this.room.w*1.15,this.room.h*.9,-this.room.d*.25);rim.target.position.set(this.room.w/2,this.room.h*.25,this.room.d/2);this.scene.add(rim,rim.target);
    // Premium room lighting: multiple ceiling fixtures for game-like depth and contact shadows.
    const lightPositions=[[.22,.28],[.52,.30],[.80,.28],[.30,.70],[.68,.70]];
    lightPositions.forEach(([px,pz],idx)=>{const sp=new THREE.SpotLight(idx%2?0xfff0d2:0xf4fbff,6.5,Math.max(this.room.w,this.room.d)*1.1,Math.PI/3.2,.48,1.35);sp.position.set(this.room.w*px,this.room.h-8,this.room.d*pz);sp.target.position.set(this.room.w*px,0,this.room.d*pz);sp.castShadow=false;sp.shadow.mapSize.set(2048,2048);sp.shadow.bias=-.00008;sp.shadow.normalBias=.025;this.scene.add(sp,sp.target);});
    this.setupEnvironment();this.buildRoom();this.items.forEach(i=>this.addObject(i));
  }
  setupEnvironment(){
    // A studio environment provides coherent reflections without remote HDR assets.
    const studio=new THREE.Scene();studio.background=new THREE.Color(0x8e979b);
    const shell=new THREE.Mesh(new THREE.BoxGeometry(40,30,40),new THREE.MeshBasicMaterial({color:0x777f85,side:THREE.BackSide}));studio.add(shell);
    for(const [x,y,z,w,h,color,intensity] of [[0,14,0,18,22,0xffefda,4],[-19,4,0,12,18,0xffffff,2],[19,7,0,9,16,0xc4ddf0,2.4]]){
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,0,0);studio.add(panel);
    }
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.environmentTarget=pmrem.fromScene(studio,.08,.1,100);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.9;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  imageTexture(name,repeatX=1,repeatY=1){
    this.imageTextures ||= new Map();const key=name+':'+repeatX+':'+repeatY;if(this.imageTextures.has(key))return this.imageTextures.get(key);
    const tex=new THREE.TextureLoader().load('assets/textures/'+name,()=>{this.needsRender=true;},undefined,()=>{console.warn('Materiál se nepodařilo načíst: '+name);});tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeatX,repeatY);tex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.imageTextures.set(key,tex);return tex;
  }
  v2Texture(name,repeatX=1,repeatY=1,color=false){
    this.v2Textures ||= new Map();const key=name+':'+repeatX+':'+repeatY+':'+color;if(this.v2Textures.has(key))return this.v2Textures.get(key);
    const tex=new THREE.TextureLoader().load('assets/textures/v2/'+name,()=>{this.needsRender=true;},undefined,()=>console.warn('V2 textura se nepodařila načíst: '+name));
    tex.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeatX,repeatY);tex.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());this.v2Textures.set(key,tex);return tex;
  }
  v2Pbr(kind,opt={}){
    const rx=opt.repeatX||1,ry=opt.repeatY||1,key='v2pbr:'+kind+':'+rx+':'+ry+':'+JSON.stringify(opt);if(this.mats.has(key))return this.mats.get(key);
    const files={plaster:['plaster_albedo.png','plaster_normal.png','plaster_roughness.png'],tile:['tile_albedo.png','tile_normal.png','tile_roughness.png'],soil:['soil_albedo.png','soil_normal.png','soil_roughness.png'],metal:['metal_albedo.png','metal_normal.png','metal_roughness.png']}[kind];
    const params={...opt};delete params.repeatX;delete params.repeatY;
    if(files){params.map=this.v2Texture(files[0],rx,ry,true);params.normalMap=this.v2Texture(files[1],rx,ry,false);params.roughnessMap=this.v2Texture(files[2],rx,ry,false);params.normalScale=new THREE.Vector2(kind==='soil'?1.35:.65,kind==='soil'?1.35:.65);}
    if(kind==='metal'&&params.metalness===undefined)params.metalness=.88;if(params.roughness===undefined)params.roughness=kind==='metal'?.3:.8;
    const mat=new THREE.MeshPhysicalMaterial(params);this.mats.set(key,mat);return mat;
  }
  contactShadow(root,item){
    if((item.elevation||0)>5||['door','window','light'].some(t=>item.type?.startsWith(t)))return;
    if(!this.contactTexture){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,20,64,64,64);g.addColorStop(0,'rgba(0,0,0,.45)');g.addColorStop(.6,'rgba(0,0,0,.23)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);this.contactTexture=new THREE.CanvasTexture(c);}
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(item.w*1.22,item.d*1.22),new THREE.MeshBasicMaterial({map:this.contactTexture,transparent:true,depthWrite:false,toneMapped:false}));plane.rotation.x=-Math.PI/2;plane.position.set(item.w/2,.45,item.d/2);plane.raycast=()=>{};root.add(plane);
  }
  mat(k,o){if(!this.mats.has(k))this.mats.set(k,new THREE.MeshStandardMaterial(o));return this.mats.get(k)}
  pmat(k,o){if(!this.mats.has(k))this.mats.set(k,new THREE.MeshPhysicalMaterial(o));return this.mats.get(k)}
  box(p,x,y,z,w,h,d,m,shadow=true){const o=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.2,w),Math.max(.2,h),Math.max(.2,d)),m);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;p.add(o);return o}
  cyl(p,x,y,z,r,h,m,n=16){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;p.add(o);return o}
  edgeBox(mesh,color=0x9ba7aa,opacity=.72){const e=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,28),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false}));e.position.copy(mesh.position);e.rotation.copy(mesh.rotation);e.scale.copy(mesh.scale);e.renderOrder=24;mesh.parent?.add(e);return e}
  premiumBox(p,x,y,z,w,h,d,m,edge=0x7f8b8e,opacity=.58){const o=this.box(p,x,y,z,w,h,d,m,true);this.edgeBox(o,edge,opacity*.28);return o}
  texture(kind){
    if(kind==='wood')return this.imageTexture('oak-floor-46.png',Math.max(1,this.room.w/200),Math.max(1,this.room.d/200));this.textureCache ||= new Map();if(this.textureCache.has(kind))return this.textureCache.get(kind);const S=1024,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');
    if(kind==='wood'){
      const g=x.createLinearGradient(0,0,S,S);g.addColorStop(0,'#5b3821');g.addColorStop(.5,'#352116');g.addColorStop(1,'#70482a');x.fillStyle=g;x.fillRect(0,0,S,S);
      for(let i=0;i<32;i++){const xx=i*128;x.fillStyle=i%2?'rgba(255,205,145,.035)':'rgba(0,0,0,.06)';x.fillRect(xx,0,126,S);x.strokeStyle='rgba(20,8,2,.32)';x.lineWidth=3;x.beginPath();x.moveTo(xx+126,0);x.lineTo(xx+126,S);x.stroke();for(let y=35;y<S;y+=110){x.strokeStyle='rgba(245,188,115,.075)';x.lineWidth=2;x.beginPath();x.moveTo(xx+8,y);x.bezierCurveTo(xx+34,y-12,xx+72,y+13,xx+118,y);x.stroke();}}
    }else if(kind==='tile'){
      x.fillStyle='#b9b7af';x.fillRect(0,0,S,S);for(let yy=0;yy<S;yy+=512)for(let xx=0;xx<S;xx+=512){const q=((xx+yy)/512)%2;x.fillStyle=q?'#c5c2b8':'#bdbbb3';x.fillRect(xx+9,yy+9,494,494);const grd=x.createLinearGradient(xx,yy,xx+512,yy+512);grd.addColorStop(0,'rgba(255,255,255,.10)');grd.addColorStop(1,'rgba(0,0,0,.06)');x.fillStyle=grd;x.fillRect(xx+10,yy+10,492,492);}x.strokeStyle='#777a77';x.lineWidth=9;for(let v=0;v<=S;v+=512){x.beginPath();x.moveTo(v,0);x.lineTo(v,S);x.stroke();x.beginPath();x.moveTo(0,v);x.lineTo(S,v);x.stroke();}
    }else{
      x.fillStyle=kind==='graphite'?'#3d4549':'#e7e5df';x.fillRect(0,0,S,S);for(let y=0;y<S;y+=64){for(let xx=0;xx<S;xx+=64){const n=((xx*13+y*7)%31)/31;x.fillStyle=kind==='graphite'?`rgba(255,255,255,${.008+n*.018})`:`rgba(70,65,58,${.006+n*.012})`;x.fillRect(xx,y,32,32);}}
    }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(16,this.renderer?.capabilities?.getMaxAnisotropy?.()||8);t.repeat.set(Math.max(1,this.room.w/140),Math.max(1,this.room.d/140));t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;this.textureCache.set(kind,t);return t;
  }

  buildRoom(){
    this.roomGroup.traverse(o=>o.geometry?.dispose());this.roomGroup.clear();
    const floor=this.room.floor==='wood'?new THREE.MeshPhysicalMaterial({map:this.texture('wood'),roughness:.54,metalness:.01,clearcoat:.08,clearcoatRoughness:.55}):this.v2Pbr('tile',{roughness:this.room.floor==='industrial'?.46:.36,metalness:this.room.floor==='industrial'?.18:.02,repeatX:Math.max(1,this.room.w/180),repeatY:Math.max(1,this.room.d/180),clearcoat:this.room.floor==='tile'?.12:.03,clearcoatRoughness:.48});
    this.box(this.roomGroup,this.room.w/2,-2.5,this.room.d/2,this.room.w,5,this.room.d,floor,false);
    const colors={light:0xe2ded4,warm:0xcbb9a5,sage:0x879789,bluegray:0x7e8c93,charcoal:0x353d41,brick:0x8a5b49},wall=this.v2Pbr('plaster',{color:colors[this.room.wall]||colors.light,roughness:.86,metalness:0,repeatX:Math.max(1,this.room.w/220),repeatY:Math.max(1,this.room.h/180)}),trim=this.v2Pbr('metal',{color:0x1b2225,roughness:.3,metalness:.86,repeatX:1,repeatY:2}),t=6;
    this.walls={};
    for(const side of ['north','south','west','east']) {
      const horizontal=['north','south'].includes(side),length=horizontal?this.room.w:this.room.d;
      const holes=this.items.filter(i=>i.wall===side&&['window','door'].includes(i.type.split('-')[0])).map(i=>({x:horizontal?i.x:i.y,z:i.elevation||0,w:i.w,h:i.h}));
      const group=new THREE.Group;this.roomGroup.add(group);this.walls[side]=group;
      for(const p of wallPanels(length,this.room.h,holes)) {
        if(horizontal)this.box(group,p.x+p.w/2,p.z+p.h/2,side==='north'?-t/2:this.room.d+t/2,p.w,p.h,t,wall,false);
        else this.box(group,side==='west'?-t/2:this.room.w+t/2,p.z+p.h/2,p.x+p.w/2,t,p.h,p.w,wall,false);
      }
    }
    this.trims={north:this.box(this.roomGroup,this.room.w/2,5,1.5,this.room.w,10,3,trim,false),south:this.box(this.roomGroup,this.room.w/2,5,this.room.d-1.5,this.room.w,10,3,trim,false),west:this.box(this.roomGroup,1.5,5,this.room.d/2,3,10,this.room.d,trim,false),east:this.box(this.roomGroup,this.room.w-1.5,5,this.room.d/2,3,10,this.room.d,trim,false)};
    // Visual Proof R1: visible technical ceiling frame + warm LED fixtures.
    // These are render-only details; they do not change saved room geometry or collision data.
    const ceilingFrame=this.mat('vp61-ceiling-frame',{color:0x151b1e,roughness:.28,metalness:.78});
    const ceilingTrim=this.mat('vp61-ceiling-trim',{color:0x30383c,roughness:.24,metalness:.88});
    const beamH=Math.max(4,Math.min(7,this.room.h*.022));
    this.box(this.roomGroup,this.room.w/2,this.room.h-beamH/2,3,this.room.w,beamH,6,ceilingFrame,false);
    this.box(this.roomGroup,this.room.w/2,this.room.h-beamH/2,this.room.d-3,this.room.w,beamH,6,ceilingFrame,false);
    this.box(this.roomGroup,3,this.room.h-beamH/2,this.room.d/2,6,beamH,this.room.d,ceilingFrame,false);
    this.box(this.roomGroup,this.room.w-3,this.room.h-beamH/2,this.room.d/2,6,beamH,this.room.d,ceilingFrame,false);
    const ledHousing=this.mat('vp61-led-housing',{color:0x111719,roughness:.2,metalness:.9});
    const ledEmitter=this.mat('vp61-led-emitter',{color:0xfff2d8,emissive:0xffc36a,emissiveIntensity:4.2,roughness:.18});
    [[.22,.28],[.52,.30],[.80,.28],[.30,.70],[.68,.70]].forEach(([px,pz],idx)=>{
      const w=Math.min(110,this.room.w*.18),d=idx%2?7:8,y=this.room.h-8;
      this.box(this.roomGroup,this.room.w*px,y,this.room.d*pz,w,4,d,ledHousing,false);
      this.box(this.roomGroup,this.room.w*px,y-2.2,this.room.d*pz,w*.88,1.2,d*.62,ledEmitter,false);
    });
    // Slim service rail on the rear wall gives the room a technical breeder-room identity.
    const railY=Math.min(this.room.h-45,125);
    this.box(this.roomGroup,this.room.w/2,railY,2.2,this.room.w*.82,4,4,ceilingTrim,false);
    const size=Math.max(this.room.w,this.room.d);this.grid=new THREE.GridHelper(size,Math.ceil(size/Math.max(5,this.room.grid)),0xf08a2d,0x5d625e);this.grid.position.set(this.room.w/2,.4,this.room.d/2);this.grid.material.transparent=true;this.grid.material.opacity=.18;this.grid.visible=this.showGrid;this.roomGroup.add(this.grid);
  }
  label(text,w){const c=document.createElement('canvas');c.width=1024;c.height=160;const x=c.getContext('2d');x.fillStyle='rgba(4,8,10,.94)';x.fillRect(3,3,1018,154);x.strokeStyle='#ff922f';x.lineWidth=5;x.strokeRect(5,5,1014,150);x.fillStyle='#fff';x.font='800 46px system-ui';x.textBaseline='middle';const s=String(text||'Objekt');x.fillText(s.length>30?s.slice(0,29)+'…':s,34,82);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer?.capabilities?.getMaxAnisotropy?.()||1);const o=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false}));const sw=clamp(w*.9,82,220);o.scale.set(sw,sw*160/1024,1);o.renderOrder=80;return o}
  kind(type){const t=String(type||'').toLowerCase();if(t.includes('inkuba'))return'incubation';if(t.includes('karant'))return'quarantine';return t.includes('palud')||t.includes('akva')?'paludarium':t.includes('rack')||t.includes('plast')||t.includes('box')?'box':t.includes('vert')||t.includes('arbor')?'vertical':'glass'}
  habitat(b,depth){return buildHabitatV2(b,depth,this)}
  assembly(item){const g=new THREE.Group,a=this.assemblies[item.rackId]||this.assemblies[String(item.rackId)],blocks=a?.blocks||[];if(!blocks.length)this.box(g,item.w/2,item.h/2,item.d/2,item.w,item.h,item.d,this.mat('empty',{color:0x22292c,roughness:.6,metalness:.35}));blocks.forEach(b=>{const o=b.reserved?new THREE.Group():this.habitat(b,item.d);if(b.reserved){const lines=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w,b.h,b.d)),new THREE.LineBasicMaterial({color:0x879aaa,transparent:true,opacity:.55}));lines.position.set(b.w/2,b.h/2,b.d/2);o.add(lines);}else o.traverse(mesh=>mesh.userData.habitat=b);o.position.set(+b.x||0,+b.z||0,0);g.add(o)});
    // Assembly decor/material: 'material' mirrors wp_ir2_habitat_rack_meta_71.assembly_type, which is
    // always 'modular' today (see audit) - so this lookup is dormant until a real value is ever saved.
    // The older text-based 'lamino|wood' style match is kept as-is for backward compatibility.
    const materialKey=String(a?.material||'').toLowerCase(),materialMap={'lamino-black':{color:0x1c1c1c,roughness:.55},'lamino-white':{color:0xe6e2d8,roughness:.5},'metal':{color:0x8a949a,roughness:.28,metalness:.85},'pvc-white':{color:0xe9ecec,roughness:.42},'pvc-black':{color:0x1d2224,roughness:.42},'transparent':{color:0xdfeef0,roughness:.08,transparent:true,opacity:.22,metalness:0}};
    const preset=materialMap[materialKey];
    if(preset){const m=preset.transparent?this.pmat('assembly-material-'+materialKey,{...preset,transmission:.55,thickness:1.2,depthWrite:false}):this.mat('assembly-material-'+materialKey,preset),t=2.5;this.box(g,t/2,item.h/2,item.d/2,t,item.h+5,item.d+3,m);this.box(g,item.w-t/2,item.h/2,item.d/2,t,item.h+5,item.d+3,m);this.box(g,item.w/2,item.h+t/2,item.d/2,item.w,t,item.d+3,m)}
    else if(String(a?.style||item.style||'').toLowerCase().match(/lamino|wood/)){const m=this.mat('lamino',{color:0x5a3a22,roughness:.76}),t=2.5;this.box(g,t/2,item.h/2,item.d/2,t,item.h+5,item.d+3,m);this.box(g,item.w-t/2,item.h/2,item.d/2,t,item.h+5,item.d+3,m);this.box(g,item.w/2,item.h+t/2,item.d/2,item.w,t,item.d+3,m)}
    return g}
  prop(item){
    if(item.type.startsWith('pipe-'))return this.pipe(item);
    const premium=buildAssetV2(item,this); if(premium)return premium;
    const g=new THREE.Group,{w,h,d}=item,dark=this.mat('dark',{color:0x20272a,roughness:.38,metalness:.48}),steel=this.mat('steel',{color:0x89969b,roughness:.22,metalness:.9}),wood=this.mat('wood',{color:0x70431f,map:this.texture('wood'),roughness:.58}),white=this.mat('white',{color:0xd4dcdd,roughness:.3,metalness:.05}),green=this.mat('plant',{color:0x2d8b4e,roughness:.82}),blue=this.pmat('blue',{color:0x257ca6,transparent:true,opacity:.58,roughness:.12,metalness:.05,transmission:.22,thickness:1.2});
    if(item.type==='desk'){this.box(g,w/2,h*.82,d/2,w,6,d,wood);this.box(g,w/2,h*.79,d/2,w-5,2,d-5,this.mat('desk-edge',{color:0x2c1a10,roughness:.5}));[[6,6],[w-6,6],[6,d-6],[w-6,d-6]].forEach(q=>this.box(g,q[0],h*.4,q[1],5,h*.8,5,dark));this.box(g,w/2,h*.45,4,w*.7,3,5,dark)}else if(item.type==='sink'){this.box(g,w/2,h*.42,d/2,w,h*.84,d,dark);this.box(g,w/2,h*.87,d/2,w*.88,5,d*.84,steel);this.box(g,w/2,h*.89,d/2,w*.58,4,d*.52,this.mat('sink-basin',{color:0x536166,roughness:.18,metalness:.88}));this.box(g,w/2,h*.91,d/2,w*.48,2,d*.42,dark);const tap=this.cyl(g,w*.77,h*1.01,d*.28,2.1,h*.24,steel,18);tap.rotation.z=rad(-12);const sp=this.cyl(g,w*.72,h*1.11,d*.28,1.8,w*.18,steel,18);sp.rotation.z=Math.PI/2}else if(item.type==='ro'){this.box(g,w/2,h*.52,3,w,h,6,dark);for(let i=0;i<3;i++)this.cyl(g,w*(.24+i*.26),h*.48,d*.53,w*.085,h*.72,i===2?blue:white,18);this.box(g,w/2,h*.84,d*.53,w*.82,8,d*.55,steel)}else if(item.type==='tank'){this.cyl(g,w/2,h/2,d/2,Math.min(w,d)*.44,h,blue,24);this.cyl(g,w/2,h+3,d/2,Math.min(w,d)*.34,6,dark,24)}else if(item.type==='plant'){this.cyl(g,w/2,h*.12,d/2,w*.23,h*.24,wood,16);for(let i=0;i<10;i++){const l=this.box(g,w/2+Math.cos(i*.9)*w*.16,h*(.37+i%4*.13),d/2+Math.sin(i*.9)*d*.16,w*.17,h*.36,d*.08,green);l.rotation.set(0,i*.9,(i%2?1:-1)*.28)}}else if(item.type==='shelf'||item.type==='cart'){const n=item.type==='cart'?3:5;for(let i=0;i<n;i++)this.box(g,w/2,5+i*(h-8)/(n-1),d/2,w,5,d,dark);[[3,3],[w-3,3],[3,d-3],[w-3,d-3]].forEach(q=>this.box(g,q[0],h/2,q[1],5,h,5,steel))}else if(item.type==='cabinet'||item.type==='misting'){this.box(g,w/2,h/2,d/2,w,h,d,dark);this.box(g,w/2,h/2,d+.7,2,h*.88,1.3,steel);this.box(g,w*.76,h*.54,d+1.3,3,12,2.4,steel)}else if(item.type==='door'){
      const frame=this.mat('p38-door-frame',{color:0x343a3d,roughness:.24,metalness:.82}),leaf=this.mat('p38-door-leaf',{color:0x6b4228,roughness:.42,metalness:.04}),wood2=this.mat('p38-door-panel',{color:0x3d2418,roughness:.55}),trim=this.mat('p38-door-trim',{color:0x9b7048,roughness:.32,metalness:.16});
      const thick=Math.max(7,d*.72),front=d/2+thick*.36;
      const jamb=this.premiumBox(g,w/2,h/2,d/2,w,h,thick,frame,0xc5ced0,.78);
      this.premiumBox(g,w/2,h/2,front,Math.max(12,w-14),Math.max(16,h-14),Math.max(3,d*.26),leaf,0xc68b55,.72);
      for(const x of [5,w-5])this.premiumBox(g,x,h/2,front+2,9,h,Math.max(4,d*.30),trim,0xe3b072,.78);
      for(const y of [5,h-5])this.premiumBox(g,w/2,y,front+2,w,9,Math.max(4,d*.30),trim,0xe3b072,.78);
      for(const y of [h*.29,h*.70]){this.premiumBox(g,w/2,y,front+4,Math.max(14,w-28),Math.max(18,h*.25),2.2,wood2,0x8f6647,.66);this.premiumBox(g,w/2,y,front+5.3,Math.max(10,w-35),Math.max(12,h*.18),1.2,this.mat('p38-door-recess',{color:0x17120f,roughness:.7}),0x4d3b30,.5);}
      this.premiumBox(g,w/2,3,d/2,w+12,7,Math.max(10,d*.95),trim,0xe1b17b,.72);
      const plate=this.premiumBox(g,w*.82,h*.49,front+5,7,22,2.5,this.mat('p38-door-hardware',{color:0xb8c0c2,roughness:.14,metalness:.95}),0xe7ecee,.9);
      const knob=this.cyl(g,w*.82,h*.49,front+8,2.8,8,this.mat('p38-door-hardware',{color:0xb8c0c2,roughness:.14,metalness:.95}),28);knob.rotation.x=Math.PI/2;
      for(const y of [h*.22,h*.78])this.premiumBox(g,w*.07,y,front+4,3,16,3,this.mat('p38-door-hinge',{color:0x6f777a,roughness:.18,metalness:.95}),0xd1d8da,.85);
    }else if(item.type==='window'){
      const outer=this.mat('v41-window-outer',{color:0xe9edef,roughness:.22,metalness:.18}),inner=this.mat('v41-window-inner',{color:0xf8fafb,roughness:.18,metalness:.12});
      const glass=this.pmat('p38-window-glass',{color:0xa7dff1,emissive:0x173e4c,emissiveIntensity:.32,transparent:true,opacity:.28,roughness:.025,metalness:0,transmission:.86,thickness:1.8,ior:1.46,clearcoat:1,clearcoatRoughness:.03,depthWrite:false,side:THREE.DoubleSide});
      const thick=Math.max(7,d*.72),front=d/2+thick*.28;
      this.premiumBox(g,w/2,h/2,d/2,w,h,thick,outer,0xd4dde0,.84);
      this.premiumBox(g,w/2,h/2,front,Math.max(12,w-18),Math.max(12,h-18),Math.max(2,d*.15),glass,0xd9f7ff,.72);
      for(const x of [6,w-6])this.premiumBox(g,x,h/2,front+2,10,h,Math.max(5,d*.40),inner,0xf0f6f7,.9);
      for(const y of [6,h-6])this.premiumBox(g,w/2,y,front+2,w,10,Math.max(5,d*.40),inner,0xf0f6f7,.9);
      this.premiumBox(g,w/2,h/2,front+3,5,h-18,Math.max(4,d*.36),inner,0xffffff,.82);
      this.premiumBox(g,w/2,h/2,front+3,w-18,5,Math.max(4,d*.36),inner,0xffffff,.82);
      // inner glazing beads and visible sill
      for(const x of [w*.27,w*.73])this.box(g,x,h/2,front+4,1.3,h-22,1.5,this.mat('p38-window-bead',{color:0xdce5e7,roughness:.2,metalness:.65}),false);
      const sill=this.premiumBox(g,w/2,-1,d/2+Math.max(8,d*.72),w+20,5,Math.max(14,d*1.15),this.mat('p38-window-sill',{color:0xd2d0c5,roughness:.38,metalness:.06}),0xf0eee5,.72);
      const oc=document.createElement('canvas');oc.width=2048;oc.height=2048;const ox=oc.getContext('2d'),og=ox.createLinearGradient(0,0,0,2048);og.addColorStop(0,'#86c8ef');og.addColorStop(.48,'#dff3ff');og.addColorStop(.49,'#8da58d');og.addColorStop(1,'#334b38');ox.fillStyle=og;ox.fillRect(0,0,2048,2048);for(let k=0;k<90;k++){const xx=(k*173)%2048,yy=1050+((k*97)%900),rr=35+((k*31)%95);ox.fillStyle=k%3?'rgba(35,91,52,.48)':'rgba(72,120,68,.38)';ox.beginPath();ox.arc(xx,yy,rr,0,Math.PI*2);ox.fill();}const ot=new THREE.CanvasTexture(oc);ot.colorSpace=THREE.SRGBColorSpace;ot.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());const skyMat=new THREE.MeshBasicMaterial({map:ot,toneMapped:false});const sky=this.box(g,w/2,h/2,front-2,Math.max(8,w-28),Math.max(8,h-28),.5,skyMat,false);sky.renderOrder=-2;
    }else if(item.type==='fan'){this.box(g,w/2,h/2,d/2,w,h,d,dark);for(let i=0;i<4;i++){const b=this.box(g,w/2,h/2,d+2,w*.38,5,3,steel);b.rotation.z=i*Math.PI/2}}else if(item.type==='light'){this.box(g,w/2,h/2,d/2,w,h,d,dark);this.box(g,w/2,h*.16,d/2,w*.82,2,d*.62,this.mat('led',{color:0xffe3a6,emissive:0xff9b32,emissiveIntensity:2.2}))}else if(item.type==='sensor'||item.type==='thermostat'){this.box(g,w/2,h/2,d/2,w,h,d,white);this.box(g,w/2,h*.57,d+.8,w*.68,h*.22,1.6,this.mat('display',{color:0x182829,emissive:0x2bbd83,emissiveIntensity:.7}))}else this.box(g,w/2,h/2,d/2,w,h,d,dark);return g;
  }
  transform(root,item){const r=((item.rotation%360)+360)%360,z=item.elevation||0;root.rotation.y=-rad(r);if(r===90)root.position.set(item.x+item.d,z,item.y);else if(r===180)root.position.set(item.x+item.w,z,item.y+item.d);else if(r===270)root.position.set(item.x,z,item.y+item.w);else root.position.set(item.x,z,item.y);if(['window','door'].includes(item.type.split('-')[0])&&item.wall){const half=item.d/2;if(item.wall==='north')root.position.z=-half*.5;if(item.wall==='south')root.position.z=this.room.d+half*.5;if(item.wall==='west')root.position.x=-half*.5;if(item.wall==='east')root.position.x=this.room.w+half*.5;}}
  addObject(item,preview=false){const root=item.rackId?this.assembly(item):this.prop(item);this.contactShadow(root,item);root.userData.roomItem=item;root.traverse(o=>o.userData.roomRoot=root);this.transform(root,item);this.itemGroup.add(root);if(!preview)this.objects.set(item.id,root);return root}
  bounds(i){return bounds(i)} rect(i){const b=this.bounds(i);return{x:i.x,y:i.y,w:b.w,d:b.d}} collision(i){return this.items.some(o=>overlaps(i,o))}
  nearestWall(i){
    const b=this.bounds(i),cx=i.x+b.w/2,cy=i.y+b.d/2;
    const distances={north:Math.max(0,cy),south:Math.max(0,this.room.d-cy),west:Math.max(0,cx),east:Math.max(0,this.room.w-cx)};
    return Object.entries(distances).sort((a,b)=>a[1]-b[1])[0][0];
  }
  snapItem(i){
    let b=this.bounds(i),g=Math.max(5,this.room.grid);
    // Explicit wall placement always wins. This also works for assemblies/racks.
    if(i.rackId && i.wall){
      i.rotation={north:0,east:90,south:180,west:270}[i.wall] ?? i.rotation;
      b=this.bounds(i); attachWall(i,this.room);
      i.x=Math.round(i.x); i.y=Math.round(i.y); attachWall(i,this.room); return;
    }
    if(['door','window'].includes(i.type.split('-')[0])&&i.wall){
      // Wall openings always belong to exactly one wall. While dragging, the nearest wall wins.
      i.wall=this.nearestWall(i);
      i.rotation={north:0,east:90,south:180,west:270}[i.wall];
      b=this.bounds(i);
      attachWall(i,this.room);
      if(i.wall==='north'||i.wall==='south') i.x=Math.round(i.x); else i.y=Math.round(i.y);
      attachWall(i,this.room);
      return;
    }
    if(this.snapEnabled){
      i.x=Math.round(i.x/g)*g;i.y=Math.round(i.y/g)*g;
      const t=18,n={l:i.x<t,n:i.y<t,r:this.room.w-i.x-b.w<t,s:this.room.d-i.y-b.d<t};
      // Volně v místnosti opravdu znamená volně: sestavy se samy nepřehazují mezi stěnami.
      if(!i.rackId){if(n.l)i.x=0;if(n.n)i.y=0;if(n.r)i.x=this.room.w-b.w;if(n.s)i.y=this.room.d-b.d;}
    }
    i.x=Math.round(clamp(i.x,0,Math.max(0,this.room.w-b.w)));
    i.y=Math.round(clamp(i.y,0,Math.max(0,this.room.d-b.d)));
    attachWall(i,this.room);
  }
  propDims(t){const extra=window.IR_HABITAT_CATALOG?.[t];if(extra)return [extra.w,extra.d,extra.h];return({desk:[140,70,85],sink:[100,65,92],ro:[70,55,175],tank:[120,100,135],misting:[110,28,185],cabinet:[80,50,190],shelf:[110,45,190],cart:[75,45,105],fan:[45,30,180],light:[120,18,18],heater:[55,30,95],sensor:[18,6,25],thermostat:[18,6,25],'pipe-water':[100,4,4],'pipe-drain':[100,4,4],'pipe-cable':[100,4,4],plant:[55,55,125],door:[90,15,205],window:[120,12,100]})[t]||[80,50,90]}
  pipe(i){const g=new THREE.Group,color={'pipe-water':0x469ac6,'pipe-drain':0x7c8891,'pipe-cable':0xd08a47}[i.type],length=Math.max(i.w,i.d,i.h),radius=Math.max(.5,Math.min(i.w,i.d,i.h)/2),m=this.mat(i.type,{color,roughness:.4,metalness:.4}),tube=this.cyl(g,i.w/2,i.h/2,i.d/2,radius,length,m,20);if(i.w===length)tube.rotation.z=Math.PI/2;else if(i.d===length)tube.rotation.x=Math.PI/2;return g}
  activeCamera(){return this.view==='top'?this.cameraTop:this.view==='illustration'?this.cameraIllustration:this.camera3d}
  ndc(e){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1)} floorPoint(e){this.ndc(e);this.raycaster.setFromCamera(this.pointer,this.activeCamera());const p=new THREE.Vector3;return this.raycaster.ray.intersectPlane(this.floorPlane,p)?p:null} pick(e){this.selectedHabitat=null;this.ndc(e);this.raycaster.setFromCamera(this.pointer,this.activeCamera());for(const h of this.raycaster.intersectObjects([...this.objects.values()],true)){this.selectedHabitat=h.object.userData.habitat||null;const r=h.object.userData.roomRoot;if(r?.userData.roomItem)return r.userData.roomItem}return null}
  select(item){const picker=$('[data-room-object]');if(picker)picker.value=item?.id??'';this.selected=item?.id??null;if(this.selection){this.scene.remove(this.selection);this.selection.geometry.dispose();this.selection.material.dispose();this.selection=null}if(item){const o=this.objects.get(item.id);if(o){this.selection=new THREE.BoxHelper(o,0xff8d2d);this.selection.material.depthTest=false;this.selection.renderOrder=50;this.scene.add(this.selection)}}this.inspector();this.fillEditor(item);this.habitatDetail();this.habitatPicker(item)}
  habitatPicker(item){
    const host=$('[data-room-habitats]');if(!host)return;host.replaceChildren();const blocks=this.assemblies[item?.rackId]?.blocks||[];
    for(const h of blocks){if(h.reserved)continue;const b=document.createElement('button');b.type='button';b.className='hs-room-habitat';b.setAttribute('aria-label','Detail ubikace '+h.name);const status=document.createElement('i');status.className=h.occupied?'occupied':'';const copy=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=h.name;sub.textContent=h.occupied?(h.animal||'Obsazená'):'Volná';copy.append(title,sub);b.append(status,copy);b.addEventListener('click',()=>{this.selectedHabitat=h;this.habitatDetail();});host.append(b);}
  }
  habitatDetail(){
    let panel=document.querySelector('[data-habitat-detail]');if(!panel){panel=document.createElement('section');panel.dataset.habitatDetail='';document.querySelector('.hs13-inspector')?.append(panel);}
    const h=this.selectedHabitat;panel.replaceChildren();if(!h)return;
    const title=document.createElement('h3');title.textContent=h.name;panel.append(title);
    const info=document.createElement('p');info.textContent=`${h.w} × ${h.h} × ${h.d} cm · ${h.type} · ${h.occupied?'Obsazená':'Volná'}`;panel.append(info);
    if(h.photo){const photo=document.createElement('img');photo.src=h.photo;photo.alt=h.animal||h.name;photo.style.cssText='width:100%;max-height:140px;object-fit:cover;border-radius:8px';panel.append(photo);}
    for(const animal of h.animals||[]){const link=document.createElement('a');link.href='animal.php?id='+Number(animal.id);link.textContent=animal.name;link.className='widget-row';panel.append(link);}
    const link=document.createElement('a');link.href='habitats.php?id='+Number(h.habitatId);link.textContent='Otevřít ubikaci →';panel.append(link);
  }
  fillEditor(item){const form=$('[data-room-editor]');if(!form)return;form.hidden=!item;if(!item)return;for(const key of ['x','y','w','d','h','elevation','wall','label','appearance']){const field=form.elements.namedItem(key);field.value=item[key]??'';field.disabled=(!!item.rackId&&['w','d','h','label'].includes(key))||(key==='appearance'&&item.type!=='custom'); if(['x','y','elevation'].includes(key)) field.value=Math.round(Number(item[key]||0));}form.querySelector('[role="status"]').textContent='';}
  editItem(event){event.preventDefault();const i=this.items.find(x=>x.id===this.selected);if(!i)return;const form=event.currentTarget,next={...i};for(const key of ['x','y','w','d','h','elevation'])if(!form.elements.namedItem(key).disabled)next[key]=Number(form.elements.namedItem(key).value);next.wall=form.elements.namedItem('wall').value;next.label=form.elements.namedItem('label').value.trim()||i.label;next.appearance=form.elements.namedItem('appearance').value; next.x=Math.round(next.x); next.y=Math.round(next.y); next.elevation=Math.round(next.elevation);if(next.type.startsWith('door'))next.elevation=0;attachWall(next,this.room);const b=bounds(next);if(![next.x,next.y,next.w,next.d,next.h,next.elevation].every(Number.isFinite)||next.w<1||next.d<1||next.h<1||next.elevation<0||next.x<0||next.y<0||next.x+b.w>this.room.w||next.y+b.d>this.room.d||next.elevation+next.h>this.room.h||this.collision(next)){form.querySelector('[role="status"]').textContent='Objekt přesahuje místnost nebo se překrývá s jiným objektem.';return;}const old=this.objects.get(i.id);this.itemGroup.remove(old);this.disposeObject(old);Object.assign(i,next);this.addObject(i);this.buildRoom();this.select(i);form.querySelector('[role="status"]').textContent='Náhled upraven. Ulož místnost.';this.markDirty();}
  disposeObject(root){root?.traverse(o=>{o.geometry?.dispose();if(o.isSprite||o.userData.ownedTexture){o.material.map?.dispose();o.material.dispose();}})}
  inspector(){const i=this.items.find(x=>x.id===this.selected),t=$('[data-hs13-inspector-title]'),p=$('[data-hs13-selected-preview]');if(!i){if(t)t.textContent='Vyber objekt';if(p)p.innerHTML='<span></span><div><b>Nic není vybráno</b><small>Klikni na sestavu nebo vybavení.</small></div>';$$('[data-prop]').forEach(e=>e.textContent='—');return}if(t)t.textContent=i.label;if(p)p.innerHTML=`<span class="${i.rackId?'is-rack':'is-prop'}"></span><div><b>${this.escape(i.label)}</b><small>${i.rackId?'3D sestava':'3D vybavení'} · ${Math.round(i.w)} × ${Math.round(i.h)} × ${Math.round(i.d)} cm</small></div>`;Object.entries({x:`${Math.round(i.x)} cm`,y:`${Math.round(i.y)} cm`,w:`${Math.round(i.w)} cm`,d:`${Math.round(i.d)} cm`,h:`${Math.round(i.h)} cm`,rotation:`${i.rotation}°`}).forEach(([k,v])=>{const e=$(`[data-prop="${k}"]`);if(e)e.textContent=v})}
  escape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  clearPlacement(){if(this.preview)this.itemGroup.remove(this.preview);this.placement=this.preview=null;this.invalid=false;this.canvas.parentElement.classList.remove('is-placing');const m=$('[data-hs13-placement-message]');if(m)m.hidden=true;$$('[data-hs13-place-rack],[data-hs13-place-prop]').forEach(b=>b.classList.remove('is-placing'))}
  startRackPlacement(id,b){const a=this.assemblies[+id]||this.assemblies[String(id)];if(!a)return;this.clearPlacement();this.placement={kind:'rack',rackId:+id,type:'rack',label:a.name,w:+a.w||40,d:+a.d||40,h:+a.h||40,rotation:0,x:0,y:0,id:-1,style:a.style};this.preview=this.addObject(this.placement,true);this.placementUi(b)}
  startPropPlacement(type,b){const[w,d,h]=this.propDims(type);this.clearPlacement();this.placement={kind:'prop',rackId:null,type,label:type,w,d,h,wall:['door','window'].includes(type.split('-')[0])?'north':'',rotation:0,x:0,y:0,id:-2};this.preview=this.addObject(this.placement,true);this.placementUi(b)}
  placementUi(b){b?.classList.add('is-placing');this.canvas.parentElement.classList.add('is-placing');const m=$('[data-hs13-placement-message]');if(m)m.hidden=false}
  updatePlacement(e){if(!this.placement)return;const p=this.floorPoint(e);if(!p)return;const b=this.bounds(this.placement);this.placement.x=p.x-b.w/2;this.placement.y=p.z-b.d/2;this.snapItem(this.placement);this.invalid=this.collision(this.placement);this.transform(this.preview,this.placement);if(this.preview)this.preview.scale.setScalar(this.invalid?.985:1)}
  commitPlacement(){const i=this.placement;if(!i||this.invalid)return;for(const form of [this.rackForm,this.propForm]){if(!form)continue;let field=form.elements.namedItem('rotation');if(!field){field=document.createElement('input');field.type='hidden';field.name='rotation';form.append(field);}field.value=i.rotation;}if(i.kind==='rack'&&this.rackForm){$('[data-hs13-place-rack-id]',this.rackForm).value=i.rackId;$('[data-hs13-place-rack-x]',this.rackForm).value=Math.round(i.x);$('[data-hs13-place-rack-y]',this.rackForm).value=Math.round(i.y);this.rackForm.submit()}else if(this.propForm){$('[data-hs13-place-prop-type]',this.propForm).value=i.type;$('[data-hs13-place-prop-x]',this.propForm).value=Math.round(i.x);$('[data-hs13-place-prop-y]',this.propForm).value=Math.round(i.y);const wall=this.propForm.elements.namedItem('wall_side'),elev=this.propForm.elements.namedItem('elevation_cm');if(wall)wall.value=i.wall||'';if(elev)elev.value=Math.round(i.elevation||0);this.propForm.submit()}}
  rotate(){const i=this.placement||this.items.find(x=>x.id===this.selected);if(!i)return;const old={rotation:i.rotation,x:i.x,y:i.y,wall:i.wall};if(['door','window'].includes(i.type.split('-')[0])&&i.wall){const walls=['north','east','south','west'];i.wall=walls[(walls.indexOf(i.wall)+1)%4];i.rotation={north:0,east:90,south:180,west:270}[i.wall];}else{i.rotation=(i.rotation+90)%360;}this.snapItem(i);if(this.collision(i))Object.assign(i,old);this.transform(this.placement?this.preview:this.objects.get(i.id),i);this.selection?.update();this.inspector();this.fillEditor(i);this.markDirty();}
  save(){const f=$('[data-hs13-save-room-form]');if(!f)return;for(const i of this.items){this.snapItem(i);i.x=Math.round(i.x);i.y=Math.round(i.y);this.transform(this.objects.get(i.id),i)}const payload=this.items.map((i,n)=>({id:Number(i.id),label:i.label,appearance:i.appearance||'graphite',x:Number(i.x),y:Number(i.y),w:Math.round(i.w*2)/2,d:Math.round(i.d*2)/2,h:Math.round(i.h*2)/2,elevation:Math.round(i.elevation||0),wall:i.wall||'',rotation:Number(i.rotation)||0,zIndex:20+n}));$('[data-hs13-room-json]',f).value=JSON.stringify(payload);const a=$('[data-hs13-room-floor]',f),b=$('[data-hs13-room-wall]',f);if(a)a.value=this.room.floor;if(b)b.value=this.room.wall;const btn=$('[data-hs13-save-room]');if(btn){btn.disabled=true;btn.textContent='Ukládám…'}this.setSaveState('Ukládám…');this.dirty=false;if(typeof f.requestSubmit==='function')f.requestSubmit();else f.submit()}
  setSaveState(text,state=''){const e=$('[data-hs-premium-save-state]');if(!e)return;e.textContent=text;e.className='hs-premium-save-state'+(state?' is-'+state:'')}
  markDirty(){this.dirty=true;this.setSaveState('Neuložené změny','dirty')}
  fitRoom(){this.target.set(this.room.w/2,Math.min(105,this.room.h*.36),this.room.d/2);this.distance=Math.max(this.room.w,this.room.d)*1.38;this.zoom=.82;this.resize(true);this.needsRender=true}
  focusSelected(){const i=this.items.find(x=>x.id===this.selected);if(!i){this.fitRoom();return}const b=this.bounds(i);this.target.set(i.x+b.w/2,Math.min(this.room.h*.72,Math.max(25,i.h*.46)),i.y+b.d/2);this.distance=Math.max(110,Math.max(b.w,b.d,i.h)*2.35);this.zoom=1.12;this.resize(true);this.needsRender=true}
  // --- Free camera helpers (fullscreen room planner). Pure view-state; never touches item x/y/rotation. ---
  clampTargetToRoom(pad=60){this.target.x=clamp(this.target.x,-pad,this.room.w+pad);this.target.z=clamp(this.target.z,-pad,this.room.d+pad);this.target.y=clamp(this.target.y,0,this.room.h)}
  setCardinalView(yawDeg,pitchDeg){if(this.view==='top')this.setView('perspective');this.yaw=rad(yawDeg);this.pitch=rad(pitchDeg);this.needsRender=true}
  resetView(){this.setView(this.initialCamera.view);this.yaw=this.initialCamera.yaw;this.pitch=this.initialCamera.pitch;this.distance=this.initialCamera.distance;this.zoom=this.initialCamera.zoom;this.target.copy(this.initialCamera.target);this.resize(true);this.needsRender=true}
  isFullscreenActive(){return !!document.fullscreenElement||this.isFullscreenState}
  toggleFullscreen(){
    const root=$('[data-hs13-root]'),target=$('[data-hs13-fullscreen-target]')||root;if(!root)return;
    const goingFullscreen=!root.classList.contains('is-fullscreen-room');
    // CSS fallback state drives the layout regardless of Fullscreen API support/permission, so the
    // editor still works full-viewport even where requestFullscreen() is unavailable or rejected.
    root.classList.toggle('is-fullscreen-room',goingFullscreen);this.isFullscreenState=goingFullscreen;
    const btn=$('[data-hs13-fullscreen-toggle]');if(btn)btn.setAttribute('aria-pressed',String(goingFullscreen));
    if(goingFullscreen&&target?.requestFullscreen){target.requestFullscreen().catch(()=>{/* CSS fallback already active */});}
    else if(!goingFullscreen&&document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}
    this.scheduleResize();
  }
  syncFullscreenState(){
    const root=$('[data-hs13-root]');if(!root)return;
    if(!document.fullscreenElement&&this.isFullscreenState){
      // Native fullscreen ended (e.g. browser Esc handling) - mirror it in the CSS-fallback state too.
      root.classList.remove('is-fullscreen-room');this.isFullscreenState=false;
      const btn=$('[data-hs13-fullscreen-toggle]');if(btn)btn.setAttribute('aria-pressed','false');
    }
    this.scheduleResize();
  }
  setQuality(mode){const hq=mode!=='balanced',dpr=Math.min(hq?2.5:1.5,window.devicePixelRatio||1);this.qualityDpr=dpr;if(this.renderer){this.renderer.shadowMap.enabled=true;this.renderer.setPixelRatio(dpr);this.lastDpr=0;this.resize(true)}this.setSaveState(hq?'HQ režim':'Vyvážený režim')}
  setView(v){this.view=v==='top'?'top':v==='illustration'?'illustration':'perspective';if(this.view==='illustration'){this.pitch=rad(52);this.yaw=rad(-28);}$$('[data-hs15-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.hs15View===(this.view==='perspective'?'iso':this.view)));const t=$('[data-hs15-view-title]');if(t)t.textContent=this.view==='top'?'2D půdorys':this.view==='illustration'?'Provozní 3D':'3D místnost · 360°';this.resize(true);this.needsRender=true}

  scheduleResize(){if(this.resizeQueued||this.destroyed)return;this.resizeQueued=true;requestAnimationFrame(()=>{this.resizeQueued=false;this.resize()})}
  resize(force=false){if(!this.renderer||!this.canvas?.isConnected)return;const host=this.canvas.parentElement,r=host.getBoundingClientRect(),w=Math.max(320,Math.round(r.width||host.clientWidth||320)),h=Math.max(320,Math.round(r.height||host.clientHeight||610)),dpr=this.qualityDpr||Math.min(2,window.devicePixelRatio||1);if(!force&&w===this.lastWidth&&h===this.lastHeight&&dpr===this.lastDpr&&this.zoom===this.lastZoom)return;this.lastZoom=this.zoom;this.lastWidth=w;this.lastHeight=h;this.lastDpr=dpr;this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.camera3d.aspect=w/h;this.camera3d.updateProjectionMatrix();const s=Math.max(this.room.w,this.room.d)*.58/this.zoom;Object.assign(this.cameraTop,{left:-s*w/h,right:s*w/h,top:s,bottom:-s});this.cameraTop.updateProjectionMatrix();const span=Math.max(this.room.w,this.room.d)*.49/this.zoom;Object.assign(this.cameraIllustration,{left:-span*w/h,right:span*w/h,top:span,bottom:-span});this.cameraIllustration.updateProjectionMatrix();this.needsRender=true}
  updateCamera(){if(this.view==='top'){this.cameraTop.position.set(this.target.x,1200,this.target.z);this.cameraTop.up.set(0,0,-1);this.cameraTop.lookAt(this.target.x,0,this.target.z)}else{const d=this.distance/this.zoom,c=Math.cos(this.pitch);const camera=this.activeCamera();camera.position.set(this.target.x+Math.sin(this.yaw)*c*d,this.target.y+Math.sin(this.pitch)*d,this.target.z+Math.cos(this.yaw)*c*d);camera.lookAt(this.target)}const c=this.activeCamera(),south=c.position.z>=this.room.d/2,east=c.position.x>=this.room.w/2;const far=south?'north':'south',near=south?'south':'north',farSide=east?'west':'east',nearSide=east?'east':'west';for(const side of ['north','south','west','east']){const grp=this.walls[side],trim=this.trims[side];if(!grp)continue;const isNear=side===near,isFar=side===far,isSide=!isNear&&!isFar;grp.visible=!isNear;trim.visible=!isNear;if(grp.visible)grp.traverse(o=>{if(!o.isMesh)return;if(!o.userData.hsWallMaterial){o.material=o.material.clone();o.userData.hsWallMaterial=true}o.material.transparent=isSide;o.material.opacity=isSide?(side===nearSide?0.16:0.26):1;o.material.depthWrite=!isSide;});if(trim.visible)trim.traverse(o=>{if(!o.isMesh)return;if(!o.userData.hsWallMaterial){o.material=o.material.clone();o.userData.hsWallMaterial=true}o.material.transparent=isSide;o.material.opacity=isSide?0.42:1;o.material.depthWrite=!isSide;});}}
  bind(){
    $('[data-room-object]')?.addEventListener('change',e=>this.select(this.items.find(i=>String(i.id)===e.target.value)));
    $('[data-room-editor]')?.addEventListener('submit',e=>this.editItem(e));
    $('[data-hs-premium-fit]')?.addEventListener('click',()=>this.fitRoom());$('[data-hs-premium-focus]')?.addEventListener('click',()=>this.focusSelected());$('[data-hs-premium-quality]')?.addEventListener('change',e=>this.setQuality(e.target.value));this.setSaveState('Připraveno');
    window.addEventListener('beforeunload',e=>{if(this.dirty){e.preventDefault();e.returnValue='';}});
    this._onWindowResize=()=>this.scheduleResize();window.addEventListener('resize',this._onWindowResize,{passive:true});
    this.canvas.addEventListener('pointerup',()=>{if(this.drag){this.markDirty();queueMicrotask(()=>{this.buildRoom();this.fillEditor(this.items.find(i=>i.id===this.selected));});}});
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fail('3D kontext byl přerušen. Obnov stránku.')},{once:true});this.canvas.addEventListener('contextmenu',e=>e.preventDefault());this.canvas.addEventListener('pointerdown',e=>{if(this.placement){this.updatePlacement(e);this.commitPlacement();return}if(e.shiftKey||e.button===1){this.panStart={x:e.clientX,y:e.clientY,target:this.target.clone()};this.canvas.setPointerCapture(e.pointerId);e.preventDefault();return;}const i=this.pick(e),p=this.floorPoint(e);if(i&&p){this.select(i);this.drag={id:i.id,start:p.clone(),x:i.x,y:i.y,r:i.rotation,wall:i.wall}}else if(this.view==='top'){this.panStart={x:e.clientX,y:e.clientY,target:this.target.clone()};}else if(this.view!=='top'){this.orbit={x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch};this.canvas.classList.add('is-orbiting')}this.canvas.setPointerCapture(e.pointerId)});
    this.canvas.addEventListener('pointermove',e=>{if(this.panStart){const camera=this.activeCamera(),scale=camera.isOrthographicCamera?(camera.top-camera.bottom)/this.canvas.clientHeight:2*Math.tan(rad(21))*this.distance/this.zoom/this.canvas.clientHeight;const dx=(e.clientX-this.panStart.x)*scale,dy=(e.clientY-this.panStart.y)*scale,yaw=this.view==='top'?0:this.yaw;this.target.copy(this.panStart.target).add(new THREE.Vector3(-dx*Math.cos(yaw)+dy*Math.sin(yaw),0,dx*Math.sin(yaw)+dy*Math.cos(yaw)));return;}if(this.placement){this.updatePlacement(e);return}if(this.orbit){this.yaw=this.orbit.yaw-(e.clientX-this.orbit.x)*.008;this.pitch=clamp(this.orbit.pitch+(e.clientY-this.orbit.y)*.006,rad(14),rad(70));return}if(!this.drag)return;const i=this.items.find(x=>x.id===this.drag.id),p=this.floorPoint(e);if(!i||!p)return;if(Math.hypot(p.x-this.drag.start.x,p.z-this.drag.start.z)>Math.max(12,this.room.grid))i.wall='';const b=this.bounds(i);i.x=Math.round(clamp(this.drag.x+p.x-this.drag.start.x,0,Math.max(0,this.room.w-b.w)));i.y=Math.round(clamp(this.drag.y+p.z-this.drag.start.z,0,Math.max(0,this.room.d-b.d)));if(['door','window'].includes(i.type.split('-')[0])&&i.wall)this.snapItem(i);this.invalid=this.collision(i);this.transform(this.objects.get(i.id),i);if(this.selection){this.selection.material.color.set(this.invalid?0xff3434:0xff8d2d);this.selection.update()}this.inspector()});
    const end=()=>{this.panStart=null;if(this.drag){const i=this.items.find(x=>x.id===this.drag.id);if(i){this.snapItem(i);if(this.collision(i))Object.assign(i,{x:this.drag.x,y:this.drag.y,rotation:this.drag.r,wall:this.drag.wall});this.transform(this.objects.get(i.id),i)}this.drag=null;this.invalid=false;if(this.selection){this.selection.material.color.set(0xff8d2d);this.selection.update()}this.inspector()}this.orbit=null;this.canvas.classList.remove('is-orbiting')};this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);
    this.canvas.addEventListener('dragover',e=>{if(!this.placement)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';this.updatePlacement(e)});this.canvas.addEventListener('drop',e=>{if(!this.placement)return;e.preventDefault();this.updatePlacement(e);this.libraryDropAccepted=!this.invalid;if(this.libraryDropAccepted)this.commitPlacement()});
    // Wheel scrolls the page normally in inline mode; only in fullscreen (see isFullscreenActive() below) does it zoom.
    $('[data-hs13-grid]')?.addEventListener('change',e=>{this.showGrid=e.target.checked;this.grid.visible=this.showGrid});$('[data-hs13-snap]')?.addEventListener('change',e=>this.snapEnabled=e.target.checked);$('[data-hs13-floor]')?.addEventListener('change',e=>{this.room.floor=e.target.value;this.markDirty();this.buildRoom()});$('[data-hs13-wall]')?.addEventListener('change',e=>{this.room.wall=e.target.value;this.markDirty();this.buildRoom()});$('[data-hs13-camera-left]')?.addEventListener('click',()=>{if(this.view!=='top')this.yaw-=rad(15)});$('[data-hs13-camera-right]')?.addEventListener('click',()=>{if(this.view!=='top')this.yaw+=rad(15)});$('[data-hs13-zoom-out]')?.addEventListener('click',()=>{this.zoom=clamp(this.zoom*.82,.28,2.2);this.resize()});$('[data-hs13-zoom-in]')?.addEventListener('click',()=>{this.zoom=clamp(this.zoom*1.16,.28,2.2);this.resize()});$$('[data-hs15-view]').forEach(b=>b.addEventListener('click',()=>this.setView(b.dataset.hs15View)));$('[data-hs13-rotate]')?.addEventListener('click',()=>this.rotate());$('[data-hs13-save-room]')?.addEventListener('click',()=>this.save());$('[data-hs13-delete]')?.addEventListener('click',()=>{const i=this.items.find(x=>x.id===this.selected);if(!i||!confirm(`Odstranit „${i.label}“ z místnosti?`))return;const f=$('[data-hs13-delete-item-form]');$('[data-hs13-delete-item-id]',f).value=i.id;f.submit()});
    // --- Extended free camera (fullscreen room planner): presets, dblclick target, wheel-zoom-in-fullscreen ---
    $('[data-hs13-view-iso]')?.addEventListener('click',()=>this.setCardinalView(-28,52));
    $('[data-hs13-view-front]')?.addEventListener('click',()=>this.setCardinalView(0,20));
    $('[data-hs13-view-left]')?.addEventListener('click',()=>this.setCardinalView(-90,20));
    $('[data-hs13-view-right]')?.addEventListener('click',()=>this.setCardinalView(90,20));
    $('[data-hs13-view-reset]')?.addEventListener('click',()=>this.resetView());
    this.canvas.addEventListener('dblclick',e=>{
      if(this.view==='top'||this.placement)return;
      const i=this.pick(e);
      if(i){const b=this.bounds(i);this.target.set(i.x+b.w/2,clamp((i.h||40)*.5,20,this.room.h*.8),i.y+b.d/2);}
      else{const p=this.floorPoint(e);if(p)this.target.set(p.x,this.target.y,p.z);}
      this.clampTargetToRoom();this.needsRender=true;
    });
    this.canvas.addEventListener('wheel',e=>{
      if(!this.isFullscreenActive())return; // inline (non-fullscreen) mode intentionally leaves wheel to page scroll
      e.preventDefault();const factor=e.deltaY>0?.9:1.1;this.zoom=clamp(this.zoom*factor,.24,2.8);this.resize();
    },{passive:false});
    $('[data-hs13-help-toggle]')?.addEventListener('click',e=>{const o=$('[data-hs13-help-overlay]');if(!o)return;const show=o.hidden;o.hidden=!show;e.currentTarget.setAttribute('aria-expanded',String(show));});
    $('[data-hs13-help-close]')?.addEventListener('click',()=>{const o=$('[data-hs13-help-overlay]');if(o)o.hidden=true;const t=$('[data-hs13-help-toggle]');if(t)t.setAttribute('aria-expanded','false');});
    $('[data-hs13-fullscreen-toggle]')?.addEventListener('click',()=>this.toggleFullscreen());
    $$('[data-hs13-drawer-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
      const which=btn.dataset.hs13DrawerToggle,root=$('[data-hs13-root]');if(!root)return;
      const panel=which==='library'?root.querySelector('.hs13-workspace>.hs13-sidebar:first-child'):root.querySelector('.hs13-workspace>.hs13-sidebar.hs13-inspector');
      if(panel)panel.classList.toggle('hs13-drawer-open');
    }));
    document.addEventListener('fullscreenchange',()=>this.syncFullscreenState());
    window.addEventListener('keydown',e=>{if($('[data-hs13-root]')?.dataset.mode!=='room'||document.activeElement?.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k==='escape'){if(this.placement)this.clearPlacement();else if(this.isFullscreenActive())this.toggleFullscreen();}if(k==='f'&&!this.placement){e.preventDefault();this.toggleFullscreen();}if(k==='r'){e.preventDefault();this.rotate()}if(k==='q'&&this.view!=='top')this.yaw-=rad(15);if(k==='e'&&this.view!=='top')this.yaw+=rad(15);if(k==='g'){this.showGrid=!this.showGrid;this.grid.visible=this.showGrid;const c=$('[data-hs13-grid]');if(c)c.checked=this.showGrid}if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();this.save()}})
  }
  animate(){if(this.running||this.destroyed)return;this.running=true;let last=0;const f=(now)=>{if(this.destroyed||!this.renderer||!this.canvas?.isConnected){this.running=false;this.frame=0;return}const state=JSON.stringify([this.yaw,this.pitch,this.zoom,this.view,this.target.toArray(),this.selected,this.showGrid,this.items,this.room]);if(!document.hidden&&this.canvas.getClientRects().length&&(state!==this.renderState||this.needsRender||this.drag||this.orbit||this.placement)){last=now;this.updateCamera();this.selection?.update();this.renderer.render(this.scene,this.activeCamera());this.renderState=state;this.needsRender=false}this.frame=requestAnimationFrame(f)};this.frame=requestAnimationFrame(f)}
  fail(msg){this.destroyed=true;this.running=false;if(this.frame)cancelAnimationFrame(this.frame);if(this._onWindowResize)window.removeEventListener('resize',this._onWindowResize);const e=document.createElement('div');e.className='hs16-webgl-error';e.innerHTML=`<div><b>3D místnost není dostupná</b><span>${this.escape(msg)}</span></div>`;this.canvas.replaceWith(e)}
}

HabitatRoom3D.prototype.rendererVersion='v2';
window.HabitatRoom3D=HabitatRoom3D;
window.dispatchEvent(new CustomEvent('habitat-room-3d-ready'));
export{HabitatRoom3D};


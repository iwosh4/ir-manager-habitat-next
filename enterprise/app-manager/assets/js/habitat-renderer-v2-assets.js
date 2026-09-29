import * as THREE from '../vendor/three/three.module.js';

const rad=THREE.MathUtils.degToRad;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function profile(scene,g,x,y,z,w,h,d,mat,edge=0x879397){
  return scene.premiumBox(g,x,y,z,w,h,d,mat,edge,.38);
}
function cylinderBetween(a,b,r,mat,segments=16){
  const dir=new THREE.Vector3().subVectors(b,a),len=dir.length();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r*.86,len,segments),mat);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}
function leafGeometry(){
  const s=new THREE.Shape();s.moveTo(0,-1);s.bezierCurveTo(.58,-.62,.62,.42,0,1);s.bezierCurveTo(-.62,.42,-.58,-.62,0,-1);
  const geo=new THREE.ShapeGeometry(s,18);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,.16*(1-y*y)-.08*Math.abs(x));}
  geo.computeVertexNormals();return geo;
}
const LEAF=leafGeometry();

function plantCluster(scene,g,w,h,d,seed=0){
  const stem=scene.pmat('v2-stem',{color:0x314a2e,roughness:.82});
  const leafMats=[0x315d3a,0x3f7244,0x567f49].map((c,i)=>scene.pmat('v2-leaf-'+i,{color:c,roughness:.7,side:THREE.DoubleSide,clearcoat:.05}));
  for(let n=0;n<9;n++){
    const a=n*2.399+seed*.41,base=new THREE.Vector3(w*(.42+.12*Math.sin(a)),h*.08,d*(.44+.12*Math.cos(a))),top=new THREE.Vector3(w*(.5+.24*Math.sin(a*.73)),h*(.36+(n%5)*.095),d*(.48+.22*Math.cos(a*.83)));
    g.add(cylinderBetween(base,top,Math.max(.45,w*.006),stem,10));
    for(let k=0;k<3;k++){
      const t=.45+k*.22,pos=base.clone().lerp(top,t),leaf=new THREE.Mesh(LEAF,leafMats[(n+k)%leafMats.length]);
      leaf.scale.set(w*(.055+.01*(k%2)),h*(.07+.008*(n%3)),1);leaf.position.copy(pos);leaf.rotation.set(rad(70+(n%3)*6),a+k*.85,(n%2?1:-1)*rad(18));leaf.castShadow=true;g.add(leaf);
    }
  }
}
function branch(scene,g,a,b,r){
  const bark=scene.pmat('v2-bark',{color:0x5a3d27,map:scene.imageTexture('cork-bark-46.png',1,2),roughness:.96});
  const m=cylinderBetween(a,b,r,bark,14);g.add(m);return m;
}
function frontLabel(scene,g,block,w,h,d){
  const c=document.createElement('canvas');c.width=1024;c.height=150;const x=c.getContext('2d');
  x.fillStyle='rgba(5,9,11,.92)';x.roundRect(6,6,1012,138,18);x.fill();x.strokeStyle=block.occupied?'#f29a38':'#4b5b62';x.lineWidth=5;x.stroke();
  x.fillStyle='#f3f5f4';x.font='700 40px system-ui';x.textBaseline='middle';let t=String(block.animal||block.name||'Ubikace');while(x.measureText(t).width>920&&t.length>3)t=t.slice(0,-2)+'…';x.fillText(t,36,53);
  x.fillStyle='#aab4b7';x.font='27px system-ui';x.fillText(`${block.name||''}  ·  ${block.occupied?'obsazeno':'volné'}`,36,106);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;const m=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false});
  const p=new THREE.Mesh(new THREE.PlaneGeometry(w*.72,Math.min(h*.12,w*.72*150/1024)),m);p.position.set(w/2,Math.max(4,h*.085),d+1.9);p.renderOrder=60;g.add(p);
}

export function buildHabitatV2(block,depth,scene){
  const g=new THREE.Group(),w=+block.w||60,h=+block.h||60,d=+block.d||+depth||50,kind=scene.kind(block.type),lit=!!block.occupied;
  const frame=scene.pmat('v2-frame',{color:0x14191b,roughness:.23,metalness:.9,clearcoat:.12});
  const frameHi=scene.pmat('v2-frame-hi',{color:0x384246,roughness:.18,metalness:.94,clearcoat:.18});
  const glass=scene.pmat('v2-glass',{color:0xcbeaf2,roughness:.025,metalness:0,transparent:true,opacity:.22,transmission:.92,thickness:1.25,ior:1.48,clearcoat:1,clearcoatRoughness:.015,depthWrite:false,side:THREE.DoubleSide});
  const r=clamp(Math.min(w,h)*.024,1.4,2.8),front=d;

  if(kind==='box'){
    const tub=scene.pmat('v2-rack-tub',{color:0x667176,roughness:.42,metalness:.03,transparent:true,opacity:.82,clearcoat:.12});
    const lip=scene.pmat('v2-rack-lip',{color:0x171c1f,roughness:.28,metalness:.62});
    profile(scene,g,w/2,h*.47,d/2,w-r*2,h*.84,d-r*2,tub,0x93a0a4);profile(scene,g,w/2,h*.91,d/2,w,clamp(h*.13,4,8),d,lip,0x9aa4a7);
    profile(scene,g,w/2,h*.48,d+1,w*.48,clamp(h*.09,3,6),2.6,frameHi,0xb4bec0);
    for(let i=0;i<14;i++)profile(scene,g,w*(.14+i*.055),h*.91,d*.18,w*.022,1.2,d*.22,frameHi,0x9ea9ac);
    frontLabel(scene,g,block,w,h,d);return g;
  }
  if(kind==='incubation'||kind==='quarantine'){
    const shell=scene.pmat(kind==='incubation'?'v2-inc-shell':'v2-quar-shell',{color:kind==='incubation'?0xd6d8d5:0xe9ecea,roughness:.38,metalness:.08,clearcoat:.12});
    const gasket=scene.pmat('v2-gasket',{color:0x202628,roughness:.68});
    profile(scene,g,w/2,h/2,d/2,w,h,d,shell,0xf1f3ef);profile(scene,g,w/2,h*.5,d+1.2,w*.82,h*.72,2.2,gasket,0x485155);
    const display=scene.pmat('v2-display',{color:0x102226,emissive:kind==='incubation'?0x1a766f:0x275f68,emissiveIntensity:1.1,roughness:.12});
    profile(scene,g,w*.68,h*.84,d+2.5,w*.26,h*.09,2.5,display,0x78d4ca);
    for(let y=.2;y<.72;y+=.16)profile(scene,g,w/2,h*y,d+2,w*.72,2.1,2.4,gasket,0x5f6b6f);
    frontLabel(scene,g,block,w,h,d);return g;
  }

  // Premium aluminium construction. All dimensions still follow the database footprint.
  for(const x of [r/2,w-r/2])for(const z of [r/2,d-r/2])profile(scene,g,x,h/2,z,r,h,r,frame,0x738086);
  for(const y of [r/2,h-r/2])for(const z of [r/2,d-r/2])profile(scene,g,w/2,y,z,w,r,r,frame,0x738086);
  for(const y of [r/2,h-r/2])for(const x of [r/2,w-r/2])profile(scene,g,x,y,d/2,r,r,d,frame,0x738086);

  // Back / sides / top glass.
  scene.box(g,w/2,h/2,.35,w-r*2,h-r*2,.7,glass,false);
  scene.box(g,.35,h/2,d/2,.7,h-r*2,d-r*2,glass,false);scene.box(g,w-.35,h/2,d/2,.7,h-r*2,d-r*2,glass,false);
  scene.box(g,w/2,h-.4,d/2,w-r*2,.7,d-r*2,glass,false);

  // Two overlapping sliding front panes, lower track and proper handles.
  const paneW=(w-r*2)*.54,paneH=h-r*3.2;
  const p1=scene.box(g,w*.31,h*.5,front+.5,paneW,paneH,.55,glass,false),p2=scene.box(g,w*.69,h*.5,front+1.05,paneW,paneH,.55,glass,false);p1.renderOrder=p2.renderOrder=30;
  profile(scene,g,w/2,r*.72,front+1.3,w-r*1.2,r*.42,2.1,frameHi,0xa9b5b8);profile(scene,g,w/2,h-r*.72,front+1.3,w-r*1.2,r*.42,2.1,frameHi,0xa9b5b8);
  for(const x of [w*.47,w*.53])profile(scene,g,x,h*.5,front+2.1,r*.42,h*.12,1.6,frameHi,0xc4ced0);

  // Ventilation mesh / service channel.
  const vent=scene.pmat('v2-vent',{color:0x2c3437,roughness:.34,metalness:.82});
  profile(scene,g,w/2,h*.09,front+1.2,w-r*1.4,h*.09,1.7,vent,0x9ba6a8);
  for(let i=0;i<18;i++)profile(scene,g,w*(.09+i*.046),h*.09,front+2,w*.012,h*.035,.7,frameHi,0xaab4b6);
  profile(scene,g,w/2,h-r*.2,d*.16,w-r*1.6,r*.36,d*.18,vent,0x7b898d);profile(scene,g,w/2,h-r*.2,d*.84,w-r*1.6,r*.36,d*.18,vent,0x7b898d);

  // Interior PBR surfaces.
  const soil=scene.v2Pbr('soil',{roughness:.98,repeatX:Math.max(1,w/65),repeatY:Math.max(1,d/65)});
  scene.box(g,w/2,h*.055,d*.5,w-r*2,h*.11,d-r*2,soil,false);
  const cork=scene.pmat('v2-cork',{color:lit?0x8d6a46:0x594733,map:scene.imageTexture('cork-bark-46.png',Math.max(1,w/80),Math.max(1,h/80)),bumpMap:scene.imageTexture('cork-bark-46.png',Math.max(1,w/80),Math.max(1,h/80)),bumpScale:1.3,roughness:.98});
  scene.box(g,w/2,h*.52,1.2,w-r*3,h*.84,1.8,cork,false);

  if(kind==='paludarium'){
    const water=scene.pmat('v2-water',{color:0x3c899a,roughness:.03,metalness:.02,transparent:true,opacity:.62,transmission:.42,ior:1.333,thickness:2,clearcoat:1,clearcoatRoughness:.02,depthWrite:false});
    scene.box(g,w*.42,h*.105,d*.58,w*.72,h*.12,d*.72,water,false);
    const bank=scene.v2Pbr('soil',{roughness:.98,repeatX:1,repeatY:1});scene.box(g,w*.79,h*.14,d*.45,w*.27,h*.16,d*.65,bank,false);
  }

  // Hardscape with real volume, not flat decoration.
  branch(scene,g,new THREE.Vector3(w*.17,h*.12,d*.72),new THREE.Vector3(w*.73,h*.68,d*.30),clamp(w*.022,1.2,2.7));
  branch(scene,g,new THREE.Vector3(w*.28,h*.13,d*.24),new THREE.Vector3(w*.78,h*.43,d*.68),clamp(w*.014,.9,2));
  if(kind==='vertical')branch(scene,g,new THREE.Vector3(w*.32,h*.08,d*.55),new THREE.Vector3(w*.42,h*.88,d*.36),clamp(w*.025,1.3,2.8));
  plantCluster(scene,g,w,h,d,kind==='vertical'?2:0);

  // Natural stones.
  const stone=scene.pmat('v2-stone',{color:0x55534c,roughness:.94});
  for(let n=0;n<7;n++){const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(clamp(w*(.025+(n%3)*.007),1.4,3.2),2),stone);rock.position.set(w*(.14+(n*.119)% .7),h*.095,d*(.2+(n%4)*.17));rock.scale.set(1.55,.68,1.1);rock.rotation.set(n*.31,n*.67,n*.17);rock.castShadow=rock.receiveShadow=true;g.add(rock);}

  if(lit){
    const housing=scene.pmat('v2-led-housing',{color:0x101416,roughness:.22,metalness:.9});const emit=scene.pmat('v2-led-emitter',{color:0xfff6e3,emissive:0xffb24f,emissiveIntensity:5.4,roughness:.12});
    profile(scene,g,w/2,h-r*1.3,d*.52,w*.78,2.5,5,housing,0x657277);profile(scene,g,w/2,h-r*1.7,d*.52,w*.7,.8,3.8,emit,0xffe0a3);
    const light=new THREE.PointLight(0xffc879,Math.max(18,w*h*.018),Math.max(w,d)*2.1,1.6);light.position.set(w/2,h*.78,d*.5);light.castShadow=false;g.add(light);
  }
  frontLabel(scene,g,block,w,h,d);return g;
}

function deskV2(i,s){const g=new THREE.Group(),wood=s.pmat('v2-desk-wood',{color:0x6b4930,map:s.texture('wood'),roughness:.4,clearcoat:.14}),steel=s.v2Pbr('metal',{color:0x30383b,roughness:.3,metalness:.88,repeatX:1,repeatY:2});profile(s,g,i.w/2,i.h-4,i.d/2,i.w,8,i.d,wood,0xa6794f);for(const x of [6,i.w-6])for(const z of [6,i.d-6])profile(s,g,x,(i.h-8)/2,z,5,i.h-8,5,steel,0x7e8a8e);profile(s,g,i.w/2,i.h*.45,5,i.w*.78,4,5,steel,0x7e8a8e);return g;}
function rackV2(i,s){const g=new THREE.Group(),steel=s.v2Pbr('metal',{color:0x3b4448,roughness:.28,metalness:.9,repeatX:1,repeatY:3});for(let n=0;n<6;n++)profile(s,g,i.w/2,4+n*(i.h-8)/5,i.d/2,i.w,4,i.d,steel,0x8d999d);for(const x of [3,i.w-3])for(const z of [3,i.d-3])profile(s,g,x,i.h/2,z,5,i.h,5,steel,0x8d999d);return g;}
function cabinetV2(i,s){const g=new THREE.Group(),body=s.pmat('v2-cabinet',{color:0x20272a,roughness:.34,metalness:.36}),edge=s.v2Pbr('metal',{color:0x596469,roughness:.25,metalness:.9});profile(s,g,i.w/2,i.h/2,i.d/2,i.w,i.h,i.d,body,0x5e6a6f);for(const y of [i.h*.27,i.h*.52,i.h*.77])profile(s,g,i.w/2,y,i.d+1,i.w*.86,2,2,edge,0x9aa5a8);profile(s,g,i.w*.79,i.h*.52,i.d+2,3,18,3,edge,0xc2cbcd);return g;}
function sinkV2(i,s){const g=deskV2(i,s),steel=s.v2Pbr('metal',{color:0xb0b7b9,roughness:.16,metalness:.96});profile(s,g,i.w/2,i.h+1,i.d*.52,i.w*.62,4,i.d*.56,s.pmat('v2-basin',{color:0x4e595d,roughness:.12,metalness:.98}),0xd3d9da);const stem=s.cyl(g,i.w*.76,i.h+16,i.d*.27,2,28,steel,32);stem.rotation.z=rad(-10);const sp=s.cyl(g,i.w*.69,i.h+28,i.d*.27,1.7,20,steel,32);sp.rotation.z=Math.PI/2;return g;}
function plantV2(i,s){const g=new THREE.Group(),pot=s.pmat('v2-pot',{color:0x51372b,roughness:.78});s.cyl(g,i.w/2,i.h*.11,i.d/2,i.w*.22,i.h*.22,pot,40);plantCluster(s,g,i.w,i.h,i.d,4);return g;}

export function buildAssetV2(i,s){
  if(i.type==='desk')return deskV2(i,s);if(i.type==='sink')return sinkV2(i,s);if(i.type==='shelf'||i.type==='cart')return rackV2(i,s);if(i.type==='cabinet')return cabinetV2(i,s);if(i.type==='plant')return plantV2(i,s);
  return null;
}
